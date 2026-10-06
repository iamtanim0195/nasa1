import h5py
import numpy as np
import os
import glob
import matplotlib.pyplot as plt

# ================= CONFIG =================
nisar_data_folder = r"C:\Users\JM\NISAR_Project\nisar_data"
output_folder = r"C:\Users\JM\NISAR_Project\output"
os.makedirs(output_folder, exist_ok=True)

# Crop settings
CROP_SIZE = 5000
Y_START = 10000     # Data-Strip-এর মাঝখানে (Preview Y=200)
X_START = 12500     # Data-Strip-এর মাঝখানে (Preview X=250)

# Find the HDF5 file
h5_files = glob.glob(os.path.join(nisar_data_folder, "*.h5"))
if not h5_files:
    print(f"❌ No .h5 files found in: {nisar_data_folder}")
    exit()

file_path = h5_files[0]
print(f"Processing: {os.path.basename(file_path)}")
print(f"File Size: {os.path.getsize(file_path) / (1024**3):.2f} GB\n")

# ================= EXTRACT CROPPED DATA =================
with h5py.File(file_path, "r") as f:
    base_path = "science/LSAR/GCOV/grids/frequencyA/"
    
    # Get full shape
    hhhh_full = f[base_path + "HHHH"]
    full_shape = hhhh_full.shape
    print(f"Full Image Shape: {full_shape}")
    print(f"Full Image Pixels: {full_shape[0] * full_shape[1]:,}")
    
    # Calculate crop boundaries
    y_start = Y_START
    x_start = X_START
    y_end = min(full_shape[0], y_start + CROP_SIZE)
    x_end = min(full_shape[1], x_start + CROP_SIZE)
    
    print(f"\nCropping to: {y_end - y_start} x {x_end - x_start} pixels")
    print(f"  Y range: {y_start} to {y_end}")
    print(f"  X range: {x_start} to {x_end}")
    
    # Read only the cropped portion (memory efficient)
    print("\nExtracting cropped HHHH layer...")
    hhhh = hhhh_full[y_start:y_end, x_start:x_end]
    print(f"  Shape: {hhhh.shape}")
    print(f"  Min: {np.nanmin(hhhh):.4f}, Max: {np.nanmax(hhhh):.4f}")
    
    print("\nExtracting cropped HVHV layer...")
    hvhv = f[base_path + "HVHV"][y_start:y_end, x_start:x_end]
    print(f"  Shape: {hvhv.shape}")
    print(f"  Min: {np.nanmin(hvhv):.4f}, Max: {np.nanmax(hvhv):.4f}")
    
    print("\nExtracting cropped coordinates...")
    x_coords = f[base_path + "xCoordinates"][x_start:x_end]
    y_coords = f[base_path + "yCoordinates"][y_start:y_end]
    print(f"  X range: {x_coords[0]:.2f} to {x_coords[-1]:.2f}")
    print(f"  Y range: {y_coords[0]:.2f} to {y_coords[-1]:.2f}")
    
    print("\nExtracting projection info...")
    projection = f[base_path + "projection"][()]
    print(f"  Projection EPSG: {projection}")

# ================= CONVERT TO dB =================
print("\nConverting to dB (log scale)...")

# Replace zeros with NaN to avoid log(0)
hhhh_clean = np.where(hhhh > 0, hhhh, np.nan)
hvhv_clean = np.where(hvhv > 0, hvhv, np.nan)

with np.errstate(divide='ignore', invalid='ignore'):
    hhhh_db = 10 * np.log10(hhhh_clean)
    hvhv_db = 10 * np.log10(hvhv_clean)

print(f"  HHHH dB range: {np.nanmin(hhhh_db):.2f} to {np.nanmax(hhhh_db):.2f}")
print(f"  HVHV dB range: {np.nanmin(hvhv_db):.2f} to {np.nanmax(hvhv_db):.2f}")

# Free memory from linear data
del hhhh, hvhv, hhhh_clean, hvhv_clean

# ================= SAVE AS .NPY =================
print("\nSaving cropped data as .npy files...")
np.save(os.path.join(output_folder, "HHHH_dB_crop.npy"), hhhh_db)
np.save(os.path.join(output_folder, "HVHV_dB_crop.npy"), hvhv_db)
np.save(os.path.join(output_folder, "x_coords_crop.npy"), x_coords)
np.save(os.path.join(output_folder, "y_coords_crop.npy"), y_coords)
print(f"  Saved to: {output_folder}")

# ================= VISUALIZE =================
print("\nGenerating visualization...")
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# HH Polarization
vmin_hh = np.nanpercentile(hhhh_db, 2)
vmax_hh = np.nanpercentile(hhhh_db, 98)
im1 = axes[0].imshow(hhhh_db, cmap="gray", vmin=vmin_hh, vmax=vmax_hh)
axes[0].set_title("HH Polarization (dB)")
axes[0].axis("off")
plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

# HV Polarization
vmin_hv = np.nanpercentile(hvhv_db, 2)
vmax_hv = np.nanpercentile(hvhv_db, 98)
im2 = axes[1].imshow(hvhv_db, cmap="gray", vmin=vmin_hv, vmax=vmax_hv)
axes[1].set_title("HV Polarization (dB)")
axes[1].axis("off")
plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

plt.tight_layout()
output_png = os.path.join(output_folder, "backscatter_preview.png")
plt.savefig(output_png, dpi=150, bbox_inches="tight")
plt.close()
print(f"  Preview saved: {output_png}")

# ================= EXPORT GEOTIFF (If rasterio is available) =================
try:
    import rasterio
    from rasterio.transform import from_bounds
    
    print("\nExporting to GeoTIFF (using rasterio)...")
    
    # Calculate transform from x/y coordinates
    x_res = (x_coords[-1] - x_coords[0]) / (len(x_coords) - 1)
    y_res = (y_coords[-1] - y_coords[0]) / (len(y_coords) - 1)
    transform = from_bounds(
        x_coords[0] - x_res/2, y_coords[-1] - y_res/2,
        x_coords[-1] + x_res/2, y_coords[0] + y_res/2,
        hhhh_db.shape[1], hhhh_db.shape[0]
    )
    
    # Save HH
    with rasterio.open(
        os.path.join(output_folder, "HHHH_dB.tif"),
        'w',
        driver='GTiff',
        height=hhhh_db.shape[0],
        width=hhhh_db.shape[1],
        count=1,
        dtype=hhhh_db.dtype,
        crs=f"EPSG:{projection}",
        transform=transform,
        nodata=np.nan,
        compress='lzw'
    ) as dst:
        dst.write(hhhh_db, 1)
    print("  ✅ HHHH_dB.tif saved")
    
    # Save HV
    with rasterio.open(
        os.path.join(output_folder, "HVHV_dB.tif"),
        'w',
        driver='GTiff',
        height=hvhv_db.shape[0],
        width=hvhv_db.shape[1],
        count=1,
        dtype=hvhv_db.dtype,
        crs=f"EPSG:{projection}",
        transform=transform,
        nodata=np.nan,
        compress='lzw'
    ) as dst:
        dst.write(hvhv_db, 1)
    print("  ✅ HVHV_dB.tif saved")

except ImportError:
    print("\n⚠️ rasterio not installed. Skipping GeoTIFF export.")
    print("   Install with: python -m pip install rasterio")
except Exception as e:
    print(f"\n⚠️ GeoTIFF export failed: {e}")

print("\n" + "=" * 60)
print("✅ EXTRACTION COMPLETE!")
print("=" * 60)
print(f"\nOutput files saved to: {output_folder}")
print("  - HHHH_dB_crop.npy")
print("  - HVHV_dB_crop.npy")
print("  - x_coords_crop.npy")
print("  - y_coords_crop.npy")
print("  - backscatter_preview.png")
print("  - HHHH_dB.tif (if rasterio installed)")
print("  - HVHV_dB.tif (if rasterio installed)")