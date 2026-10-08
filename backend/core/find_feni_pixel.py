"""
Find Feni pixel location in NISAR image
========================================
Feni coordinates: 23.07°N, 91.42°E
Need to find which Y_START, X_START in the image corresponds to this.
"""
import h5py
import numpy as np
from pyproj import Transformer

h5_path = r"C:\Users\JM\NISAR_Project\nisar_data\NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001.h5"

# Feni center (from Google Earth)
FENI_LAT = 23.071345
FENI_LON = 91.423567

with h5py.File(h5_path, "r") as f:
    base = "science/LSAR/GCOV/grids/frequencyA/"
    
    x_coords = f[base + "xCoordinates"][:]
    y_coords = f[base + "yCoordinates"][:]
    projection = int(f[base + "projection"][()])
    
    print(f"Projection: EPSG:{projection}")
    print(f"x_coords range: {x_coords.min():.0f} - {x_coords.max():.0f}")
    print(f"y_coords range: {y_coords.min():.0f} - {y_coords.max():.0f}")
    
    # Convert Feni lat/lon to UTM
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{projection}", always_xy=True)
    feni_easting, feni_northing = transformer.transform(FENI_LON, FENI_LAT)
    
    print(f"\nFeni coordinates in EPSG:{projection}:")
    print(f"  Easting (X):  {feni_easting:.2f}")
    print(f"  Northing (Y): {feni_northing:.2f}")
    
    # Check if Feni is inside the image
    print(f"\nFeni inside image?")
    print(f"  X in range: {x_coords.min() <= feni_easting <= x_coords.max()}")
    print(f"  Y in range: {y_coords.min() <= feni_northing <= y_coords.max()}")
    
    # Find pixel index
    if x_coords[0] < x_coords[-1]:
        # Ascending
        x_idx = np.argmin(np.abs(x_coords - feni_easting))
        print(f"\nPixel X index: {x_idx}")
    else:
        # Descending
        x_idx = np.argmin(np.abs(x_coords - feni_easting))
        print(f"\nPixel X index: {x_idx}")
    
    # Y could be descending
    y_idx = np.argmin(np.abs(y_coords - feni_northing))
    print(f"Pixel Y index: {y_idx}")
    
    print(f"\n" + "=" * 60)
    print(f"RECOMMENDED CROP LOCATION")
    print(f"=" * 60)
    
    # Calculate crop start (centered on Feni)
    CROP_SIZE = 3000
    y_start = max(0, y_idx - CROP_SIZE // 2)
    x_start = max(0, x_idx - CROP_SIZE // 2)
    
    print(f"Y_START = {y_start}")
    print(f"X_START = {x_start}")
    print(f"CROP_SIZE = {CROP_SIZE}")
    print(f"\nThis will center the crop on Feni.")
    
    # Verify
    x_end = min(len(x_coords), x_start + CROP_SIZE)
    y_end = min(len(y_coords), y_start + CROP_SIZE)
    
    print(f"\nCrop coordinates:")
    print(f"  X: {x_coords[x_start]:.0f} to {x_coords[x_end-1]:.0f}")
    print(f"  Y: {y_coords[y_start]:.0f} to {y_coords[y_end-1]:.0f}")
    
    # Convert back to lat/lon for verification
    transformer_back = Transformer.from_crs(f"EPSG:{projection}", "EPSG:4326", always_xy=True)
    
    # Center of crop
    center_x = (x_coords[x_start] + x_coords[x_end-1]) / 2
    center_y = (y_coords[y_start] + y_coords[y_end-1]) / 2
    center_lon, center_lat = transformer_back.transform(center_x, center_y)
    
    print(f"\nCrop center (lat/lon):")
    print(f"  Latitude:  {center_lat:.6f}")
    print(f"  Longitude: {center_lon:.6f}")
    
    # Check if close to Feni
    if abs(center_lat - FENI_LAT) < 0.1 and abs(center_lon - FENI_LON) < 0.1:
        print(f"\n✅ Crop is correctly centered on Feni!")
    else:
        print(f"\n⚠️ Crop center is far from Feni:")
        print(f"   Expected: ({FENI_LAT}, {FENI_LON})")
        print(f"   Got:      ({center_lat:.6f}, {center_lon:.6f})")