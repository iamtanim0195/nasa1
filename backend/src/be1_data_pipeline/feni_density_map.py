"""
Feni Density Map - Find Best Crop Location
===========================================
Team: Nova Matrics - VI
Author: Md. Shafaet Ullah

This script finds the data-rich region in the Feni NISAR file
(Track 091, Frame 077) so we know where to crop.
"""
import h5py
import numpy as np
import os
import glob
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# ================= CONFIG =================
NISAR_DATA_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"
BASE_PATH = "science/LSAR/GCOV/grids/frequencyA/"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Find the Feni BEFORE file (2026-07-02, Track 091)
h5_files = glob.glob(os.path.join(NISAR_DATA_FOLDER, "*.h5"))
feni_files = [f for f in h5_files if "_091_" in os.path.basename(f)]

if not feni_files:
    print("❌ No Feni (Track 091) files found!")
    exit()

file_path = sorted(feni_files)[0]  # First (earliest) Feni file
print(f"Processing: {os.path.basename(file_path)}\n")

# ================= DATA DENSITY MAP =================
with h5py.File(file_path, "r") as f:
    hhhh_ds = f[BASE_PATH + "HHHH"]
    full_shape = hhhh_ds.shape
    print(f"Full Image Shape: {full_shape}")
    
    # Downsample by 50
    step = 50
    print(f"Creating data density map (step={step})...")
    preview = hhhh_ds[::step, ::step]
    print(f"Preview Shape: {preview.shape}")
    
    # Binary mask
    valid_mask = (preview > 0).astype(np.uint8)
    data_pct = 100 * valid_mask.mean()
    print(f"\n✅ Data Coverage: {data_pct:.2f}% of preview has valid data")

# ================= VISUALIZE =================
fig, axes = plt.subplots(1, 2, figsize=(18, 8))

# Data density map
im1 = axes[0].imshow(valid_mask, cmap="hot", aspect="auto")
axes[0].set_title("Data Density Map (Bright=Data)", fontsize=14)
axes[0].set_xlabel(f"X axis (downsampled by {step})")
axes[0].set_ylabel(f"Y axis (downsampled by {step})")
plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)
axes[0].grid(True, alpha=0.3, color="cyan", linewidth=0.5)

# Raw preview
preview_clean = np.where(preview > 0, preview, np.nan)
with np.errstate(divide='ignore', invalid='ignore'):
    preview_db = 10 * np.log10(preview_clean)

im2 = axes[1].imshow(preview_db, cmap="gray", aspect="auto")
axes[1].set_title("HH Polarization Preview (dB)", fontsize=14)
axes[1].set_xlabel(f"X axis (downsampled by {step})")
axes[1].set_ylabel(f"Y axis (downsampled by {step})")
plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

plt.tight_layout()
output_png = os.path.join(OUTPUT_FOLDER, "feni_density_map.png")
plt.savefig(output_png, dpi=150, bbox_inches="tight")
plt.close()
print(f"\n✅ Saved: {output_png}")

# ================= FIND BEST CROP LOCATIONS =================
print("\n" + "=" * 60)
print("FINDING BEST CROP LOCATIONS FOR FENI")
print("=" * 60)

h, w = valid_mask.shape
CROP_SIZE_PREVIEW = 60  # 60x60 preview = 3000x3000 original
scan_step = 10

best_regions = []
for y in range(0, h - CROP_SIZE_PREVIEW, scan_step):
    for x in range(0, w - CROP_SIZE_PREVIEW, scan_step):
        region = valid_mask[y:y+CROP_SIZE_PREVIEW, x:x+CROP_SIZE_PREVIEW]
        density = region.mean()
        best_regions.append({
            "y_preview": y,
            "x_preview": x,
            "y_original": y * step,
            "x_original": x * step,
            "density": density
        })

best_regions.sort(key=lambda r: r["density"], reverse=True)

print(f"\n🏆 Top 5 Best Crop Locations (Highest Data Density):\n")
for i, region in enumerate(best_regions[:5], 1):
    print(f"--- Location #{i} ---")
    print(f"  Density: {region['density']*100:.1f}% data")
    print(f"  Preview (y, x): ({region['y_preview']}, {region['x_preview']})")
    print(f"  Original (Y_START, X_START): ({region['y_original']}, {region['x_original']})")
    print()

print("=" * 60)
print("Use these values in extract_backscatter.py for Feni:")
print(f"  Y_START = {best_regions[0]['y_original']}")
print(f"  X_START = {best_regions[0]['x_original']}")
print(f"  CROP_SIZE = 3000")
print("=" * 60)