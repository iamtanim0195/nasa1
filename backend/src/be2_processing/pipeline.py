"""
NISAR BE2 Processing Pipeline
=============================
Author: Md. Shafaet Ullah (Nova Matrics - VI)
Team: Nova Matrics - VI | Programming Club
Event: NASA Space Apps Challenge 2026

This script handles the complete BE2 pipeline:
1. Load NISAR HDF5 file
2. Extract HH/HV backscatter layers
3. Convert to dB
4. Detect data-rich region
5. Crop and save as .npy
6. Export GeoTIFF (if rasterio available)
7. Create RGB false-color composite
"""

import h5py
import numpy as np
import os
import glob
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================
NISAR_DATA_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"

# Crop settings (based on data_density_map.png analysis)
CROP_SIZE = 5000
Y_START = 10000
X_START = 12500

# HDF5 internal path
BASE_PATH = "science/LSAR/GCOV/grids/frequencyA/"

# Create output folders
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(os.path.join(OUTPUT_FOLDER, "npy"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_FOLDER, "geotiff"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_FOLDER, "preview"), exist_ok=True)

print("=" * 70)
print("NISAR BE2 PROCESSING PIPELINE")
print("Nova Matrics - VI | NASA Space Apps Challenge 2026")
print("=" * 70)
print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()


# ============================================================
# HELPER FUNCTIONS
# ============================================================
def find_h5_file(folder):
    """Find the first .h5 file in the given folder."""
    h5_files = glob.glob(os.path.join(folder, "*.h5"))
    if not h5_files:
        raise FileNotFoundError(f"No .h5 files found in: {folder}")
    return h5_files[0]


def to_db(linear_data):
    """Convert linear backscatter to dB scale."""
    clean = np.where(linear_data > 0, linear_data, np.nan)
    with np.errstate(divide='ignore', invalid='ignore'):
        return 10 * np.log10(clean)


def print_array_stats(name, arr):
    """Print summary statistics for an array."""
    valid = arr[~np.isnan(arr)]
    if len(valid) == 0:
        print(f"  {name}: NO VALID DATA")
        return
    print(f"  {name}:")
    print(f"    Shape: {arr.shape}")
    print(f"    Min:   {np.nanmin(arr):.2f} dB")
    print(f"    Max:   {np.nanmax(arr):.2f} dB")
    print(f"    Mean:  {np.nanmean(arr):.2f} dB")
    print(f"    Valid: {100 * len(valid) / arr.size:.1f}%")


# ============================================================
# STEP 1: LOAD HDF5 FILE
# ============================================================
print("[Step 1/7] Loading NISAR HDF5 file...")
file_path = find_h5_file(NISAR_DATA_FOLDER)
file_name = os.path.basename(file_path)
file_size_gb = os.path.getsize(file_path) / (1024**3)

print(f"  File: {file_name}")
print(f"  Size: {file_size_gb:.2f} GB")
print()


# ============================================================
# STEP 2: EXTRACT BACKSCATTER LAYERS (CROPPED)
# ============================================================
print("[Step 2/7] Extracting backscatter layers (cropped)...")

with h5py.File(file_path, "r") as f:
    # Get full shape
    hhhh_ds = f[BASE_PATH + "HHHH"]
    full_shape = hhhh_ds.shape
    print(f"  Full Image Shape: {full_shape}")
    
    # Calculate crop boundaries
    y_end = min(full_shape[0], Y_START + CROP_SIZE)
    x_end = min(full_shape[1], X_START + CROP_SIZE)
    
    print(f"  Crop Region: Y[{Y_START}:{y_end}], X[{X_START}:{x_end}]")
    
    # Read cropped portions
    hhhh = hhhh_ds[Y_START:y_end, X_START:x_end]
    hvhv = f[BASE_PATH + "HVHV"][Y_START:y_end, X_START:x_end]
    
    # Read coordinates and projection
    x_coords = f[BASE_PATH + "xCoordinates"][X_START:x_end]
    y_coords = f[BASE_PATH + "yCoordinates"][Y_START:y_end]
    projection = f[BASE_PATH + "projection"][()]
    
    # Read metadata
    orbit_direction = f["science/LSAR/identification/orbitPassDirection"][()].decode("utf-8") \
        if "science/LSAR/identification/orbitPassDirection" in f else "UNKNOWN"
    start_time = f["science/LSAR/identification/zeroDopplerStartTime"][()].decode("utf-8") \
        if "science/LSAR/identification/zeroDopplerStartTime" in f else "UNKNOWN"

print(f"  HHHH Shape: {hhhh.shape}")
print(f"  HVHV Shape: {hvhv.shape}")
print(f"  Projection: EPSG:{projection}")
print(f"  Orbit Direction: {orbit_direction}")
print(f"  Acquisition Time: {start_time}")
print()


# ============================================================
# STEP 3: CONVERT TO dB
# ============================================================
print("[Step 3/7] Converting to dB scale...")
hhhh_db = to_db(hhhh)
hvhv_db = to_db(hvhv)

print_array_stats("HHHH (dB)", hhhh_db)
print_array_stats("HVHV (dB)", hvhv_db)
print()


# ============================================================
# STEP 4: SAVE AS .NPY FILES
# ============================================================
print("[Step 4/7] Saving as .npy files...")

npy_folder = os.path.join(OUTPUT_FOLDER, "npy")
base_name = "nisar_" + start_time.split("T")[0].replace("-", "")

np.save(os.path.join(npy_folder, f"{base_name}_HHHH_dB.npy"), hhhh_db)
np.save(os.path.join(npy_folder, f"{base_name}_HVHV_dB.npy"), hvhv_db)
np.save(os.path.join(npy_folder, f"{base_name}_x_coords.npy"), x_coords)
np.save(os.path.join(npy_folder, f"{base_name}_y_coords.npy"), y_coords)

print(f"  ✅ Saved {base_name}_HHHH_dB.npy")
print(f"  ✅ Saved {base_name}_HVHV_dB.npy")
print(f"  ✅ Saved {base_name}_x_coords.npy")
print(f"  ✅ Saved {base_name}_y_coords.npy")
print()


# ============================================================
# STEP 5: EXPORT GEOTIFF (if rasterio is available)
# ============================================================
print("[Step 5/7] Exporting to GeoTIFF...")

try:
    import rasterio
    from rasterio.transform import from_bounds
    
    geotiff_folder = os.path.join(OUTPUT_FOLDER, "geotiff")
    
    # Calculate transform
    x_res = (x_coords[-1] - x_coords[0]) / (len(x_coords) - 1)
    y_res = (y_coords[-1] - y_coords[0]) / (len(y_coords) - 1)
    transform = from_bounds(
        x_coords[0] - x_res / 2, y_coords[-1] - y_res / 2,
        x_coords[-1] + x_res / 2, y_coords[0] + y_res / 2,
        hhhh_db.shape[1], hhhh_db.shape[0]
    )
    
    # Save HHHH
    with rasterio.open(
        os.path.join(geotiff_folder, f"{base_name}_HHHH_dB.tif"),
        'w', driver='GTiff',
        height=hhhh_db.shape[0], width=hhhh_db.shape[1],
        count=1, dtype=hhhh_db.dtype,
        crs=f"EPSG:{projection}",
        transform=transform,
        nodata=np.nan,
        compress='lzw'
    ) as dst:
        dst.write(hhhh_db, 1)
    
    # Save HVHV
    with rasterio.open(
        os.path.join(geotiff_folder, f"{base_name}_HVHV_dB.tif"),
        'w', driver='GTiff',
        height=hvhv_db.shape[0], width=hvhv_db.shape[1],
        count=1, dtype=hvhv_db.dtype,
        crs=f"EPSG:{projection}",
        transform=transform,
        nodata=np.nan,
        compress='lzw'
    ) as dst:
        dst.write(hvhv_db, 1)
    
    print(f"  ✅ Saved {base_name}_HHHH_dB.tif")
    print(f"  ✅ Saved {base_name}_HVHV_dB.tif")
except ImportError:
    print("  ⚠️ rasterio not installed - skipping GeoTIFF export")
    print("  Install: pip install rasterio")
print()


# ============================================================
# STEP 6: CREATE PREVIEW IMAGES
# ============================================================
print("[Step 6/7] Creating preview images...")
preview_folder = os.path.join(OUTPUT_FOLDER, "preview")

# Preview 1: Standard HH/HV preview
fig, axes = plt.subplots(1, 2, figsize=(16, 7))
fig.suptitle(f"NISAR SAR Preview | {start_time.split('T')[0]} | Nova Matrics - VI", 
             fontsize=14, fontweight='bold')

vmin_hh, vmax_hh = np.nanpercentile(hhhh_db, [2, 98])
vmin_hv, vmax_hv = np.nanpercentile(hvhv_db, [2, 98])

im1 = axes[0].imshow(hhhh_db, cmap="gray", vmin=vmin_hh, vmax=vmax_hh)
axes[0].set_title("HH Polarization (dB)", fontsize=12)
axes[0].axis("off")
plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

im2 = axes[1].imshow(hvhv_db, cmap="gray", vmin=vmin_hv, vmax=vmax_hv)
axes[1].set_title("HV Polarization (dB)", fontsize=12)
axes[1].axis("off")
plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

plt.tight_layout()
plt.savefig(os.path.join(preview_folder, f"{base_name}_preview.png"), dpi=150, bbox_inches="tight")
plt.close()
print(f"  ✅ Saved {base_name}_preview.png")

# Preview 2: RGB False Color Composite
try:
    def normalize(arr, vmin, vmax):
        return np.clip((arr - vmin) / (vmax - vmin), 0, 1)
    
    r = normalize(hhhh_db, vmin_hh, vmax_hh)
    g = normalize(hvhv_db, vmin_hv, vmax_hv)
    b = normalize(hhhh_db - hvhv_db, 
                  np.nanpercentile(hhhh_db - hvhv_db, 2),
                  np.nanpercentile(hhhh_db - hvhv_db, 98))
    
    rgb = np.stack([r, g, b], axis=-1)
    rgb = np.nan_to_num(rgb, nan=0.0)
    
    plt.figure(figsize=(12, 10))
    plt.imshow(rgb)
    plt.title(f"NISAR False Color Composite (R=HH, G=HV, B=HH-HV) | {start_time.split('T')[0]}",
              fontsize=13, fontweight='bold')
    plt.axis("off")
    plt.tight_layout()
    plt.savefig(os.path.join(preview_folder, f"{base_name}_rgb_composite.png"), 
                dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  ✅ Saved {base_name}_rgb_composite.png")
except Exception as e:
    print(f"  ⚠️ RGB composite failed: {e}")
print()


# ============================================================
# STEP 7: SAVE METADATA (JSON)
# ============================================================
print("[Step 7/7] Saving metadata...")
import json

metadata = {
    "team": "Nova Matrics - VI",
    "event": "NASA Space Apps Challenge 2026",
    "challenge": "Dancing with the SARs",
    "file_name": file_name,
    "file_size_gb": round(file_size_gb, 2),
    "acquisition_time": start_time,
    "orbit_direction": orbit_direction,
    "projection_epsg": int(projection),
    "crop_settings": {
        "Y_START": Y_START,
        "X_START": X_START,
        "CROP_SIZE": CROP_SIZE
    },
    "image_shape": list(hhhh_db.shape),
    "processing_stats": {
        "hhhh_db_min": float(np.nanmin(hhhh_db)),
        "hhhh_db_max": float(np.nanmax(hhhh_db)),
        "hhhh_db_mean": float(np.nanmean(hhhh_db)),
        "hvhv_db_min": float(np.nanmin(hvhv_db)),
        "hvhv_db_max": float(np.nanmax(hvhv_db)),
        "hvhv_db_mean": float(np.nanmean(hvhv_db)),
        "valid_data_pct": float(100 * np.count_nonzero(~np.isnan(hhhh_db)) / hhhh_db.size)
    },
    "processed_at": datetime.now().isoformat()
}

with open(os.path.join(OUTPUT_FOLDER, f"{base_name}_metadata.json"), "w") as f:
    json.dump(metadata, f, indent=2)
print(f"  ✅ Saved {base_name}_metadata.json")
print()


# ============================================================
# SUMMARY
# ============================================================
print("=" * 70)
print("✅ BE2 PIPELINE COMPLETE!")
print("=" * 70)
print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()
print(f"📁 Output Directory: {OUTPUT_FOLDER}")
print(f"   ├── npy/          (NumPy data files)")
print(f"   ├── geotiff/      (QGIS-ready GeoTIFFs)")
print(f"   └── preview/      (PNG previews)")
print()
print("Ready for next steps:")
print("  - Change Detection (2nd date)")
print("  - AI Model Integration")
print("  - Web Dashboard")
print("=" * 70)