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
file_path = h5_files[0]

print(f"Processing: {os.path.basename(file_path)}\n")

with h5py.File(file_path, "r") as f:
    base_path = "science/LSAR/GCOV/grids/frequencyA/"
    
    # Get full shape
    hhhh_ds = f[base_path + "HHHH"]
    full_shape = hhhh_ds.shape
    print(f"Full Image Shape: {full_shape}")

    # ================= METHOD: Downsampled Quicklook =================
    # Read every Nth pixel to create a low-resolution preview
    # This avoids loading the full 4.3 GB image into RAM
    step = 20  # Take every 20th pixel (both rows and columns)
    
    print(f"\nDownsampling by factor of {step}...")
    hhhh_preview = hhhh_ds[::step, ::step]
    
    print(f"  Preview Shape: {hhhh_preview.shape}")
    print(f"  Min: {np.nanmin(hhhh_preview):.4f}, Max: {np.nanmax(hhhh_preview):.4f}")
    
    # Count non-zero pixels
    non_zero = np.count_nonzero(hhhh_preview)
    total = hhhh_preview.size
    print(f"  Non-zero pixels: {non_zero:,} out of {total:,} ({100*non_zero/total:.1f}%)")

    # Also get HVHV preview
    hvhv_ds = f[base_path + "HVHV"]
    hvhv_preview = hvhv_ds[::step, ::step]
    print(f"\n  HVHV Preview Shape: {hvhv_preview.shape}")
    print(f"  HVHV Min: {np.nanmin(hvhv_preview):.4f}, Max: {np.nanmax(hvhv_preview):.4f}")

# ================= CONVERT TO dB (Safely) =================
print("\nConverting to dB...")
hhhh_clean = np.where(hhhh_preview > 0, hhhh_preview, np.nan)
hvhv_clean = np.where(hvhv_preview > 0, hvhv_preview, np.nan)

with np.errstate(divide='ignore', invalid='ignore'):
    hhhh_db = 10 * np.log10(hhhh_clean)
    hvhv_db = 10 * np.log10(hvhv_clean)

print(f"  HHHH dB range: {np.nanmin(hhhh_db):.2f} to {np.nanmax(hhhh_db):.2f}")
print(f"  HVHV dB range: {np.nanmin(hvhv_db):.2f} to {np.nanmax(hvhv_db):.2f}")

# ================= VISUALIZE =================
print("\nGenerating preview...")
fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# HH
im1 = axes[0].imshow(hhhh_db, cmap="gray", aspect="auto")
axes[0].set_title(f"HH Polarization - Full Preview (step={step})")
axes[0].axis("off")
plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

# HV
im2 = axes[1].imshow(hvhv_db, cmap="gray", aspect="auto")
axes[1].set_title(f"HV Polarization - Full Preview (step={step})")
axes[1].axis("off")
plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

plt.tight_layout()
output_png = os.path.join(output_folder, "full_quicklook.png")
plt.savefig(output_png, dpi=150, bbox_inches="tight")
plt.close()
print(f"  Saved: {output_png}")

print("\n" + "=" * 60)
print("✅ QUICKLOOK COMPLETE!")
print("=" * 60)