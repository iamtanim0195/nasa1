import h5py
import numpy as np
import os
import glob
import matplotlib.pyplot as plt

# ================= CONFIG =================
nisar_data_folder = r"C:\Users\JM\NISAR_Project\nisar_data"
output_folder = r"C:\Users\JM\NISAR_Project\output"
os.makedirs(output_folder, exist_ok=True)

# Find the HDF5 file
h5_files = glob.glob(os.path.join(nisar_data_folder, "*.h5"))
if not h5_files:
    print("❌ No .h5 files found")
    exit()

file_path = h5_files[0]
print(f"Processing: {os.path.basename(file_path)}\n")

# ================= CREATE DATA DENSITY MAP =================
with h5py.File(file_path, "r") as f:
    base_path = "science/LSAR/GCOV/grids/frequencyA/"
    hhhh_ds = f[base_path + "HHHH"]
    full_shape = hhhh_ds.shape
    print(f"Full Image Shape: {full_shape}")
    
    # Downsample by taking every 50th pixel (memory efficient)
    step = 50
    print(f"Downsampling by factor of {step}...")
    preview = hhhh_ds[::step, ::step]
    print(f"Preview Shape: {preview.shape}")
    
    # Create a binary mask: 1 = data exists, 0 = no data
    valid_mask = (preview > 0).astype(np.uint8)
    
    # Calculate percentage
    data_pct = 100 * valid_mask.mean()
    print(f"\n✅ Data Coverage: {data_pct:.2f}% of preview has valid data")

# ================= VISUALIZE =================
fig, axes = plt.subplots(1, 2, figsize=(18, 8))

# Left: Data density map
im1 = axes[0].imshow(valid_mask, cmap="hot", aspect="auto")
axes[0].set_title("Data Density Map (Bright=Data, Dark=No Data)", fontsize=14)
axes[0].set_xlabel(f"X axis (downsampled by {step})")
axes[0].set_ylabel(f"Y axis (downsampled by {step})")
plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

# Add grid lines to help with coordinates
axes[0].grid(True, alpha=0.3, color="cyan", linewidth=0.5)

# Right: Raw preview (log scale)
preview_clean = np.where(preview > 0, preview, np.nan)
with np.errstate(divide='ignore', invalid='ignore'):
    preview_db = 10 * np.log10(preview_clean)

im2 = axes[1].imshow(preview_db, cmap="gray", aspect="auto")
axes[1].set_title("HH Polarization Preview (dB)", fontsize=14)
axes[1].set_xlabel(f"X axis (downsampled by {step})")
axes[1].set_ylabel(f"Y axis (downsampled by {step})")
plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

plt.tight_layout()
output_png = os.path.join(output_folder, "data_density_map.png")
plt.savefig(output_png, dpi=150, bbox_inches="tight")
plt.close()
print(f"\n✅ Saved: {output_png}")

# ================= FIND BEST CROP LOCATION =================
print("\n" + "=" * 60)
print("FINDING BEST CROP LOCATIONS")
print("=" * 60)

# The valid_mask is downsampled, so coordinates need to be multiplied by step
# to get original pixel coordinates
h, w = valid_mask.shape
CROP_SIZE_PREVIEW = 30  # 30x30 in preview = 1500x1500 in original

# Scan the image in a grid to find the best locations
best_regions = []
scan_step = 10

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

# Sort by density
best_regions.sort(key=lambda r: r["density"], reverse=True)

# Show top 5
print("\n🏆 Top 5 Best Crop Locations (Highest Data Density):\n")
for i, region in enumerate(best_regions[:5], 1):
    print(f"--- Location #{i} ---")
    print(f"  Density: {region['density']*100:.1f}% data")
    print(f"  Preview (y, x): ({region['y_preview']}, {region['x_preview']})")
    print(f"  Original (Y_START, X_START): ({region['y_original']}, {region['x_original']})")
    print()

print("=" * 60)
print("Use the 'Original (Y_START, X_START)' values in extract_backscatter.py")
print("=" * 60)