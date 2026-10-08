"""
Results Router
==============
GET /api/results/{jobId}?detectionType=flood

Serves the REAL output of the processing pipeline rather than fixtures.

Source of truth:
  - output/<module>/<module>_metadata.json   (stats, geocoords, acquisition info)
  - output/<module>/<module>_*.npy           (masks / deltas, for chart series)

Heavy arrays are read once and cached in-process, keyed on the metadata file's
mtime, so a pipeline re-run is picked up automatically without a restart.

The response keeps the original `ResultDataset` shape so existing frontend
charts continue to work; every value is now derived from measured data.
"""
import json
import logging
import os
import threading
import time

import numpy as np
from fastapi import APIRouter, Query, Request

from api.services.envelope import envelope

logger = logging.getLogger("earth_metamorphosis.results")

router = APIRouter()

# backend/api/routers/results.py -> up 4 levels to the project root
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
OUTPUT_FOLDER = os.path.join(PROJECT_ROOT, "output")

# Detection type -> (artifact subfolder, metadata filename)
MODULE_ARTIFACTS = {
    "flood": ("feni", "feni_metadata.json"),
    "landslide": ("landslide", "landslide_metadata.json"),
}

# Cache: module -> {"stamp": (mtime, size), "payload": dict}
_CACHE = {}
_CACHE_LOCK = threading.Lock()


def _module_dir(module: str) -> str:
    sub, _ = MODULE_ARTIFACTS.get(module, (module, f"{module}_metadata.json"))
    return os.path.join(OUTPUT_FOLDER, sub)


def _metadata_path(module: str) -> str:
    sub, name = MODULE_ARTIFACTS.get(module, (module, f"{module}_metadata.json"))
    return os.path.join(OUTPUT_FOLDER, sub, name)


def _file_stamp(path: str):
    try:
        st = os.stat(path)
        return (int(st.st_mtime), st.st_size)
    except OSError:
        return None


def _load_npy(path: str):
    """Load an .npy, returning None when absent or unreadable."""
    if not os.path.exists(path):
        return None
    try:
        return np.load(path)
    except Exception as exc:
        logger.warning("Could not load %s: %s", path, exc)
        return None


def _pixel_area_km2(array_shape, x_coords, y_coords) -> float:
    """Ground area of one pixel, in km^2, measured from the coordinate axes."""
    try:
        x_res = abs(float(x_coords[1] - x_coords[0])) / 1000.0  # m -> km
        y_res = abs(float(y_coords[1] - y_coords[0])) / 1000.0
        if x_res > 0 and y_res > 0:
            return x_res * y_res
    except Exception:
        pass
    return 0.02 * 0.02  # NISAR GCOV L-band default: 20 m posting


def _severity_bands(delta_hh, mask):
    """Split detected-flood pixels by the magnitude of their HH drop."""
    if delta_hh is None or mask is None or not mask.any():
        return []
    drops = np.abs(delta_hh[mask])
    drops = drops[np.isfinite(drops)]
    if drops.size == 0:
        return []
    buckets = [
        ("Moderate (3-6 dB)", 3.0, 6.0),
        ("High (6-10 dB)", 6.0, 10.0),
        ("Critical (>10 dB)", 10.0, np.inf),
    ]
    return [
        {"label": label, "value": float(np.count_nonzero((drops >= lo) & (drops < hi)))}
        for label, lo, hi in buckets
    ]


# Tile-wise dual-polarisation agreement bands. Measured agreement on the Feni
# scene is low (~0.1: HH and HV independently flag mostly different pixels), so
# the bands deliberately span the full 0..1 range instead of assuming >=0.5.
AGREEMENT_BANDS = [(0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0001)]


def _band_label(lo: float, hi: float) -> str:
    return f"{lo:.1f}-{min(hi, 1.0):.1f}"


def _agreement_histogram(mask, delta_hh, delta_hv, tile=300):
    """
    Dual-polarisation agreement per tile, as a real confidence proxy.

    A tile where HH and HV independently flag the same pixels is trustworthy;
    a tile where only one polarisation fires is not. That agreement fraction is
    histogrammed into the frontend's confidence bands.
    """
    if mask is None or delta_hh is None or delta_hv is None:
        return []
    h, w = mask.shape
    th, tw = h // tile, w // tile
    if th < 1 or tw < 1:
        return []

    hh = (delta_hh < -3.0)[: th * tile, : tw * tile]
    hv = (delta_hv < -3.0)[: th * tile, : tw * tile]
    both = (hh & hv)
    changed = (hh | hv)

    def blocks(arr):
        return arr.reshape(th, tile, tw, tile).sum(axis=(1, 3))

    n_both, n_changed = blocks(both), blocks(changed)
    valid = n_changed > 0
    if not valid.any():
        return []
    agreement = (n_both[valid] / n_changed[valid]).ravel()

    return [
        {
            "label": _band_label(lo, hi),
            "value": int(np.count_nonzero((agreement >= lo) & (agreement < hi))),
        }
        for lo, hi in AGREEMENT_BANDS
    ]


def _distribution_from_stats(stats):
    """
    Bar-chart series for modules that do not persist npy arrays.

    Prefers a module-supplied `slopeBands` (landslide area by steepness) and
    falls back to a plain detected/unchanged split.
    """
    bands = stats.get("slopeBands")
    if bands:
        return [{"label": b["label"], "value": float(b["value"])} for b in bands]

    detected = stats.get("landslidePixels") or stats.get("floodPixels") or 0
    changed = stats.get("changePixels")
    if detected and changed:
        return [
            {"label": "Detected", "value": float(detected)},
            {"label": "Change, stable terrain", "value": float(max(changed - detected, 0))},
        ]
    if detected:
        return [{"label": "Detected", "value": float(detected)}]
    return []


def _build_module_payload(module: str, meta: dict) -> dict:
    """
    Derive the full ResultDataset payload from real artifacts.

    Two metadata layouts are supported:
      * `flood_stats` + `geocoords` — written by the offline feni_extract.py
      * `stats`                     — written by the API module handlers
    The npy-based enrichment only runs for flood, which is the module that
    persists mask/delta arrays.
    """
    folder = _module_dir(module)
    is_flood = module == "flood"

    mask = delta_hh = delta_hv = None
    x_coords = y_coords = None
    if is_flood:
        mask = _load_npy(os.path.join(folder, "feni_flood_mask.npy"))
        delta_hh = _load_npy(os.path.join(folder, "feni_delta_hh.npy"))
        delta_hv = _load_npy(os.path.join(folder, "feni_delta_hv.npy"))
        x_coords = _load_npy(os.path.join(folder, "feni_x_coords.npy"))
        y_coords = _load_npy(os.path.join(folder, "feni_y_coords.npy"))

        # The mask is persisted as uint8. Cast to bool so it can be used for
        # boolean indexing — `array[uint8_mask]` would otherwise be read as
        # integer fancy indexing and try to materialise a (H, W, H, W...) array.
        if mask is not None:
            mask = mask.astype(bool)

    stats = meta.get("stats") or meta.get("flood_stats") or {}
    geocoords = meta.get("geocoords") or {}

    px_km2 = stats.get("pixelAreaKm2")
    if not px_km2:
        px_km2 = _pixel_area_km2(getattr(mask, "shape", (0, 0)), x_coords, y_coords)

    pixel_count = int(
        stats.get("floodPixels")
        or stats.get("landslidePixels")
        or stats.get("flood_pixels")
        or 0
    )
    total_valid = int(stats.get("totalPixels") or stats.get("total_valid_pixels") or 0)

    affected_area_km2 = stats.get("affectedAreaKm2")
    if affected_area_km2 is None:
        affected_area_km2 = round(pixel_count * px_km2, 2)
    affected_area_km2 = round(float(affected_area_km2), 2)

    total_area_km2 = round(total_valid * px_km2, 2)

    # --- Category split ---
    categories = []
    if is_flood and mask is not None and delta_hh is not None and delta_hv is not None:
        fh = delta_hh < -3.0
        fv = delta_hv < -3.0
        pairs = [
            ("Flood (HH+HV)", fh & fv),
            ("HH-only change", fh & ~fv),
            ("HV-only change", fv & ~fh),
        ]
        categories = [
            {"label": label, "value": round(float(np.count_nonzero(m)) * px_km2, 2)}
            for label, m in pairs
        ]
    if not categories:
        unaffected = max(total_area_km2 - affected_area_km2, 0.0)
        categories = [
            {"label": module.title(), "value": affected_area_km2},
            {"label": "Unchanged", "value": round(unaffected, 2)},
        ]

    # --- Confidence bands (flood only: tile-wise dual-pol agreement) ---
    confidence_bands = (
        _agreement_histogram(mask, delta_hh, delta_hv) if is_flood else []
    )

    mean_confidence = stats.get("meanConfidence") or 0.0
    if confidence_bands:
        total_tiles = sum(b["value"] for b in confidence_bands) or 1
        midpoints = {_band_label(lo, hi): (lo + min(hi, 1.0)) / 2 for lo, hi in AGREEMENT_BANDS}
        mean_confidence = round(
            sum(b["value"] * midpoints.get(b["label"], 0.5) for b in confidence_bands)
            / total_tiles,
            3,
        )

    # --- Distribution ---
    distribution = (
        _severity_bands(delta_hh, mask) if is_flood else _distribution_from_stats(stats)
    )

    # --- Zone count ---
    event_count = int(stats.get("features") or 0)
    if not event_count and mask is not None and mask.size:
        h, w = mask.shape
        tile = 300
        th, tw = h // tile, w // tile
        if th >= 1 and tw >= 1:
            counts = mask[: th * tile, : tw * tile].reshape(th, tile, tw, tile).sum(axis=(1, 3))
            event_count = int(np.count_nonzero(counts > (0.02 * tile * tile)))

    before_date = meta.get("before_date") or meta.get("beforeDate")
    after_date = meta.get("after_date") or meta.get("afterDate")

    sub = os.path.basename(folder)
    geotiff = (f"/artifacts/{sub}/feni_flood_mask.tif" if is_flood
               else f"/artifacts/{sub}/{module}_mask.tif")
    preview = (f"/artifacts/{sub}/feni_flood_detection.png" if is_flood
               else f"/artifacts/{sub}/{module}_preview.png")

    return {
        "generatedAt": meta.get("processed_at") or time.strftime("%Y-%m-%dT%H:%M:%S"),
        "totalAreaKm2": total_area_km2,
        "eventCount": event_count,
        "meanConfidence": mean_confidence,
        "categories": categories,
        "distribution": distribution,
        # Only two acquisitions exist locally, so the timeline is honestly two
        # points: nothing at the before date, the measured area at the after.
        "timeline": [
            {"label": f"{before_date} (before)", "value": 0.0},
            {"label": f"{after_date} (after)", "value": affected_area_km2},
        ],
        "confidenceBands": confidence_bands,
        "jobId": None,  # filled in by the caller
        "detectionType": module,
        "geotiffUrl": geotiff,
        "previewUrl": preview,
        "metadata": {
            "beforeDate": before_date,
            "afterDate": after_date,
            "track": str(meta.get("track", "")).zfill(3),
            "frame": str(meta.get("frame", "")).zfill(3),
            "satellite": "NISAR",
            "instrument": "L-band SAR",
            "orbit": meta.get("orbit"),
            "projectionEpsg": meta.get("projection_epsg") or meta.get("projectionEpsg"),
            "coveragePct": stats.get("coveragePct") or stats.get("coverage_pct"),
            "severity": stats.get("severity"),
            "method": meta.get("method"),
            "slope": meta.get("slope"),
            "geocoords": geocoords,
            "pixelAreaKm2": px_km2,
            "confidenceMetric": (
                "Share of each 300x300-pixel tile's changed area that HH and HV "
                "independently agree on. Lower values mean the two polarisations "
                "disagree, not that the detection is unreliable."
            ) if is_flood else None,
            "zoneDefinition": "300x300-pixel tiles with >2% change",
        },
    }


def _get_cached_payload(module: str):
    """Return the derived payload, recomputing only when artifacts change."""
    meta_path = _metadata_path(module)
    if not os.path.exists(meta_path):
        return None

    stamp = _file_stamp(meta_path)
    with _CACHE_LOCK:
        cached = _CACHE.get(module)
        if cached and cached["stamp"] == stamp:
            return cached["payload"]

    try:
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = json.load(fh)
    except Exception as exc:
        logger.error("Could not read %s: %s", meta_path, exc)
        return None

    try:
        payload = _build_module_payload(module, meta)
    except Exception as exc:
        logger.exception("Failed to derive payload for %s: %s", module, exc)
        return None

    with _CACHE_LOCK:
        _CACHE[module] = {"stamp": stamp, "payload": payload}
    return payload


def _fallback_payload(module: str, job_id: str) -> dict:
    """Shape-stable placeholder so the frontend charts never receive undefined."""
    return {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalAreaKm2": 0.0,
        "eventCount": 0,
        "meanConfidence": 0.0,
        "categories": [],
        "distribution": [],
        "timeline": [],
        "confidenceBands": [],
        "jobId": job_id,
        "detectionType": module,
        "geotiffUrl": None,
        "previewUrl": None,
        "metadata": {},
        "available": False,
        "message": (
            f"No processed artifacts found for '{module}'. "
            f"Run the pipeline first (expected {_metadata_path(module)})."
        ),
    }


@router.get("/results/{job_id}")
async def get_results(
    request: Request,
    job_id: str,
    detectionType: str = Query("flood"),
):
    """
    Get results for a job, served from the real pipeline artifacts.

    `detectionType` selects the module output; it defaults to flood so existing
    callers keep working unchanged.
    """
    request_id = request.headers.get("x-request-id")

    payload = _get_cached_payload(detectionType)
    if payload is None:
        logger.warning("No artifacts for detectionType=%r (job=%s)", detectionType, job_id)
        payload = _fallback_payload(detectionType, job_id)
    else:
        payload = dict(payload)
        payload["jobId"] = job_id

    return envelope(payload, request_id=request_id)
