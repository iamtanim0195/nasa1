"""
Earth Metamorphosis - Feni Flood Extraction
============================================
Product: Earth Metamorphosis
Team: Nova Matrics - VI
Author: Md. Shafaet Ullah
Event: NASA Space Apps Challenge 2026

This script:
1. Extracts HH/HV backscatter from two Feni dates
2. Converts to dB scale
3. Performs Change Detection for flood mapping
4. Generates visualizations
5. Exports GeoTIFFs + Lat/Lon coordinates
"""

import h5py
import numpy as np
import os
import sys
import glob
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import datetime

# Add backend to path for geotiff_exporter
sys.path.append(r"C:\Users\JM\NISAR_Project\backend\core")
from geotiff_exporter import export_feni_results


# ============================================================
# CONFIGURATION
# ============================================================
NISAR_DATA_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"
BASE_PATH = "science/LSAR/GCOV/grids/frequencyA/"

# Crop location (centered on Feni: 23.071°N, 91.423°E)
CROP_SIZE = 3000
Y_START = 5417
X_START = 10673

# Flood detection threshold (dB)
FLOOD_THRESHOLD = -3.0

# Product info
PRODUCT_NAME = "Earth Metamorphosis"
TEAM_NAME = "Nova Matrics - VI"

# Create output folder
FENI_FOLDER = os.path.join(OUTPUT_FOLDER, "feni")
os.makedirs(FENI_FOLDER, exist_ok=True)


# ============================================================
# HELPERS
# ============================================================
def print_header(title, char="="):
    width = 70
    print(f"\n{char * width}")
    print(f"{title.center(width)}")
    print(f"{char * width}")


def format_size(bytes_val):
    if bytes_val >= 1024**3:
        return f"{bytes_val / (1024**3):.2f} GB"
    return f"{bytes_val / (1024**2):.1f} MB"


# ============================================================
# EXTRACTION FUNCTION
# ============================================================
def extract_file(file_path):
    """Extract HH/HV backscatter for a specific file."""
    print(f"\n[*] Processing: {os.path.basename(file_path)}")
    print(f"    Size: {format_size(os.path.getsize(file_path))}")

    with h5py.File(file_path, "r") as f:
        hhhh_full = f[BASE_PATH + "HHHH"]
        full_shape = hhhh_full.shape
        print(f"    Full Shape: {full_shape}")

        y_end = min(full_shape[0], Y_START + CROP_SIZE)
        x_end = min(full_shape[1], X_START + CROP_SIZE)
        print(f"    Cropping: Y[{Y_START}:{y_end}], X[{X_START}:{x_end}]")

        hhhh = hhhh_full[Y_START:y_end, X_START:x_end]
        hvhv = f[BASE_PATH + "HVHV"][Y_START:y_end, X_START:x_end]

        start_time = f["science/LSAR/identification/zeroDopplerStartTime"][()].decode("utf-8")
        orbit_dir = f["science/LSAR/identification/orbitPassDirection"][()].decode("utf-8")
        track_num = int(f["science/LSAR/identification/trackNumber"][()])
        frame_num = int(f["science/LSAR/identification/frameNumber"][()])

        x_coords = f[BASE_PATH + "xCoordinates"][X_START:x_end]
        y_coords = f[BASE_PATH + "yCoordinates"][Y_START:y_end]
        projection = f[BASE_PATH + "projection"][()]

    print(f"    Orbit: {orbit_dir} | Track: {track_num} | Frame: {frame_num}")
    print(f"    Date: {start_time}")

    print(f"    Converting to dB...")
    hhhh_db = 10 * np.log10(np.where(hhhh > 0, hhhh, np.nan))
    hvhv_db = 10 * np.log10(np.where(hvhv > 0, hvhv, np.nan))

    valid_pct = 100 * np.count_nonzero(~np.isnan(hhhh_db)) / hhhh_db.size
    print(f"    Valid pixels: {valid_pct:.1f}%")
    print(f"    HH range: {np.nanmin(hhhh_db):.2f} to {np.nanmax(hhhh_db):.2f} dB")

    return {
        "file_name": os.path.basename(file_path),
        "date": start_time.split("T")[0],
        "datetime": start_time,
        "orbit": orbit_dir,
        "track": track_num,
        "frame": frame_num,
        "hhhh_db": hhhh_db,
        "hvhv_db": hvhv_db,
        "x_coords": x_coords,
        "y_coords": y_coords,
        "projection": int(projection),
    }


# ============================================================
# MAIN PIPELINE
# ============================================================
print_header(f"Earth Metamorphosis - Feni Flood Analysis")
print(f"Team: {TEAM_NAME}")
print(f"Event: NASA Space Apps Challenge 2026")
print(f"Challenge: Dancing with the SARs (NISAR)")
print_header("")

# Find Feni files
print("[*] Finding Feni NISAR files...")
h5_files = glob.glob(os.path.join(NISAR_DATA_FOLDER, "*.h5"))
feni_files = sorted([f for f in h5_files if "_091_" in os.path.basename(f)])

if len(feni_files) < 2:
    print(f"[X] Need at least 2 Feni files (Track 091), found {len(feni_files)}")
    sys.exit(1)

print(f"[OK] Found {len(feni_files)} Feni files:")
for f in feni_files:
    print(f"     - {os.path.basename(f)}")

# Extract
before = extract_file(feni_files[0])
after = extract_file(feni_files[1])

# Save .npy
print_header("Saving .NPY Files", "-")
before_id = before["date"].replace("-", "")
after_id = after["date"].replace("-", "")

np.save(os.path.join(FENI_FOLDER, f"feni_{before_id}_HHHH.npy"), before["hhhh_db"])
np.save(os.path.join(FENI_FOLDER, f"feni_{before_id}_HVHV.npy"), before["hvhv_db"])
np.save(os.path.join(FENI_FOLDER, f"feni_{after_id}_HHHH.npy"), after["hhhh_db"])
np.save(os.path.join(FENI_FOLDER, f"feni_{after_id}_HVHV.npy"), after["hvhv_db"])
np.save(os.path.join(FENI_FOLDER, "feni_x_coords.npy"), before["x_coords"])
np.save(os.path.join(FENI_FOLDER, "feni_y_coords.npy"), before["y_coords"])

print(f"[OK] Saved 6 .npy files to {FENI_FOLDER}")

# ============================================================
# CHANGE DETECTION
# ============================================================
print_header("Flood Change Detection", "-")
print(f"Threshold: {FLOOD_THRESHOLD} dB")

delta_hh = after["hhhh_db"] - before["hhhh_db"]
delta_hv = after["hvhv_db"] - before["hvhv_db"]

flood_mask_hh = delta_hh < FLOOD_THRESHOLD
flood_mask_hv = delta_hv < FLOOD_THRESHOLD
flood_mask = flood_mask_hh & flood_mask_hv

valid_mask = ~np.isnan(delta_hh)
flood_pixels = (flood_mask & valid_mask).sum()
# Save flood mask as .npy for later use
np.save(os.path.join(FENI_FOLDER, "feni_flood_mask.npy"), flood_mask.astype('uint8'))
np.save(os.path.join(FENI_FOLDER, "feni_delta_hh.npy"), delta_hh)
np.save(os.path.join(FENI_FOLDER, "feni_delta_hv.npy"), delta_hv)
print(f"[OK] Saved flood_mask.npy, delta_hh.npy, delta_hv.npy")
total_valid = valid_mask.sum()
flood_pct = 100 * flood_pixels / total_valid if total_valid > 0 else 0

print(f"\n[RESULTS]")
print(f"   Flooded pixels (HH):   {flood_mask_hh.sum():,}")
print(f"   Flooded pixels (HV):   {flood_mask_hv.sum():,}")
print(f"   Flooded pixels (Both): {flood_pixels:,}")
print(f"   Total valid:           {total_valid:,}")
print(f"   Flood Coverage:        {flood_pct:.2f}%")

# ============================================================
# VISUALIZATION
# ============================================================
print_header("Generating Visualization", "-")

fig, axes = plt.subplots(2, 3, figsize=(20, 13))

vmin_hh = np.nanpercentile(before["hhhh_db"], 2)
vmax_hh = np.nanpercentile(before["hhhh_db"], 98)

axes[0, 0].imshow(before["hhhh_db"], cmap="gray", vmin=vmin_hh, vmax=vmax_hh)
axes[0, 0].set_title(f"BEFORE Flood\n{before['date']} | Track {before['track']}, Frame {before['frame']}",
                     fontsize=11, fontweight="bold")
axes[0, 0].axis("off")

axes[0, 1].imshow(after["hhhh_db"], cmap="gray", vmin=vmin_hh, vmax=vmax_hh)
axes[0, 1].set_title(f"AFTER Flood\n{after['date']} | Track {after['track']}, Frame {after['frame']}",
                     fontsize=11, fontweight="bold")
axes[0, 1].axis("off")

im = axes[0, 2].imshow(delta_hh, cmap="RdBu_r", vmin=-10, vmax=10)
axes[0, 2].set_title("HH Change Map\n(Blue = Decrease = Flood)", fontsize=11, fontweight="bold")
axes[0, 2].axis("off")
plt.colorbar(im, ax=axes[0, 2], fraction=0.046, pad=0.04, label="dHH (dB)")

axes[1, 0].imshow(flood_mask, cmap="hot")
axes[1, 0].set_title(f"Detected Flood Mask\n({flood_pct:.1f}% coverage)", fontsize=11, fontweight="bold")
axes[1, 0].axis("off")

valid_delta = delta_hh[valid_mask]
axes[1, 1].hist(valid_delta.ravel(), bins=100, color="steelblue", edgecolor="black", alpha=0.7)
axes[1, 1].axvline(FLOOD_THRESHOLD, color="red", linestyle="--", linewidth=2,
                   label=f"Flood Threshold ({FLOOD_THRESHOLD} dB)")
axes[1, 1].set_xlabel("dHH (dB)", fontsize=11)
axes[1, 1].set_ylabel("Pixel Count", fontsize=11)
axes[1, 1].set_title("Backscatter Change Distribution", fontsize=11, fontweight="bold")
axes[1, 1].legend()
axes[1, 1].grid(True, alpha=0.3)

im = axes[1, 2].imshow(delta_hv, cmap="RdBu_r", vmin=-10, vmax=10)
axes[1, 2].set_title("HV Change Map", fontsize=11, fontweight="bold")
axes[1, 2].axis("off")
plt.colorbar(im, ax=axes[1, 2], fraction=0.046, pad=0.04, label="dHV (dB)")

plt.suptitle(f"Earth Metamorphosis | Feni Flood Analysis\n"
             f"Team: {TEAM_NAME} | NASA Space Apps Challenge 2026",
             fontsize=14, fontweight="bold", y=0.995)

plt.tight_layout()
output_png = os.path.join(FENI_FOLDER, "feni_flood_detection.png")
plt.savefig(output_png, dpi=150, bbox_inches="tight")
plt.close()
print(f"[OK] Saved: {output_png}")

# ============================================================
# EXPORT GEOTIFFs + LAT/LON
# ============================================================
flood_result = {
    "mask": flood_mask,
    "delta_hh": delta_hh,
    "stats": {
        "flood_pixels": int(flood_pixels),
        "total_valid_pixels": int(total_valid),
        "coverage_pct": round(float(flood_pct), 2),
        "severity": "Moderate" if flood_pct < 15 else "Severe",
    }
}

export_result = export_feni_results(
    output_folder=FENI_FOLDER,
    before_data=before,
    after_data=after,
    flood_result=flood_result
)

# ============================================================
# FINAL SUMMARY
# ============================================================
print_header("FENI PROCESSING COMPLETE", "=")
print(f"\nOutput Folder: {FENI_FOLDER}")
print(f"\nFiles Generated:")
print(f"   - feni_{before_id}_HHHH.npy")
print(f"   - feni_{before_id}_HVHV.npy")
print(f"   - feni_{after_id}_HHHH.npy")
print(f"   - feni_{after_id}_HVHV.npy")
print(f"   - feni_x_coords.npy")
print(f"   - feni_y_coords.npy")
print(f"   - feni_flood_detection.png")
print(f"   - feni_flood_mask.tif")
print(f"   - feni_change_map.tif")
print(f"   - feni_metadata.json")
print(f"\nFlood Coverage: {flood_pct:.2f}%")

if export_result.get("geocoords") and "error" not in export_result["geocoords"]:
    gc = export_result["geocoords"]
    print(f"\nValidation Coordinates (for Google Earth / QGIS):")
    print(f"   Center: ({gc['center']['lat']}, {gc['center']['lon']})")
    print(f"   Method: {gc.get('method', 'unknown')}")

print("\nNext Step: Open QGIS -> Add Raster Layer -> Load feni_flood_mask.tif")
print("=" * 70)