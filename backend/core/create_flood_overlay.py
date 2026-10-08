"""
Create Flood Overlay for Google Earth
=======================================
Convert binary flood mask to RGBA GeoTIFF with transparent background.
"""
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import os

# Paths
INPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output\feni"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output\feni_visual"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Load flood mask and coordinates
print("Loading data...")
flood_mask = np.load(os.path.join(INPUT_FOLDER, "feni_flood_mask.npy"))
x_coords = np.load(os.path.join(INPUT_FOLDER, "feni_x_coords.npy"))
y_coords = np.load(os.path.join(INPUT_FOLDER, "feni_y_coords.npy"))

print(f"  Flood mask shape: {flood_mask.shape}")
print(f"  Flood pixels: {flood_mask.sum():,}")
print(f"  Flood coverage: {100 * flood_mask.mean():.2f}%")

# Create RGBA image
# R, G, B, A channels
height, width = flood_mask.shape
rgba = np.zeros((height, width, 4), dtype=np.uint8)

# Flood pixels = RED with 70% opacity
# Format: [R, G, B, A]
rgba[flood_mask == 1] = [255, 50, 50, 180]  # Red flood
rgba[flood_mask == 0] = [0, 0, 0, 0]         # Fully transparent

print(f"\nRGBA shape: {rgba.shape}")

# Calculate transform
x_res = (x_coords[-1] - x_coords[0]) / (len(x_coords) - 1)
y_res = (y_coords[-1] - y_coords[0]) / (len(y_coords) - 1)

# Y coords may be descending
if y_coords[0] > y_coords[-1]:
    top = y_coords[0] + abs(y_res) / 2
    bottom = y_coords[-1] - abs(y_res) / 2
else:
    top = y_coords[-1] + abs(y_res) / 2
    bottom = y_coords[0] - abs(y_res) / 2

left = x_coords[0] - abs(x_res) / 2
right = x_coords[-1] + abs(x_res) / 2

transform = from_bounds(left, bottom, right, top, width, height)

# Save as RGBA GeoTIFF
output_path = os.path.join(OUTPUT_FOLDER, "feni_flood_overlay.tif")
print(f"\nSaving to: {output_path}")

with rasterio.open(
    output_path,
    'w',
    driver='GTiff',
    height=height,
    width=width,
    count=4,  # 4 channels (RGBA)
    dtype='uint8',
    crs=CRS.from_epsg(32646),
    transform=transform,
    compress='lzw'
) as dst:
    dst.write(rgba[:, :, 0], 1)  # R
    dst.write(rgba[:, :, 1], 2)  # G
    dst.write(rgba[:, :, 2], 3)  # B
    dst.write(rgba[:, :, 3], 4)  # A
    dst.set_band_description(1, 'Red')
    dst.set_band_description(2, 'Green')
    dst.set_band_description(3, 'Blue')
    dst.set_band_description(4, 'Alpha')

print(f"✅ Saved: {output_path}")
print(f"   File size: {os.path.getsize(output_path) / (1024**2):.2f} MB")

# Also create a "Before/After RGB" composite for visual impact
print("\n" + "=" * 60)
print("Creating Before/After color composite...")
print("=" * 60)

# Load HH data
before_hh = np.load(os.path.join(INPUT_FOLDER, "feni_20260702_HHHH.npy"))
after_hh = np.load(os.path.join(INPUT_FOLDER, "feni_20260912_HHHH.npy"))

# Normalize to 0-255
def normalize_to_uint8(arr):
    valid = arr[~np.isnan(arr)]
    vmin, vmax = np.percentile(valid, [2, 98])
    normalized = np.clip((arr - vmin) / (vmax - vmin), 0, 1)
    return (normalized * 255).astype(np.uint8)

before_gray = normalize_to_uint8(before_hh)
after_gray = normalize_to_uint8(after_hh)

# Save both
for name, data in [("before", before_gray), ("after", after_gray)]:
    output_path = os.path.join(OUTPUT_FOLDER, f"feni_{name}_gray.tif")
    with rasterio.open(
        output_path,
        'w',
        driver='GTiff',
        height=height,
        width=width,
        count=1,
        dtype='uint8',
        crs=CRS.from_epsg(32646),
        transform=transform,
        compress='lzw'
    ) as dst:
        dst.write(data, 1)
    print(f"✅ Saved: {output_path}")

print("\n" + "=" * 60)
print("COMPLETE!")
print("=" * 60)
print(f"\nFiles in: {OUTPUT_FOLDER}")
print("  - feni_flood_overlay.tif (RGBA with red flood)")
print("  - feni_before_gray.tif (grayscale before)")
print("  - feni_after_gray.tif (grayscale after)")