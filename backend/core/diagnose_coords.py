"""
Diagnostic: Check NISAR coordinates
=====================================
"""
import numpy as np
import h5py
from pyproj import Transformer

# Load the Feni .npy coordinate files
x_coords = np.load(r"C:\Users\JM\NISAR_Project\output\feni\feni_x_coords.npy")
y_coords = np.load(r"C:\Users\JM\NISAR_Project\output\feni\feni_y_coords.npy")

print("=" * 60)
print("NISAR COORDINATE DIAGNOSTIC")
print("=" * 60)

print(f"\nX coords (Easting):")
print(f"  Min: {x_coords.min():.2f}")
print(f"  Max: {x_coords.max():.2f}")
print(f"  Range: {x_coords.max() - x_coords.min():.2f} m")
print(f"  First 3: {x_coords[:3]}")
print(f"  Last 3:  {x_coords[-3:]}")

print(f"\nY coords (Northing):")
print(f"  Min: {y_coords.min():.2f}")
print(f"  Max: {y_coords.max():.2f}")
print(f"  Range: {y_coords.max() - y_coords.min():.2f} m")
print(f"  First 3: {y_coords[:3]}")
print(f"  Last 3:  {y_coords[-3:]}")

# Test with BOTH UTM zones
print("\n" + "=" * 60)
print("TESTING DIFFERENT EPSG CODES")
print("=" * 60)

for epsg in [32645, 32646]:
    transformer = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    
    # Center point
    cx = (x_coords.min() + x_coords.max()) / 2
    cy = (y_coords.min() + y_coords.max()) / 2
    lon, lat = transformer.transform(cx, cy)
    
    print(f"\nEPSG:{epsg}")
    print(f"  Center: ({lat:.6f}, {lon:.6f})")
    
    # Check if it's in Feni
    if 22.9 < lat < 23.2 and 91.3 < lon < 91.6:
        print(f"  ✅ MATCH! This is Feni!")
    else:
        print(f"  ❌ Not Feni. Feni is around (23.07, 91.42)")

# Read HDF5 to check its actual projection
print("\n" + "=" * 60)
print("CHECKING HDF5 PROJECTION METADATA")
print("=" * 60)

h5_path = r"C:\Users\JM\NISAR_Project\nisar_data\NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001.h5"

with h5py.File(h5_path, "r") as f:
    base = "science/LSAR/GCOV/grids/frequencyA/"
    
    projection = f[base + "projection"][()]
    print(f"\nProjection (from HDF5): {projection}")
    print(f"Interpreted as EPSG:{projection}")
    
    # Metadata
    bounding = f["science/LSAR/identification/boundingPolygon"][()]
    print(f"\nBounding Polygon:")
    print(f"  {bounding.decode('utf-8')[:200]}...")
    
    # xCoordinateSpacing
    x_spacing = f[base + "xCoordinateSpacing"][()]
    y_spacing = f[base + "yCoordinateSpacing"][()]
    print(f"\nPixel Spacing:")
    print(f"  X: {x_spacing:.4f} m")
    print(f"  Y: {y_spacing:.4f} m")
    
    # Full x/y coords
    full_x = f[base + "xCoordinates"][:]
    full_y = f[base + "yCoordinates"][:]
    
    print(f"\nFull Image X range: {full_x.min():.2f} to {full_x.max():.2f}")
    print(f"Full Image Y range: {full_y.min():.2f} to {full_y.max():.2f}")