"""
GeoTIFF Exporter for Earth Metamorphosis
=========================================
Product: Earth Metamorphosis
Team: Nova Matrics - VI
Author: Md. Shafaet Ullah
Event: NASA Space Apps Challenge 2026

Exports SAR processing results as GeoTIFF files for QGIS visualization.
Also provides accurate lat/lon coordinates using pyproj.
"""

import numpy as np
import os
import json

try:
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.crs import CRS
    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False
    print("WARNING: rasterio not installed. Install: pip install rasterio")

try:
    from pyproj import Transformer
    PYPROJ_AVAILABLE = True
except ImportError:
    PYPROJ_AVAILABLE = False
    print("WARNING: pyproj not installed. Install: pip install pyproj")


# ============================================================
# COORDINATE CONVERSION
# ============================================================
def pixels_to_geocoords(x_coords, y_coords, projection_epsg=32645):
    """
    Convert projected UTM coordinates to lat/lon (WGS84).
    
    Uses pyproj for accurate conversion.
    Feni area is in UTM Zone 45N (EPSG:32645).
    
    Args:
        x_coords: array of Easting values (meters)
        y_coords: array of Northing values (meters)
        projection_epsg: EPSG code (default: 32645 = UTM Zone 45N)
    
    Returns:
        dict with 'center', 'bbox', 'corners', 'method'
    """
    if not PYPROJ_AVAILABLE:
        return {
            "error": "pyproj not installed. Run: pip install pyproj",
            "projection_epsg": projection_epsg,
        }

    # Create transformer: UTM -> WGS84 (lat/lon)
    transformer = Transformer.from_crs(
        f"EPSG:{projection_epsg}",
        "EPSG:4326",  # WGS84
        always_xy=True
    )

    # Get bounding coordinates
    x_min = float(np.min(x_coords))
    x_max = float(np.max(x_coords))
    y_min = float(np.min(y_coords))
    y_max = float(np.max(y_coords))

    # Convert 4 corners
    corners_projected = [
        (x_min, y_min),  # Bottom-Left  (SW)
        (x_max, y_min),  # Bottom-Right (SE)
        (x_max, y_max),  # Top-Right    (NE)
        (x_min, y_max),  # Top-Left     (NW)
    ]

    corners_latlon = []
    for x, y in corners_projected:
        lon, lat = transformer.transform(x, y)
        corners_latlon.append({
            "lat": round(float(lat), 6),
            "lon": round(float(lon), 6)
        })

    # Calculate center and bounding box
    lats = [c["lat"] for c in corners_latlon]
    lons = [c["lon"] for c in corners_latlon]

    center_lat = sum(lats) / len(lats)
    center_lon = sum(lons) / len(lons)

    return {
        "center": {
            "lat": round(center_lat, 6),
            "lon": round(center_lon, 6),
        },
        "bbox": {
            "north": round(max(lats), 6),
            "south": round(min(lats), 6),
            "east": round(max(lons), 6),
            "west": round(min(lons), 6),
        },
        "corners": {
            "bottom_left": corners_latlon[0],
            "bottom_right": corners_latlon[1],
            "top_right": corners_latlon[2],
            "top_left": corners_latlon[3],
        },
        "projection_epsg": projection_epsg,
        "method": "pyproj",
    }


# ============================================================
# GEOTIFF EXPORT
# ============================================================
def export_geotiff(data, output_path, x_coords, y_coords,
                   projection_epsg=32645, dtype=None):
    """
    Export a 2D numpy array as GeoTIFF with proper georeferencing.
    
    Args:
        data: 2D numpy array (e.g., HH backscatter in dB)
        output_path: Output .tif file path
        x_coords: X coordinates (Easting)
        y_coords: Y coordinates (Northing)
        projection_epsg: EPSG code
        dtype: Data type (auto-detect if None)
    
    Returns:
        output_path if successful, None otherwise
    """
    if not RASTERIO_AVAILABLE:
        print(f"  Skipping: {os.path.basename(output_path)} (rasterio not available)")
        return None

    # Auto-detect dtype
    if dtype is None:
        if data.dtype == bool:
            dtype = 'uint8'
            data = data.astype('uint8')
        elif np.issubdtype(data.dtype, np.floating):
            dtype = 'float32'
            data = data.astype('float32')
        else:
            dtype = str(data.dtype)

    # Calculate pixel resolution
    x_res = (x_coords[-1] - x_coords[0]) / (len(x_coords) - 1)
    y_res = (y_coords[-1] - y_coords[0]) / (len(y_coords) - 1)

    # Create transform from bounds
    # Note: y_coords might be descending (north to south)
    if y_coords[0] > y_coords[-1]:
        # Descending (typical for SAR images)
        top = y_coords[0] + abs(y_res) / 2
        bottom = y_coords[-1] - abs(y_res) / 2
    else:
        # Ascending
        top = y_coords[-1] + abs(y_res) / 2
        bottom = y_coords[0] - abs(y_res) / 2

    left = x_coords[0] - abs(x_res) / 2
    right = x_coords[-1] + abs(x_res) / 2

    transform = from_bounds(left, bottom, right, top,
                            data.shape[1], data.shape[0])

    # Write GeoTIFF
    with rasterio.open(
        output_path,
        'w',
        driver='GTiff',
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=dtype,
        crs=CRS.from_epsg(projection_epsg),
        transform=transform,
        nodata=np.nan if dtype == 'float32' else 0,
        compress='lzw'
    ) as dst:
        dst.write(data, 1)

    file_size_mb = os.path.getsize(output_path) / (1024 ** 2)
    print(f"  [OK] {os.path.basename(output_path)} ({file_size_mb:.2f} MB)")
    return output_path


# ============================================================
# MAIN EXPORT FUNCTION
# ============================================================
def export_feni_results(output_folder, before_data, after_data, flood_result):
    """
    Export complete Feni results:
    - 4 GeoTIFF files (Before HH, After HH, Flood Mask, Change Map)
    - Metadata JSON with lat/lon coordinates
    
    Args:
        output_folder: folder to save files
        before_data: dict with 'hhhh_db', 'x_coords', 'y_coords', etc.
        after_data: dict with 'hhhh_db', 'x_coords', 'y_coords', etc.
        flood_result: dict with 'mask', 'delta_hh', 'stats'
    
    Returns:
        dict with 'geotiff_folder', 'geocoords', 'metadata'
    """
    print("\n" + "=" * 60)
    print("EXPORTING FENI RESULTS")
    print("=" * 60)

    os.makedirs(output_folder, exist_ok=True)

    before_date = before_data["date"].replace("-", "")
    after_date = after_data["date"].replace("-", "")
    projection_epsg = before_data["projection"]

    print(f"\nProjection: EPSG:{projection_epsg}")
    print(f"Before: {before_date}")
    print(f"After:  {after_date}")

    # ========== 1. Export GeoTIFFs ==========
    print("\n[1/3] Exporting GeoTIFFs...")

    export_geotiff(
        before_data["hhhh_db"],
        os.path.join(output_folder, f"feni_{before_date}_HH.tif"),
        before_data["x_coords"], before_data["y_coords"],
        projection_epsg
    )

    export_geotiff(
        after_data["hhhh_db"],
        os.path.join(output_folder, f"feni_{after_date}_HH.tif"),
        after_data["x_coords"], after_data["y_coords"],
        projection_epsg
    )

    export_geotiff(
        flood_result["mask"].astype('uint8'),
        os.path.join(output_folder, "feni_flood_mask.tif"),
        before_data["x_coords"], before_data["y_coords"],
        projection_epsg,
        dtype='uint8'
    )

    export_geotiff(
        flood_result["delta_hh"],
        os.path.join(output_folder, "feni_change_map.tif"),
        before_data["x_coords"], before_data["y_coords"],
        projection_epsg,
        dtype='float32'
    )

    # ========== 2. Compute Lat/Lon ==========
    print("\n[2/3] Computing Lat/Lon coordinates...")

    geocoords = pixels_to_geocoords(
        before_data["x_coords"],
        before_data["y_coords"],
        projection_epsg
    )

    if geocoords and "error" not in geocoords:
        print("\n" + "=" * 60)
        print("VALIDATION COORDINATES")
        print("=" * 60)
        print(f"\nCenter Point:")
        print(f"   Latitude:  {geocoords['center']['lat']}")
        print(f"   Longitude: {geocoords['center']['lon']}")
        print(f"\nBounding Box:")
        print(f"   North: {geocoords['bbox']['north']}")
        print(f"   South: {geocoords['bbox']['south']}")
        print(f"   East:  {geocoords['bbox']['east']}")
        print(f"   West:  {geocoords['bbox']['west']}")
        print(f"\nCorners:")
        print(f"   Bottom-Left (SW):  {geocoords['corners']['bottom_left']}")
        print(f"   Bottom-Right (SE): {geocoords['corners']['bottom_right']}")
        print(f"   Top-Right (NE):    {geocoords['corners']['top_right']}")
        print(f"   Top-Left (NW):     {geocoords['corners']['top_left']}")
        print(f"\nMethod: {geocoords['method']}")
        print("=" * 60)
    else:
        print("  WARNING: Could not compute lat/lon coordinates.")
        if geocoords and "error" in geocoords:
            print(f"  Error: {geocoords['error']}")

    # ========== 3. Save Metadata JSON ==========
    print("\n[3/3] Saving metadata JSON...")

    metadata = {
        "product": "Earth Metamorphosis",
        "team": "Nova Matrics - VI",
        "event": "NASA Space Apps Challenge 2026",
        "mode": "flood",
        "location": "Feni, Bangladesh",
        "before_date": before_data["date"],
        "after_date": after_data["date"],
        "track": before_data["track"],
        "frame": before_data["frame"],
        "orbit": before_data["orbit"],
        "projection_epsg": projection_epsg,
        "flood_stats": flood_result["stats"],
        "geocoords": geocoords,
        "files": {
            "before_hh": f"feni_{before_date}_HH.tif",
            "after_hh": f"feni_{after_date}_HH.tif",
            "flood_mask": "feni_flood_mask.tif",
            "change_map": "feni_change_map.tif",
        },
        "processed_at": __import__('datetime').datetime.now().isoformat(),
    }

    metadata_path = os.path.join(output_folder, "feni_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"  [OK] {os.path.basename(metadata_path)}")

    return {
        "geotiff_folder": output_folder,
        "geocoords": geocoords,
        "metadata": metadata,
    }


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("GeoTIFF Exporter - Earth Metamorphosis")
    print("=" * 60)
    print("\nThis module is imported by feni_extract.py")
    print("\nStatus:")
    print(f"  rasterio: {'[OK] Available' if RASTERIO_AVAILABLE else '[X] Missing'}")
    print(f"  pyproj:   {'[OK] Available' if PYPROJ_AVAILABLE else '[X] Missing'}")

    if RASTERIO_AVAILABLE and PYPROJ_AVAILABLE:
        print("\nAll dependencies installed. Ready to use!")
    else:
        print("\nPlease install missing packages:")
        print("  pip install rasterio pyproj")