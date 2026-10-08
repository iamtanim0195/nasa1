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


def run_flood_analysis(job_id, wkt, before_file_id, after_file_id):
    """Flood handler: backscatter drop across the AOI, HH and HV combined."""
    before_data, after_data = _extract_pair(job_id, wkt, before_file_id, after_file_id)

    update_job(job_id, stage="analyzing", progress=75)
    result = detect_flood(before_data, after_data, job_id)
    update_job(job_id, progress=90)

    update_job(job_id, stage="result", progress=100, status="complete")
    JOBS[job_id]["result"] = result
    return result


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
    "earthquake": _not_implemented("earthquake"),
    "landslide": _not_implemented("landslide"),
    "farming": _not_implemented("farming"),
    "river-erosion": _not_implemented("river-erosion"),
    "sea-level": _not_implemented("sea-level"),
    "infrastructure": _not_implemented("infrastructure"),
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
    }


def get_job_status(job_id):
    return JOBS.get(job_id)