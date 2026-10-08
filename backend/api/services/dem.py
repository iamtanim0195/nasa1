"""
DEM / terrain helpers for the landslide and flood modules.

The landslide mask needs a slope filter, so this loads real SRTM elevation and
puts it on the SAR grid (EPSG:32646, 20 m) so the two masks can be intersected
pixel-for-pixel.

SRTM tiles are the 1-degree `.hgt` products (3601x3601, 30 m, EPSG:4326), stored
as `.hgt.zip` in `nisar_data/dem`. rasterio/GDAL reads those archives directly.
"""
import glob
import logging
import os
import re

import numpy as np

logger = logging.getLogger("earth_metamorphosis.dem")

DEM_DIR = r"C:\Users\JM\NISAR_Project\nisar_data\dem"

# SRTMGL1 is sampled at 1 arc-second.
ARCSEC_DEG = 1.0 / 3600.0
SRTM_TILE_PX = 3601

_TILE_RE = re.compile(r"([NS])(\d{2})([EW])(\d{3})")


def _tile_bounds(path):
    """'...N22E092...' -> (south, west, north, east) in degrees."""
    match = _TILE_RE.search(os.path.basename(path))
    if not match:
        return None
    ns, lat, ew, lon = match.groups()
    south = int(lat) * (1 if ns == "N" else -1)
    west = int(lon) * (1 if ew == "E" else -1)
    return south, west, south + 1, west + 1


def available_tiles(dem_dir=DEM_DIR):
    """Every readable SRTM tile on disk, as (path, south, west, north, east)."""
    out = []
    for pattern in ("*.hgt", "*.hgt.zip", "*.tif", "*.tiff"):
        for path in glob.glob(os.path.join(dem_dir, pattern)):
            bounds = _tile_bounds(path)
            if bounds:
                out.append((path, *bounds))
    return out


def load_dem_mosaic(west, south, east, north, dem_dir=DEM_DIR):
    """
    Mosaic the SRTM tiles covering a lon/lat bbox.

    Returns (elevation, transform, crs_epsg) where transform is an
    affine.Affine, or (None, None, None) when no tile covers the area.
    """
    import rasterio
    from rasterio.transform import from_origin

    tiles = [
        t for t in available_tiles(dem_dir)
        if t[2] < east and t[4] > west and t[1] < north and t[3] > south
    ]
    if not tiles:
        logger.warning("No SRTM tile covers bbox %s", (west, south, east, north))
        return None, None, None

    # Snap the mosaic to whole tile edges so placement is exact.
    lat_lo = min(t[1] for t in tiles)
    lat_hi = max(t[3] for t in tiles)
    lon_lo = min(t[2] for t in tiles)
    lon_hi = max(t[4] for t in tiles)

    n_rows = int(round((lat_hi - lat_lo) / ARCSEC_DEG)) + 1
    n_cols = int(round((lon_hi - lon_lo) / ARCSEC_DEG)) + 1
    mosaic = np.full((n_rows, n_cols), np.nan, dtype=np.float32)

    for path, t_south, t_west, t_north, t_east in tiles:
        try:
            with rasterio.open(path) as src:
                data = src.read(1).astype(np.float32)
                nodata = src.nodata
        except Exception as exc:
            logger.warning("Could not read DEM tile %s: %s", path, exc)
            continue

        if nodata is not None:
            data = np.where(data == nodata, np.nan, data)

        # Row 0 of an SRTM tile is its NORTH edge.
        row0 = int(round((lat_hi - t_north) / ARCSEC_DEG))
        col0 = int(round((t_west - lon_lo) / ARCSEC_DEG))
        h, w = data.shape
        r1, c1 = min(row0 + h, n_rows), min(col0 + w, n_cols)
        if r1 <= row0 or c1 <= col0:
            continue
        mosaic[row0:r1, col0:c1] = data[: r1 - row0, : c1 - col0]

    # from_origin takes the top-left corner.
    transform = from_origin(lon_lo, lat_hi, ARCSEC_DEG, ARCSEC_DEG)
    return mosaic, transform, 4326


def compute_slope_degrees(elevation, pixel_size_m):
    """
    Slope magnitude in degrees from a DEM, via central differences.

    `pixel_size_m` is the ground sample distance in metres (30 m for SRTMGL1).
    """
    if elevation is None or elevation.size == 0:
        return None

    filled = np.where(np.isfinite(elevation), elevation, np.nan)
    # np.gradient propagates NaN; fill holes with the local mean to keep the
    # slope continuous across voids without inventing detail.
    if np.isnan(filled).any():
        mean = np.nanmean(filled) if np.isfinite(filled).any() else 0.0
        filled = np.where(np.isnan(filled), mean, filled)

    dz_dy, dz_dx = np.gradient(filled, pixel_size_m, pixel_size_m)
    return np.degrees(np.arctan(np.hypot(dz_dx, dz_dy))).astype(np.float32)


def slope_on_sar_grid(sar_data, dem_dir=DEM_DIR):
    """
    Slope in degrees resampled onto a SAR window's grid.

    `sar_data` is an extract_backscatter() dict. Its window is projected to
    lon/lat to find the DEM, then the DEM slope is warped onto the SAR
    projection (EPSG:32646 for the Feni frame) at the SAR's own 20 m posting.

    Returns (slope_degrees, meta) or (None, meta) when no DEM is available.
    """
    from pyproj import Transformer
    from rasterio.crs import CRS
    from rasterio.transform import from_origin
    from rasterio.warp import Resampling, reproject

    x_coords = sar_data["x_coords"]
    y_coords = sar_data["y_coords"]
    epsg = sar_data.get("projection")
    height, width = sar_data["hhhh_db"].shape

    to_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    corners_x = [float(x_coords[0]), float(x_coords[-1]), float(x_coords[0]), float(x_coords[-1])]
    corners_y = [float(y_coords[0]), float(y_coords[0]), float(y_coords[-1]), float(y_coords[-1])]
    lons, lats = to_wgs.transform(corners_x, corners_y)
    west, east = min(lons), max(lons)
    south, north = min(lats), max(lats)

    elevation, dem_transform, dem_epsg = load_dem_mosaic(west, south, east, north, dem_dir)
    if elevation is None:
        return None, {"demAvailable": False, "reason": "no SRTM tile covers the AOI"}

    slope = compute_slope_degrees(elevation, 30.0)
    if slope is None:
        return None, {"demAvailable": False, "reason": "slope computation failed"}

    # SAR grid transform. y_coords descend (north -> south), matching a
    # north-up raster, so the pixel size is positive with a negative y step.
    dx = abs(float(x_coords[1] - x_coords[0]))
    dy = abs(float(y_coords[1] - y_coords[0]))
    left = float(x_coords[0]) - dx / 2.0
    top = float(y_coords[0]) + dy / 2.0
    dst_transform = from_origin(left, top, dx, dy)

    resampled = np.full((height, width), np.nan, dtype=np.float32)
    reproject(
        source=slope,
        destination=resampled,
        src_transform=dem_transform,
        src_crs=CRS.from_epsg(dem_epsg),
        dst_transform=dst_transform,
        dst_crs=CRS.from_epsg(epsg),
        resampling=Resampling.bilinear,
    )

    valid = np.isfinite(resampled)
    meta = {
        "demAvailable": True,
        "demSource": "SRTMGL1 (30 m)",
        "demTiles": [os.path.basename(t[0]) for t in available_tiles(dem_dir)],
        "slopeMinDeg": round(float(np.nanmin(resampled)), 2) if valid.any() else None,
        "slopeMaxDeg": round(float(np.nanmax(resampled)), 2) if valid.any() else None,
        "slopeMeanDeg": round(float(np.nanmean(resampled)), 2) if valid.any() else None,
        "slopeValidPct": round(100.0 * float(valid.sum()) / valid.size, 2),
        "elevationRangeM": [
            float(np.nanmin(elevation)) if np.isfinite(elevation).any() else None,
            float(np.nanmax(elevation)) if np.isfinite(elevation).any() else None,
        ],
    }
    return resampled, meta
