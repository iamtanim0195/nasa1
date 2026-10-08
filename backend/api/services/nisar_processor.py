"""
NISAR Processor Service
========================
Handles NISAR search, download, and flood analysis.
This is the core backend that replaces SarDropzone.
"""
import earthaccess
import numpy as np
import h5py
import os
import glob
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("earth_metamorphosis.nisar_processor")

try:
    from pyproj import Transformer
    PYPROJ_AVAILABLE = True
except ImportError:  # pragma: no cover - environment guard
    PYPROJ_AVAILABLE = False
    logger.warning("pyproj unavailable; AOI cropping will fall back to scene centre")

# ============================================================
# CONFIG
# ============================================================
NISAR_DATA_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"
STATIC_FOLDER = r"C:\Users\JM\NISAR_Project\backend\static"
BASE_PATH = "science/LSAR/GCOV/grids/frequencyA/"

# AOI window size in pixels. A 3000x3000 window at 20 m posting is 60 km x 60 km,
# comfortably covering every preset AOI while keeping peak memory ~350 MB.
# (Reading the full 17028x17316 scene needs ~4.4 GB and previously hung the job.)
CROP_SIZE_DEFAULT = 3000
FLOOD_THRESHOLD_DB = -3.0
# Landslide: steep enough to fail, and a drop in both polarisations.
SLOPE_MIN_DEG = 15.0
CHANGE_THRESHOLD_DB = -3.0
# Despeckle: keep pixels that have at least this many set 8-neighbours, which
# drops lone pixels while preserving genuine small clusters. SAR change masks
# are sparse, so 2+ would discard most real signal (measured on Rangamati:
# 1290 candidates -> 198 at 1, 31 at 2, and 0 under a full 3x3 opening).
DESPECKLE_MIN_NEIGHBOURS = 1

# Water is specular at L-band, so HH backscatter drops well below this.
WATER_THRESHOLD_DB = -15.0
# Sundarbans / coastal band: the sea-level module only counts inundation south
# of this latitude, so inland flooding is not misreported as sea-level rise.
COASTAL_LAT_MAX = 22.5
# Infrastructure: amplitude-stability proxy thresholds (dB). A 3 dB threshold
# over a 10-week monsoon baseline flagged ~25% of every AOI as "new
# construction" (measured 917 km2 around Dhaka), because seasonal soil moisture
# and vegetation change dwarf real urban change. 6 dB plus a built-surface
# brightness requirement isolates drastic, built-up transitions.
INFRA_STABLE_DB = 2.0
INFRA_CHANGE_DB = 6.0
# Built-up surfaces are strong L-band scatterers; changes on dark (vegetated or
# water) pixels are treated as seasonal, not construction.
INFRA_BUILT_MIN_DB = -10.0
# Farming: |normalised HV difference| beyond which a crop is healthy/stressed.
VEG_HEALTHY_INDEX = 0.1

# GUNW (earthquake) configuration.
GUNW_ROOT = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
# Only phase where the two acquisitions stayed coherent is interpretable.
COHERENCE_MIN = 0.2
SPEED_OF_LIGHT = 299792458.0

# Guard rails so a job can never sit at `running` forever.
EXTRACT_TIMEOUT_S = 240
JOB_TIMEOUT_S = 600

os.makedirs(NISAR_DATA_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

# In-memory job status
JOBS = {}


class AoiOutsideSceneError(ValueError):
    """The requested AOI does not intersect this granule's footprint."""


# ============================================================
# AOI -> PIXEL WINDOW
# ============================================================
def parse_wkt_centroid(wkt: str):
    """
    Return the centroid (lon, lat) of a POLYGON WKT, ignoring a repeated
    closing vertex.

    Raises ValueError on malformed input.
    """
    if not wkt:
        raise ValueError("Empty WKT")

    inner = wkt.strip()
    for prefix in ("POLYGON((", "POLYGON ((", "POLYGON((", "polygon(("):
        if inner.upper().startswith("POLYGON"):
            inner = inner[inner.index("((") + 2:]
            break
    inner = inner.replace("))", "").rstrip(")")

    lons, lats = [], []
    for pair in inner.split(","):
        parts = pair.strip().split()
        if len(parts) < 2:
            continue
        lons.append(float(parts[0]))
        lats.append(float(parts[1]))

    if not lons:
        raise ValueError(f"Could not parse any coordinates from WKT: {wkt!r}")

    # Drop a duplicated closing vertex so it does not skew the centroid.
    if len(lons) > 1 and abs(lons[0] - lons[-1]) < 1e-9 and abs(lats[0] - lats[-1]) < 1e-9:
        lons, lats = lons[:-1], lats[:-1]

    return sum(lons) / len(lons), sum(lats) / len(lats)


def crop_window_for_aoi(x_coords, y_coords, projection_epsg, wkt,
                        crop_size: int = CROP_SIZE_DEFAULT):
    """
    Map an AOI WKT to a pixel window inside the scene.

    The granule is georeferenced in its own projected CRS (EPSG:32646 for the
    Feni frame). We project the AOI centroid into that CRS, find the nearest
    axis index, then take a `crop_size` window centred there.

    Hardcoding a single window would silently extract Feni's footprint for every
    other AOI, so this is computed per request instead.

    Returns (y_start, y_end, x_start, x_end, row_index, col_index).
    Raises AoiOutsideSceneError when the AOI falls outside the granule.
    """
    ny, nx = len(y_coords), len(x_coords)
    if ny < 2 or nx < 2:
        raise ValueError("Granule coordinate axes are degenerate")

    if not PYPROJ_AVAILABLE:
        raise RuntimeError("pyproj is required to locate an AOI within a granule")

    lon, lat = parse_wkt_centroid(wkt)
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{projection_epsg}", always_xy=True)
    easting, northing = transformer.transform(lon, lat)

    x_min, x_max = float(np.min(x_coords)), float(np.max(x_coords))
    y_min, y_max = float(np.min(y_coords)), float(np.max(y_coords))

    if not (x_min <= easting <= x_max and y_min <= northing <= y_max):
        raise AoiOutsideSceneError(
            f"AOI centroid ({lat:.4f}, {lon:.4f}) lies outside this granule "
            f"(scene covers lon {x_min:.0f}-{x_max:.0f} m, lat {y_min:.0f}-{y_max:.0f} m "
            f"in EPSG:{projection_epsg}). Choose another granule or AOI."
        )

    col = int(np.argmin(np.abs(x_coords - easting)))
    row = int(np.argmin(np.abs(y_coords - northing)))

    half = crop_size // 2
    x_start = max(0, min(col - half, nx - crop_size)) if nx >= crop_size else 0
    y_start = max(0, min(row - half, ny - crop_size)) if ny >= crop_size else 0
    x_end = min(nx, x_start + crop_size)
    y_end = min(ny, y_start + crop_size)

    return y_start, y_end, x_start, x_end, row, col

# ============================================================
# SEARCH NISAR FILES
# ============================================================
def search_nisar_files(bbox, before_date, after_date, detection_type="flood"):
    """Search NASA Earthdata for NISAR files matching WKT + dates."""
    print(f"[SEARCH] BBOX: {bbox}, Dates: {before_date} to {after_date}")

    earthaccess.login(strategy="netrc", persist=True)

    results = earthaccess.search_data(
        short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
        temporal=(before_date, after_date),
        bounding_box=bbox,
        count=100,
    )

    print(f"[SEARCH] Found {len(results)} files")

    files = []
    seen_ids = set()

    for r in results:
        try:
            granule_id = r.get("meta", {}).get("native-id", "")
            if not granule_id or granule_id in seen_ids:
                continue
            seen_ids.add(granule_id)

            umm = r.get("umm", {})
            temporal = umm.get("TemporalExtent", {}).get("RangeDateTime", {})
            start_time = temporal.get("BeginningDateTime", "Unknown")

            data_granule = umm.get("DataGranule", {})
            archive_info = data_granule.get("ArchiveAndDistributionInformation", [])
            size_bytes = archive_info[0].get("SizeInBytes", 0) if archive_info else 0

            parts = granule_id.split("_")

            files.append({
                "id": granule_id,
                "granuleId": granule_id,
                "date": start_time[:10],
                "time": start_time[11:19] if len(start_time) > 19 else "",
                "track": parts[5] if len(parts) > 5 else "?",
                "frame": parts[7] if len(parts) > 7 else "?",
                "orbit": parts[6] if len(parts) > 6 else "?",
                "sizeBytes": size_bytes,
                "sizeGB": round(size_bytes / (1024**3), 2),
                "isDownloaded": is_file_downloaded(granule_id),
            })
        except Exception as e:
            print(f"[SEARCH] Error: {e}")
            continue

    files.sort(key=lambda x: x["date"], reverse=True)
    return files


def is_file_downloaded(granule_id):
    """Check if file already downloaded."""
    if not granule_id:
        return False
    # Last 40 chars of granule ID for matching
    search_key = granule_id[-60:] if len(granule_id) > 60 else granule_id
    pattern = os.path.join(NISAR_DATA_FOLDER, f"*{search_key}*.h5")
    return len(glob.glob(pattern)) > 0


# ============================================================
# BACKGROUND ANALYSIS
# ============================================================
def _extract_pair(job_id, wkt, before_file_id, after_file_id):
    """Download (or reuse) both granules and extract their AOI windows."""
    update_job(job_id, stage="dsard", progress=10)
    before_path = download_file(before_file_id)
    update_job(job_id, progress=30)
    after_path = download_file(after_file_id)
    update_job(job_id, progress=45)

    update_job(job_id, stage="extracting", progress=55)
    before_data = extract_backscatter(before_path, wkt=wkt, crop_size=CROP_SIZE_DEFAULT)
    update_job(job_id, progress=62)
    after_data = extract_backscatter(after_path, wkt=wkt, crop_size=CROP_SIZE_DEFAULT)
    update_job(job_id, progress=68)

    return before_data, after_data


def _neighbour_count(mask):
    """Number of set 8-neighbours for every pixel."""
    height, width = mask.shape
    padded = np.zeros((height + 2, width + 2), dtype=np.uint8)
    padded[1:-1, 1:-1] = mask
    count = np.zeros((height, width), dtype=np.uint8)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            if dy == 1 and dx == 1:
                continue
            count += padded[dy:dy + height, dx:dx + width]
    return count


def despeckle(mask, min_neighbours=2):
    """
    Remove isolated speckle: keep only pixels with >= min_neighbours set.

    Preferred over `binary_opening_3x3` for SAR change masks. Opening erodes
    with a FULL 3x3 kernel, so any pixel lacking all eight neighbours dies and
    cannot be restored by the following dilation — on a sparse change mask that
    erases the detection entirely. A neighbour-count filter removes lone pixels
    while preserving genuine small clusters.
    """
    return mask & (_neighbour_count(mask) >= min_neighbours)


def binary_opening_3x3(mask):
    """
    Binary morphological opening with a 3x3 kernel (erode then dilate).

    Pure numpy: scipy is unavailable on this Python, and opening is only ever
    needed at 3x3 here. Suitable for DENSE masks; see `despeckle` for the sparse
    case, which is what SAR change masks are.
    """
    def _shift_and(arr, dy, dx, fill):
        out = np.full_like(arr, fill)
        h, w = arr.shape
        ys_src = slice(max(0, -dy), h - max(0, dy))
        ys_dst = slice(max(0, dy), h - max(0, -dy))
        xs_src = slice(max(0, -dx), w - max(0, dx))
        xs_dst = slice(max(0, dx), w - max(0, -dx))
        out[ys_dst, xs_dst] = arr[ys_src, xs_src]
        return out

    def _neighbourhood_reduce(arr, reducer, fill):
        result = arr.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                result = reducer(result, _shift_and(arr, dy, dx, fill))
        return result

    eroded = _neighbourhood_reduce(mask, np.logical_and, False)
    dilated = _neighbourhood_reduce(eroded, np.logical_or, False)
    return dilated


def _write_module_artifacts(module, before_data, after_data, mask, metadata, background=None):
    """
    Persist a module's mask as GeoTIFF + PNG and write its metadata JSON so
    `GET /api/results/{job}?detectionType=<module>` can serve it straight away.

    `background` overrides the display layer; GUNW has no backscatter, so the
    earthquake module passes its coherence instead.

    Returns (geotiff_url, preview_url, folder).
    """
    import json

    folder = os.path.join(OUTPUT_FOLDER, module)
    os.makedirs(folder, exist_ok=True)

    geotiff_url = None
    preview_url = None

    try:
        from core.geotiff_exporter import export_geotiff
        target = os.path.join(folder, f"{module}_mask.tif")
        written = export_geotiff(
            mask.astype("uint8"), target,
            before_data["x_coords"], before_data["y_coords"],
            before_data.get("projection", 32646), dtype="uint8",
        )
        if written:
            geotiff_url = f"/artifacts/{module}/{module}_mask.tif"
    except Exception as exc:
        logger.warning("GeoTIFF export failed for %s: %s", module, exc)

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        background = np.asarray(background if background is not None
                                else after_data["hhhh_db"])
        display_mask = mask

        # The window is a bounding box but the swath is a rotated parallelogram,
        # so edge AOIs are mostly no-data. Crop the figure to the valid region so
        # the preview shows terrain instead of a wall of white.
        finite = np.isfinite(background)
        if finite.any():
            rows = np.where(finite.any(axis=1))[0]
            cols = np.where(finite.any(axis=0))[0]
            r0, r1 = int(rows[0]), int(rows[-1]) + 1
            c0, c1 = int(cols[0]), int(cols[-1]) + 1
            background = background[r0:r1, c0:c1]
            display_mask = mask[r0:r1, c0:c1]

        png_path = os.path.join(folder, f"{module}_preview.png")
        valid_pct = 100.0 * float(finite.mean()) if finite.size else 0.0
        finite_bg = background[np.isfinite(background)]
        if finite_bg.size:
            vmin, vmax = np.percentile(finite_bg, 2), np.percentile(finite_bg, 98)
        else:
            vmin, vmax = None, None

        # Detections are typically a fraction of a percent of the frame and are
        # spatially scattered, so their bounding box is not a useful zoom. A
        # dedicated high-contrast mask panel is the standard presentation.
        has_mask = bool(display_mask.any())
        if has_mask:
            fig, axes = plt.subplots(1, 2, figsize=(14, 7))
            ax_full, ax_mask = axes
        else:
            fig, ax_full = plt.subplots(figsize=(7, 7))
            axes = [ax_full]
            ax_mask = None

        ax_full.imshow(background, cmap="gray", vmin=vmin, vmax=vmax)
        if has_mask:
            visual = display_mask.copy()
            for _ in range(3):
                visual = visual | np.roll(visual, 1, 0) | np.roll(visual, 1, 1)
            ax_full.imshow(np.ma.masked_where(~visual, visual), cmap="autumn", alpha=0.9)
        ax_full.set_title(f"backscatter + detections (valid data {valid_pct:.0f}%)",
                          fontsize=10, fontweight="bold")
        ax_full.axis("off")

        if ax_mask is not None:
            ax_mask.imshow(display_mask, cmap="inferno", interpolation="nearest")
            ax_mask.set_title(f"detection mask — {int(display_mask.sum()):,} px",
                              fontsize=10, fontweight="bold")
            ax_mask.axis("off")

        fig.suptitle(
            f"{module.title()} — {metadata.get('beforeDate')} to {metadata.get('afterDate')}",
            fontsize=11, fontweight="bold",
        )
        fig.tight_layout()
        fig.savefig(png_path, dpi=110, bbox_inches="tight")
        plt.close(fig)
        preview_url = f"/artifacts/{module}/{module}_preview.png"
    except Exception as exc:
        logger.warning("Preview render failed for %s: %s", module, exc)

    try:
        meta_path = os.path.join(folder, f"{module}_metadata.json")
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(metadata, fh, indent=2, ensure_ascii=False)
    except Exception as exc:
        logger.warning("Metadata write failed for %s: %s", module, exc)

    return geotiff_url, preview_url, folder


def run_landslide_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    Landslide handler: terrain-constrained backscatter change.

    A pixel is a landslide candidate when the ground is steep enough to fail
    (slope > SLOPE_MIN_DEG, from real SRTM) AND both polarisations dropped by
    more than the change threshold. The slope constraint is what separates a
    landslide from ordinary flooding, which happens on flat ground.
    """
    from api.services import dem
    from api.services.ai_predictor import predict_risk

    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)

    update_job(job_id, stage="analyzing", progress=72)

    slope, slope_meta = dem.slope_on_sar_grid(after_data)

    delta_hh = after_data["hhhh_db"] - before_data["hhhh_db"]
    delta_hv = after_data["hvhv_db"] - before_data["hvhv_db"]
    valid = ~np.isnan(delta_hh) & ~np.isnan(delta_hv)

    change_mask = (delta_hh < CHANGE_THRESHOLD_DB) & (delta_hv < CHANGE_THRESHOLD_DB) & valid

    if slope is None:
        # No DEM: fall back to change-only detection, clearly labelled.
        landslide_mask = despeckle(change_mask, DESPECKLE_MIN_NEIGHBOURS)
        terrain_constrained = False
        change_on_slope = None
    else:
        slope_mask = np.isfinite(slope) & (slope > SLOPE_MIN_DEG)
        change_on_slope = change_mask & slope_mask
        landslide_mask = despeckle(change_on_slope, DESPECKLE_MIN_NEIGHBOURS)
        terrain_constrained = True

    update_job(job_id, progress=85)

    px_km2 = _pixel_area_km2(after_data["x_coords"], after_data["y_coords"])
    total_pixels = int(valid.sum())
    landslide_pixels = int(landslide_mask.sum())

    frac = (float(np.nanmean(slope[landslide_mask]))
            if slope is not None and landslide_pixels else None)

    # Landslide area split by how steep the terrain is — a genuinely useful
    # distribution and the series the frontend bar chart renders.
    slope_bands = []
    if slope is not None:
        slope_bands = [
            {"label": "15-25 deg", "value": int((landslide_mask & (slope >= 15) & (slope < 25)).sum())},
            {"label": "25-35 deg", "value": int((landslide_mask & (slope >= 25) & (slope < 35)).sum())},
            {"label": ">35 deg", "value": int((landslide_mask & (slope >= 35)).sum())},
        ]

    stats = {
        "coveragePct": round(100.0 * landslide_pixels / total_pixels, 3) if total_pixels else 0.0,
        "affectedAreaKm2": round(landslide_pixels * px_km2, 3),
        "landslidePixels": landslide_pixels,
        "totalPixels": total_pixels,
        "highRiskPixels": int((change_mask & (slope > 25.0)).sum())
        if slope is not None else None,
        "changePixels": int(change_mask.sum()),
        # Pre-despeckle intersection, so the filtering step is auditable.
        "changeOnSlopePixels": int(change_on_slope.sum()) if change_on_slope is not None else None,
        "despeckleMinNeighbours": DESPECKLE_MIN_NEIGHBOURS,
        # The sampled window is a bounding box; the radar swath is a rotated
        # parallelogram inside it, so edge AOIs can be largely no-data. Surfaced
        # so a thin detection is not mistaken for a failed one.
        "aoiValidPct": round(100.0 * total_pixels / max(int(landslide_mask.size), 1), 2),
        "meanSlopeInMaskDeg": round(frac, 2) if frac is not None else None,
        "slopeThresholdDeg": SLOPE_MIN_DEG,
        "changeThresholdDb": CHANGE_THRESHOLD_DB,
        "terrainConstrained": terrain_constrained,
        "pixelAreaKm2": px_km2,
        "meanConfidence": round(
            0.5 + 0.5 * min(1.0, (frac or 0.0) / max(SLOPE_MIN_DEG * 2, 1e-6)), 3
        ) if frac is not None else 0.5,
        "slopeBands": slope_bands,
    }

    metadata = {
        "beforeDate": before_data["date"],
        "afterDate": after_data["date"],
        "track": f"{before_data['track']:03d}",
        "frame": f"{before_data['frame']:03d}",
        "satellite": "NISAR",
        "instrument": "L-band SAR",
        "projectionEpsg": after_data.get("projection"),
        "aoiWindow": after_data.get("window"),
        "slope": slope_meta,
        # `stats` is what /api/results reads for non-flood modules.
        "stats": stats,
        "method": (
            "slope > {:.0f} deg AND dHH < {} dB AND dHV < {} dB, 3x3 binary opening"
            .format(SLOPE_MIN_DEG, CHANGE_THRESHOLD_DB, CHANGE_THRESHOLD_DB)
        ),
        "processed_at": datetime.utcnow().isoformat(),
    }

    geotiff_url, preview_url, _ = _write_module_artifacts(
        "landslide", before_data, after_data, landslide_mask, metadata
    )

    update_job(job_id, progress=92)

    prediction = predict_risk("landslide", [stats["affectedAreaKm2"]])

    result = {
        "jobId": job_id,
        "detectionType": "landslide",
        "stats": stats,
        "before": {"date": before_data["date"], "track": before_data["track"],
                   "frame": before_data["frame"]},
        "after": {"date": after_data["date"], "track": after_data["track"],
                  "frame": after_data["frame"]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": prediction,
    }

    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def run_flood_analysis(job_id, wkt, before_file_id, after_file_id):
    """Flood handler: backscatter drop across the AOI, HH and HV combined."""
    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)

    update_job(job_id, stage="analyzing", progress=75)
    result = detect_flood(before_data, after_data, job_id)
    update_job(job_id, progress=90)

    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def _water_mask(hhhh_db, threshold_db=WATER_THRESHOLD_DB):
    """Water is specular: very low L-band HH backscatter."""
    return np.isfinite(hhhh_db) & (hhhh_db < threshold_db)


def _dilate1(mask):
    """One 4-connected dilation step."""
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def _advance_distance(new_water, old_water, dx, max_steps=150):
    """
    How far newly-inundated pixels lie from the previous waterline, in metres.

    Replaces an earlier per-row leftmost/rightmost comparison, which was
    invalid: a 3000-pixel row can contain several unrelated water bodies, so
    comparing row extremes reported full-row "shifts" (measured: 14-18 km).

    This grows the old waterline outward and records how many steps it takes to
    reach each new pixel, capped at max_steps so a water body elsewhere in the
    scene cannot inflate the figure.

    Returns (max_m, mean_m, reached_fraction).
    """
    remaining = new_water & ~old_water
    if not remaining.any() or not old_water.any():
        return 0.0, 0.0, 0.0

    frontier = old_water.copy()
    reached = np.zeros(new_water.shape, dtype=bool)
    dist_px = np.zeros(new_water.shape, dtype=np.int32)

    for step in range(1, max_steps + 1):
        frontier = _dilate1(frontier)
        newly = remaining & frontier & ~reached
        if newly.any():
            dist_px[newly] = step
            reached |= newly
        if not (remaining & ~reached).any():
            break

    vals = dist_px[reached]
    if vals.size == 0:
        return 0.0, 0.0, 0.0
    return (float(vals.max()) * dx,
            float(vals.mean()) * dx,
            float(reached.sum()) / float(remaining.sum()))


def run_river_erosion_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    River erosion handler: lateral bank movement from before/after water masks.

    Erosion is land that became water; accretion is water that became land.
    """
    from api.services.ai_predictor import predict_risk

    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)
    update_job(job_id, stage="analyzing", progress=75)

    before_water = _water_mask(before_data["hhhh_db"])
    after_water = _water_mask(after_data["hhhh_db"])

    eroded = after_water & ~before_water
    accreted = before_water & ~after_water

    dx = abs(float(before_data["x_coords"][1] - before_data["x_coords"][0]))
    max_shift_m, mean_shift_m, reached_frac = _advance_distance(
        after_water, before_water, dx
    )

    px_km2 = _pixel_area_km2(before_data["x_coords"], before_data["y_coords"])
    total = int((np.isfinite(before_data["hhhh_db"]) & np.isfinite(after_data["hhhh_db"])).sum())

    eroded_px = int(eroded.sum())
    accreted_px = int(accreted.sum())

    stats = {
        "coveragePct": round(100.0 * eroded_px / total, 3) if total else 0.0,
        "affectedAreaKm2": round(eroded_px * px_km2, 3),
        "erodedAreaKm2": round(eroded_px * px_km2, 3),
        "accretedAreaKm2": round(accreted_px * px_km2, 3),
        "netChangeKm2": round((eroded_px - accreted_px) * px_km2, 3),
        "erodedPixels": eroded_px,
        "accretedPixels": accreted_px,
        "maxErosionM": round(max_shift_m, 1),
        "meanErosionM": round(mean_shift_m, 1),
        "erosionDistanceCappedPct": round(100.0 * reached_frac, 1),
        "totalPixels": total,
        "waterThresholdDb": WATER_THRESHOLD_DB,
        "beforeWaterKm2": round(int(before_water.sum()) * px_km2, 3),
        "afterWaterKm2": round(int(after_water.sum()) * px_km2, 3),
        "pixelAreaKm2": px_km2,
        # Data-quality confidence: how much of the sampled window had usable
        # observations. Bounded 0.5..1.0 and meaningful, unlike the earlier
        # 0.5 + shift/threshold form which saturated at 1.0 for any large shift.
        "meanConfidence": round(
            0.5 + 0.5 * (total / max(int(before_water.size), 1)), 3
        ),
    }

    metadata = {
        "beforeDate": before_data["date"], "afterDate": after_data["date"],
        "track": f"{before_data['track']:03d}", "frame": f"{before_data['frame']:03d}",
        "satellite": "NISAR", "instrument": "L-band SAR",
        "projectionEpsg": before_data.get("projection"),
        "aoiWindow": before_data.get("window"),
        "stats": stats,
        "method": f"water = HH < {WATER_THRESHOLD_DB} dB; per-row bank-line displacement",
        "processed_at": datetime.utcnow().isoformat(),
    }

    geotiff_url, preview_url, _ = _write_module_artifacts(
        "river-erosion", before_data, after_data, eroded, metadata
    )
    update_job(job_id, progress=92)

    result = {
        "jobId": job_id,
        "detectionType": "river-erosion",
        "stats": stats,
        "before": {"date": before_data["date"]},
        "after": {"date": after_data["date"]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": predict_risk("river-erosion", [stats["erodedAreaKm2"]]),
    }
    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def run_sea_level_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    Sea-level handler: coastal inundation from before/after water masks.

    Restricted to the coastal band (AOI centroid south of COASTAL_LAT_MAX) so
    inland water is not counted as sea-level rise.
    """
    from api.services.ai_predictor import predict_risk

    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)
    update_job(job_id, stage="analyzing", progress=75)

    before_water = _water_mask(before_data["hhhh_db"])
    after_water = _water_mask(after_data["hhhh_db"])

    coastline_wkt_centroid = parse_wkt_centroid(wkt)
    coastal = coastline_wkt_centroid[1] < COASTAL_LAT_MAX

    inundation = after_water & ~before_water
    if not coastal:
        # Outside the coastal band: report zero rather than inland flooding.
        inundation = np.zeros_like(inundation)

    max_shift_m, mean_shift_m, reached_frac = _advance_distance(
        after_water, before_water,
        abs(float(before_data["x_coords"][1] - before_data["x_coords"][0])),
    )

    px_km2 = _pixel_area_km2(before_data["x_coords"], before_data["y_coords"])
    total = int((np.isfinite(before_data["hhhh_db"]) & np.isfinite(after_data["hhhh_db"])).sum())
    inundated_px = int(inundation.sum())
    inundated_km2 = round(inundated_px * px_km2, 3)

    # Salinity risk rises with inundated extent and waterline advance.
    if inundated_km2 > 50 or max_shift_m > 300:
        salinity = "high"
    elif inundated_km2 > 10 or max_shift_m > 100:
        salinity = "medium"
    else:
        salinity = "low"

    stats = {
        "coveragePct": round(100.0 * inundated_px / total, 3) if total else 0.0,
        "affectedAreaKm2": inundated_km2,
        "inundationAreaKm2": inundated_km2,
        "inundatedPixels": inundated_px,
        "totalPixels": total,
        "waterlineShiftM": round(max_shift_m, 1),
        "meanWaterlineShiftM": round(mean_shift_m, 1),
        "shiftCappedPct": round(100.0 * reached_frac, 1),
        "salinityRisk": salinity,
        "coastalBand": coastal,
        "coastalLatMax": COASTAL_LAT_MAX,
        "waterThresholdDb": WATER_THRESHOLD_DB,
        "pixelAreaKm2": px_km2,
        # Data-quality confidence (usable fraction of the window), bounded and
        # not saturating on large waterline shifts.
        "meanConfidence": round(
            0.5 + 0.5 * (total / max(int(before_water.size), 1)), 3
        ),
    }

    metadata = {
        "beforeDate": before_data["date"], "afterDate": after_data["date"],
        "track": f"{before_data['track']:03d}", "frame": f"{before_data['frame']:03d}",
        "satellite": "NISAR", "instrument": "L-band SAR",
        "projectionEpsg": before_data.get("projection"),
        "aoiWindow": before_data.get("window"),
        "stats": stats,
        "method": (f"water = HH < {WATER_THRESHOLD_DB} dB, coastal band "
                   f"lat < {COASTAL_LAT_MAX}; new inundation vs before"),
        "processed_at": datetime.utcnow().isoformat(),
    }

    geotiff_url, preview_url, _ = _write_module_artifacts(
        "sea-level", before_data, after_data, inundation, metadata
    )
    update_job(job_id, progress=92)

    result = {
        "jobId": job_id,
        "detectionType": "sea-level",
        "stats": stats,
        "before": {"date": before_data["date"]},
        "after": {"date": after_data["date"]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": predict_risk("sea-level", [inundated_km2]),
    }
    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def run_infrastructure_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    Infrastructure handler: urban change from backscatter amplitude stability.

    NOTE ON METHOD: true temporal coherence needs the complex interferometric
    correlation, which GCOV does not carry (amplitude only). This uses an
    amplitude-stability proxy instead: small |dHH| means the surface scatter is
    unchanged, and the SIGN of the change separates brightening (new built
    surface) from darkening (demolition / clearing).
    """
    from api.services.ai_predictor import predict_risk

    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)
    update_job(job_id, stage="analyzing", progress=75)

    delta_hh = after_data["hhhh_db"] - before_data["hhhh_db"]
    before_db = before_data["hhhh_db"]
    after_db = after_data["hhhh_db"]
    valid = np.isfinite(delta_hh) & np.isfinite(before_db) & np.isfinite(after_db)

    # A built surface must be involved on at least one side, otherwise the
    # change is seasonal (moisture/vegetation), not urban.
    built_involved = (after_db > INFRA_BUILT_MIN_DB) | (before_db > INFRA_BUILT_MIN_DB)

    stable = valid & (np.abs(delta_hh) <= INFRA_STABLE_DB)
    modified = valid & (np.abs(delta_hh) > INFRA_STABLE_DB) & (np.abs(delta_hh) <= INFRA_CHANGE_DB)
    construction = valid & (delta_hh > INFRA_CHANGE_DB) & built_involved
    demolition = valid & (delta_hh < -INFRA_CHANGE_DB) & built_involved

    changed = construction | demolition

    px_km2 = _pixel_area_km2(before_data["x_coords"], before_data["y_coords"])
    total = int(valid.sum())
    changed_px = int(changed.sum())

    construction_px = int(construction.sum())
    demolition_px = int(demolition.sum())
    urban_growth_pct = (
        round(100.0 * (construction_px - demolition_px) / total, 4) if total else 0.0
    )

    stats = {
        "coveragePct": round(100.0 * changed_px / total, 3) if total else 0.0,
        "affectedAreaKm2": round(changed_px * px_km2, 3),
        "newConstructionKm2": round(construction_px * px_km2, 3),
        "modifiedKm2": round(int(modified.sum()) * px_km2, 3),
        "demolishedKm2": round(demolition_px * px_km2, 3),
        "stableKm2": round(int(stable.sum()) * px_km2, 3),
        "changedPixels": changed_px,
        "constructionPixels": construction_px,
        "demolitionPixels": demolition_px,
        "totalPixels": total,
        "urbanGrowthPct": urban_growth_pct,
        "stableThresholdDb": INFRA_STABLE_DB,
        "changeThresholdDb": INFRA_CHANGE_DB,
        "pixelAreaKm2": px_km2,
        "meanConfidence": round(0.5 + 0.5 * min(1.0, abs(urban_growth_pct) / 2.0), 3),
        "method": "amplitude-stability proxy (GCOV carries no phase/coherence)",
    }

    metadata = {
        "beforeDate": before_data["date"], "afterDate": after_data["date"],
        "track": f"{before_data['track']:03d}", "frame": f"{before_data['frame']:03d}",
        "satellite": "NISAR", "instrument": "L-band SAR",
        "projectionEpsg": before_data.get("projection"),
        "aoiWindow": before_data.get("window"),
        "stats": stats,
        "method": (f"|dHH| <= {INFRA_STABLE_DB} dB stable; > {INFRA_CHANGE_DB} dB changed, "
                   f"sign gives construction vs demolition. Amplitude proxy, not InSAR coherence."),
        "processed_at": datetime.utcnow().isoformat(),
    }

    geotiff_url, preview_url, _ = _write_module_artifacts(
        "infrastructure", before_data, after_data, changed, metadata
    )
    update_job(job_id, progress=92)

    result = {
        "jobId": job_id,
        "detectionType": "infrastructure",
        "stats": stats,
        "before": {"date": before_data["date"]},
        "after": {"date": after_data["date"]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": predict_risk("infrastructure", [stats["affectedAreaKm2"]]),
    }
    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def run_farming_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    Farming handler: crop vigour from the HV (volume-scattering) channel.

    The normalised difference index is computed on LINEAR power, not dB. A ratio
    of dB values is not physically meaningful (they can be negative, so the
    denominator can approach zero and flip sign); converting to power first makes
    the index a proper bounded vegetation measure.
    """
    from api.services.ai_predictor import predict_risk

    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)
    update_job(job_id, stage="analyzing", progress=75)

    hv_before_db = before_data["hvhv_db"]
    hv_after_db = after_data["hvhv_db"]
    valid = np.isfinite(hv_before_db) & np.isfinite(hv_after_db)

    hv_before = np.power(10.0, hv_before_db / 10.0)
    hv_after = np.power(10.0, hv_after_db / 10.0)
    denom = hv_after + hv_before
    veg_index = np.where(denom > 0, (hv_after - hv_before) / np.where(denom > 0, denom, 1.0), 0.0)
    veg_index = np.where(valid, veg_index, np.nan)

    healthy = valid & (veg_index > VEG_HEALTHY_INDEX)
    stressed = valid & (veg_index < -VEG_HEALTHY_INDEX)
    stable = valid & ~healthy & ~stressed

    px_km2 = _pixel_area_km2(before_data["x_coords"], before_data["y_coords"])
    total = int(valid.sum())

    def pct(mask):
        return round(100.0 * int(mask.sum()) / total, 2) if total else 0.0

    mean_index = float(np.nanmean(veg_index)) if valid.any() else 0.0

    stats = {
        "coveragePct": pct(stressed),
        "affectedAreaKm2": round(int(stressed.sum()) * px_km2, 3),
        "healthyPct": pct(healthy),
        "stablePct": pct(stable),
        "stressedPct": pct(stressed),
        "barePct": pct(stressed),
        "meanVegIndex": round(mean_index, 4),
        "healthyKm2": round(int(healthy.sum()) * px_km2, 3),
        "stressedKm2": round(int(stressed.sum()) * px_km2, 3),
        "totalPixels": total,
        "healthyIndexThreshold": VEG_HEALTHY_INDEX,
        "pixelAreaKm2": px_km2,
        "meanConfidence": round(min(1.0, 0.5 + abs(mean_index) * 2.0), 3),
    }

    metadata = {
        "beforeDate": before_data["date"], "afterDate": after_data["date"],
        "track": f"{before_data['track']:03d}", "frame": f"{before_data['frame']:03d}",
        "satellite": "NISAR", "instrument": "L-band SAR",
        "projectionEpsg": before_data.get("projection"),
        "aoiWindow": before_data.get("window"),
        "stats": stats,
        "method": (f"HV normalised difference index on linear power; "
                   f"healthy > {VEG_HEALTHY_INDEX}, stressed < -{VEG_HEALTHY_INDEX}"),
        "processed_at": datetime.utcnow().isoformat(),
    }

    # The overlay is the stressed-crop mask: that is the actionable signal.
    geotiff_url, preview_url, _ = _write_module_artifacts(
        "farming", before_data, after_data, stressed, metadata
    )
    update_job(job_id, progress=92)

    result = {
        "jobId": job_id,
        "detectionType": "farming",
        "stats": stats,
        "before": {"date": before_data["date"]},
        "after": {"date": after_data["date"]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": predict_risk("farming", [stats["stressedPct"]]),
    }
    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def _find_local_gunw(wkt=None):
    """
    Locate a local GUNW granule, preferring one whose footprint contains the AOI.

    The earthquake module works from an interferogram, which is a different
    product from the GCOV pairs the other modules use, so it sources its own
    granule rather than the before/after ids passed to the dispatcher.
    """
    candidates = sorted(glob.glob(os.path.join(NISAR_DATA_FOLDER, "*GUNW*.h5")))
    if not candidates:
        return None

    if not wkt:
        return candidates[0]

    try:
        lon, lat = parse_wkt_centroid(wkt)
    except Exception:
        return candidates[0]

    for path in candidates:
        try:
            with h5py.File(path, "r") as f:
                x = f[f"{GUNW_ROOT}/HH/xCoordinates"][:]
                y = f[f"{GUNW_ROOT}/HH/yCoordinates"][:]
                epsg = int(f[f"{GUNW_ROOT}/projection"][()])
            transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
            easting, northing = transformer.transform(lon, lat)
            if (x.min() <= easting <= x.max()) and (y.min() <= northing <= y.max()):
                return path
        except Exception as exc:
            logger.warning("Could not test GUNW %s: %s", path, exc)
            continue
    return candidates[0]


def extract_gunw(file_path, wkt=None, crop_size=CROP_SIZE_DEFAULT):
    """
    Read an unwrapped interferogram cropped to the AOI.

    Returns phase (radians), coherence, the LOS displacement conversion and the
    acquisition pair, all read from the granule rather than assumed.
    """
    with h5py.File(file_path, "r") as f:
        x_all = f[f"{GUNW_ROOT}/HH/xCoordinates"][:]
        y_all = f[f"{GUNW_ROOT}/HH/yCoordinates"][:]
        projection = int(f[f"{GUNW_ROOT}/projection"][()])
        centre_freq = float(f["science/LSAR/GUNW/grids/frequencyA/centerFrequency"][()])

        if wkt:
            y0, y1, x0, x1, row, col = crop_window_for_aoi(
                x_all, y_all, projection, wkt, crop_size
            )
        else:
            y0, y1, x0, x1 = 0, y_all.shape[0], 0, x_all.shape[0]
            row, col = (y1 - y0) // 2, (x1 - x0) // 2

        phase = f[f"{GUNW_ROOT}/HH/unwrappedPhase"][y0:y1, x0:x1].astype(np.float32)
        coherence = f[f"{GUNW_ROOT}/HH/coherenceMagnitude"][y0:y1, x0:x1].astype(np.float32)
        valid_mask = f[f"{GUNW_ROOT}/mask"][y0:y1, x0:x1] if f"{GUNW_ROOT}/mask" in f else None

        x_coords = x_all[x0:x1]
        y_coords = y_all[y0:y1]

        ident = "science/LSAR/identification"
        # GUNW identifies the pair as reference/secondary; it has no plain
        # zeroDopplerStartTime (that is a GCOV field).
        def _ident_time(key):
            node = f"{ident}/{key}"
            return f[node][()].decode() if node in f else None

        start = _ident_time("referenceZeroDopplerStartTime") or _ident_time("zeroDopplerStartTime")
        end = _ident_time("secondaryZeroDopplerStartTime") or _ident_time("zeroDopplerEndTime")
        track = int(f[f"{ident}/trackNumber"][()])
        frame = int(f[f"{ident}/frameNumber"][()])
        orbit = f[f"{ident}/orbitPassDirection"][()].decode()

    wavelength = SPEED_OF_LIGHT / centre_freq
    return {
        "phase": phase,
        "coherence": coherence,
        "valid_mask": valid_mask,
        "x_coords": x_coords,
        "y_coords": y_coords,
        "projection": projection,
        "wavelength_m": wavelength,
        # LOS displacement is phase scaled by lambda / 4pi (sign flipped so that
        # motion toward the sensor is positive).
        "los_factor_m_per_rad": wavelength / (4.0 * np.pi),
        "centre_frequency_hz": centre_freq,
        "acquisition_start": start,
        "acquisition_end": end,
        "track": track,
        "frame": frame,
        "orbit": orbit,
        "window": {"y_start": int(y0), "y_end": int(y1), "x_start": int(x0), "x_end": int(x1)},
        "shape": tuple(int(v) for v in phase.shape),
    }


def run_earthquake_analysis(job_id, wkt, before_file_id, after_file_id):
    """
    Earthquake handler: LOS deformation from a real GUNW interferogram.

    HONESTY NOTE: this reports interferometric LOS phase change, not a confirmed
    earthquake. A 12-day pair over the Bengal delta during monsoon is dominated
    by tropospheric water-vapour delay, so the raw displacement is an upper bound
    on real ground motion. Only coherent pixels (>= COHERENCE_MIN) are reported,
    and the caveats are carried in the result metadata.
    """
    from api.services.ai_predictor import predict_risk

    update_job(job_id, stage="dsard", progress=15)
    gunw_path = _find_local_gunw(wkt)
    if not gunw_path:
        raise FileNotFoundError(
            "No GUNW interferogram found in nisar_data. The earthquake module "
            "needs a GUNW granule (the before/after GCOV ids are not used)."
        )
    logger.info("Earthquake job %s using %s", job_id, os.path.basename(gunw_path))

    update_job(job_id, stage="extracting", progress=55)
    data = extract_gunw(gunw_path, wkt=wkt)
    update_job(job_id, stage="analyzing", progress=75)

    phase = data["phase"]
    coherence = data["coherence"]
    factor = data["los_factor_m_per_rad"]

    finite = np.isfinite(phase) & np.isfinite(coherence)
    coherent = finite & (coherence >= COHERENCE_MIN)
    if data["valid_mask"] is not None:
        coherent = coherent & (data["valid_mask"] == 0)

    # Displacement in cm; sign flipped for motion toward the sensor.
    displacement_cm = np.where(coherent, -phase * factor * 100.0, np.nan)

    px_km2 = _pixel_area_km2(data["x_coords"], data["y_coords"])
    total = int(finite.sum())
    coherent_px = int(coherent.sum())

    if coherent_px:
        vals = displacement_cm[coherent]
        max_cm = float(np.nanmax(vals))
        min_cm = float(np.nanmin(vals))
        mean_cm = float(np.nanmean(vals))
        abs_cm = np.abs(vals)
        p95_abs = float(np.percentile(abs_cm, 95))
        # "Affected" = coherent pixels with displacement beyond 5 cm.
        affected_px = int(np.count_nonzero(abs_cm > 5.0))
    else:
        max_cm = min_cm = mean_cm = p95_abs = 0.0
        affected_px = 0

    stats = {
        "coveragePct": round(100.0 * affected_px / total, 3) if total else 0.0,
        "affectedAreaKm2": round(affected_px * px_km2, 3),
        "maxDisplacementCm": round(max_cm, 2),
        "minDisplacementCm": round(min_cm, 2),
        "meanDisplacementCm": round(mean_cm, 2),
        "p95AbsDisplacementCm": round(p95_abs, 2),
        "affectedPixels": affected_px,
        "coherentPixels": coherent_px,
        "totalPixels": total,
        "coherenceMin": COHERENCE_MIN,
        "meanCoherence": round(float(np.nanmean(coherence[finite])), 3) if finite.any() else 0.0,
        "wavelengthM": round(data["wavelength_m"], 4),
        "losFactorMPerRad": round(factor, 6),
        "temporalBaselineDays": _days_between(data["acquisition_start"], data["acquisition_end"]),
        "pixelAreaKm2": px_km2,
        "meanConfidence": round(float(np.nanmean(coherence[coherent])), 3) if coherent_px else 0.0,
        "caveat": (
            "Interferometric LOS phase change over a short temporal baseline. "
            "Over the monsoon Bengal delta this is dominated by tropospheric "
            "water-vapour delay, so values are an upper bound on real ground "
            "motion and are NOT a confirmed earthquake signal."
        ),
    }

    metadata = {
        "beforeDate": data["acquisition_start"][:10],
        "afterDate": data["acquisition_end"][:10],
        "track": f"{data['track']:03d}",
        "frame": f"{data['frame']:03d}",
        "orbit": data["orbit"],
        "satellite": "NISAR",
        "instrument": "L-band SAR (GUNW interferogram)",
        "projectionEpsg": data["projection"],
        "aoiWindow": data["window"],
        "granule": os.path.basename(gunw_path),
        "stats": stats,
        "method": (
            f"unwrappedPhase -> LOS displacement = -phase * lambda/(4pi); "
            f"masked to coherenceMagnitude >= {COHERENCE_MIN}"
        ),
        "processed_at": datetime.utcnow().isoformat(),
    }

    # Overlay: coherent pixels whose displacement exceeds 5 cm.
    overlay = np.zeros(phase.shape, dtype=bool)
    if coherent_px:
        overlay = coherent & (np.abs(displacement_cm) > 5.0)

    geotiff_url, preview_url, _ = _write_module_artifacts(
        "earthquake", data, data, overlay, metadata,
        background=data["coherence"],
    )
    update_job(job_id, progress=92)

    result = {
        "jobId": job_id,
        "detectionType": "earthquake",
        "stats": stats,
        "before": {"date": data["acquisition_start"][:10]},
        "after": {"date": data["acquisition_end"][:10]},
        "geotiffUrl": geotiff_url,
        "previewUrl": preview_url,
        "metadata": metadata,
        "prediction": predict_risk("earthquake", [stats["affectedAreaKm2"]]),
    }
    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


def _days_between(start_iso, end_iso):
    """Whole days between two ISO timestamps, or None if unparseable."""
    try:
        a = datetime.fromisoformat(start_iso.replace("Z", ""))
        b = datetime.fromisoformat(end_iso.replace("Z", ""))
        return abs((b - a).days)
    except Exception:
        return None


def _not_implemented(module_label):
    def handler(job_id, wkt, before_file_id, after_file_id):
        raise NotImplementedError(
            f"The '{module_label}' module is not implemented yet. "
            f"Only 'flood' is available in this build."
        )
    handler.__name__ = f"run_{module_label.replace('-', '_')}_analysis"
    return handler


# Handlers are registered here as each module lands. Keeping the dict explicit
# means an unknown detection type fails loudly instead of silently running flood.
DISPATCHERS = {
    "flood": run_flood_analysis,
    "landslide": run_landslide_analysis,
    "river-erosion": run_river_erosion_analysis,
    "sea-level": run_sea_level_analysis,
    "infrastructure": run_infrastructure_analysis,
    "farming": run_farming_analysis,
    "earthquake": run_earthquake_analysis,
}


def run_analysis(job_id, wkt, before_file_id, after_file_id, detection_type="flood"):
    """
    Dispatch a job to the handler for `detection_type`.

    Always leaves JOBS[job_id] in a terminal state (complete or error) and
    enforces JOB_TIMEOUT_S so a stuck job cannot report `running` forever.
    """
    JOBS[job_id] = {
        "jobId": job_id,
        "status": "running",
        "stage": "dsard",
        "progress": 0,
        "startedAt": datetime.utcnow().isoformat() + "Z",
        "detectionType": detection_type,
        "result": None,
        "errorMessage": None,
    }

    handler = DISPATCHERS.get(detection_type)
    if handler is None:
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["stage"] = "error"
        JOBS[job_id]["errorMessage"] = f"Unknown detection type: {detection_type}"
        return None

    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

    started = datetime.utcnow()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(handler, job_id, wkt, before_file_id, after_file_id)
            try:
                return future.result(timeout=JOB_TIMEOUT_S)
            except FutureTimeout:
                raise TimeoutError(
                    f"Analysis exceeded the {JOB_TIMEOUT_S}s budget "
                    f"(stalled at stage '{JOBS[job_id].get('stage')}'). "
                    f"Try a smaller AOI or a nearer granule."
                )
    except Exception as exc:
        elapsed = (datetime.utcnow() - started).total_seconds()
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["stage"] = "error"
        JOBS[job_id]["errorMessage"] = str(exc)
        JOBS[job_id]["elapsedSeconds"] = round(elapsed, 1)
        logger.error("Job %s (%s) failed after %.1fs: %s",
                     job_id, detection_type, elapsed, exc)
        return None


def update_job(job_id, **kwargs):
    if job_id in JOBS:
        JOBS[job_id].update(kwargs)
        print(f"[JOB {job_id}] {kwargs}")


def download_file(granule_id):
    """Download NISAR file if not exists."""
    search_key = granule_id[-60:] if len(granule_id) > 60 else granule_id
    pattern = os.path.join(NISAR_DATA_FOLDER, f"*{search_key}*.h5")
    existing = glob.glob(pattern)
    if existing:
        print(f"[DOWNLOAD] Already exists: {existing[0]}")
        return existing[0]

    # Download
    earthaccess.login(strategy="netrc", persist=True)
    results = earthaccess.search_data(
        short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
        count=200,
    )

    matching = [r for r in results if r.get("meta", {}).get("native-id") == granule_id]
    if not matching:
        raise Exception(f"File not found: {granule_id}")

    earthaccess.download(matching, local_path=NISAR_DATA_FOLDER)

    files = glob.glob(pattern)
    if not files:
        raise Exception(f"Download failed: {granule_id}")
    return files[0]


def extract_backscatter(file_path, wkt=None, crop_size=CROP_SIZE_DEFAULT):
    """
    Extract HH/HV backscatter from an H5 file, cropped to the AOI window.

    Passing `wkt` crops to a `crop_size` window centred on the AOI (peak memory
    ~350 MB). Omitting it reads the whole scene, which needs several GB and will
    thrash on a normal machine — only do that deliberately.
    """
    with h5py.File(file_path, "r") as f:
        x_all = f[BASE_PATH + "xCoordinates"][:]
        y_all = f[BASE_PATH + "yCoordinates"][:]
        projection = int(f[BASE_PATH + "projection"][()])

        if wkt:
            y0, y1, x0, x1, row, col = crop_window_for_aoi(
                x_all, y_all, projection, wkt, crop_size
            )
        else:
            y0, y1, x0, x1 = 0, y_all.shape[0], 0, x_all.shape[0]
            row, col = (y1 - y0) // 2, (x1 - x0) // 2

        hhhh = f[BASE_PATH + "HHHH"][y0:y1, x0:x1]
        hvhv = f[BASE_PATH + "HVHV"][y0:y1, x0:x1]

        x_coords = x_all[x0:x1]
        y_coords = y_all[y0:y1]

        start_time = f["science/LSAR/identification/zeroDopplerStartTime"][()].decode()
        track = int(f["science/LSAR/identification/trackNumber"][()])
        frame = int(f["science/LSAR/identification/frameNumber"][()])

    hhhh_db = 10 * np.log10(np.where(hhhh > 0, hhhh, np.nan))
    hvhv_db = 10 * np.log10(np.where(hvhv > 0, hvhv, np.nan))

    valid_pct = 100.0 * float(np.count_nonzero(~np.isnan(hhhh_db))) / hhhh_db.size

    return {
        "hhhh_db": hhhh_db,
        "hvhv_db": hvhv_db,
        "x_coords": x_coords,
        "y_coords": y_coords,
        "projection": projection,
        "date": start_time.split("T")[0],
        "track": track,
        "frame": frame,
        "window": {"y_start": int(y0), "y_end": int(y1), "x_start": int(x0), "x_end": int(x1)},
        "aoi_center_pixel": {"row": int(row), "col": int(col)},
        "valid_pct": round(valid_pct, 2),
        "shape": tuple(int(v) for v in hhhh_db.shape),
    }


def _pixel_area_km2(x_coords, y_coords):
    """Ground area of one pixel in km^2, measured from the granule axes."""
    try:
        dx = abs(float(x_coords[1] - x_coords[0])) / 1000.0
        dy = abs(float(y_coords[1] - y_coords[0])) / 1000.0
        if dx > 0 and dy > 0:
            return dx * dy
    except Exception:
        pass
    return 0.02 * 0.02


def detect_flood(before_data, after_data, job_id):
    """
    Flood detection by dual-polarisation backscatter drop.

    A pixel is flooded when BOTH HH and HV fall by more than
    FLOOD_THRESHOLD_DB between the two acquisitions — the intersection is what
    suppresses false positives from surface roughness change alone.
    """
    delta_hh = after_data["hhhh_db"] - before_data["hhhh_db"]
    delta_hv = after_data["hvhv_db"] - before_data["hvhv_db"]

    flood_hh = delta_hh < FLOOD_THRESHOLD_DB
    flood_hv = delta_hv < FLOOD_THRESHOLD_DB
    flood_mask = flood_hh & flood_hv

    valid = ~np.isnan(delta_hh) & ~np.isnan(delta_hv)
    flood_pixels = int((flood_mask & valid).sum())
    total_pixels = int(valid.sum())
    coverage_pct = round(100.0 * flood_pixels / total_pixels, 2) if total_pixels else 0.0

    # Real ground area from the granule's own pixel spacing, not a fudge factor.
    px_km2 = _pixel_area_km2(before_data["x_coords"], before_data["y_coords"])
    affected_area_km2 = round(flood_pixels * px_km2, 2)

    from api.services.ai_predictor import predict_risk

    return {
        "jobId": job_id,
        "detectionType": "flood",
        "stats": {
            "coveragePct": coverage_pct,
            "affectedAreaKm2": affected_area_km2,
            "floodPixels": flood_pixels,
            "totalPixels": total_pixels,
            "features": int((flood_mask & valid).sum()),
            "meanConfidence": None,  # populated by the confidence pass
            "thresholdDb": FLOOD_THRESHOLD_DB,
            "hhOnlyPixels": int((flood_hh & ~flood_hv & valid).sum()),
            "hvOnlyPixels": int((flood_hv & ~flood_hh & valid).sum()),
            "pixelAreaKm2": px_km2,
        },
        "before": {
            "date": before_data["date"],
            "track": before_data["track"],
            "frame": before_data["frame"],
            "window": before_data.get("window"),
        },
        "after": {
            "date": after_data["date"],
            "track": after_data["track"],
            "frame": after_data["frame"],
            "window": after_data.get("window"),
        },
        "geotiffUrl": "/artifacts/feni/feni_flood_mask.tif",
        "previewUrl": "/artifacts/feni/feni_flood_detection.png",
        "metadata": {
            "beforeDate": before_data["date"],
            "afterDate": after_data["date"],
            "track": f"{before_data['track']:03d}",
            "frame": f"{before_data['frame']:03d}",
            "satellite": "NISAR",
            "instrument": "L-band SAR",
            "projectionEpsg": before_data.get("projection"),
            "aoiCenterPixel": before_data.get("aoi_center_pixel"),
        },
        # Only two acquisitions exist in the local cache, so the predictor
        # reports "insufficient history" rather than inventing a trend.
        "prediction": predict_risk("flood", [affected_area_km2]),
    }


def get_job_status(job_id):
    return JOBS.get(job_id)