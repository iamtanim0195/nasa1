import h5py
import os

# Path to the downloaded file
file_path = r"C:\Users\JM\NISAR_Project\nisar_data\NISAR_L2_PR_GCOV_023_170_A_012_4005_DHDH_A_20260625T232913_20260625T232922_P05023_N_P_J_001.h5"

# Check if file exists
if not os.path.exists(file_path):
    print(f"❌ File not found at: {file_path}")
    print("Please check the path and try again.")
    exit()

print("=" * 70)
print("NISAR HDF5 FILE STRUCTURE ANALYSIS")
print("=" * 70)
print(f"\nFile: {os.path.basename(file_path)}")
print(f"Size: {os.path.getsize(file_path) / (1024**3):.2f} GB")
print()

# Explore the HDF5 structure
with h5py.File(file_path, "r") as f:
    print("=" * 70)
    print("TOP-LEVEL GROUPS:")
    print("=" * 70)
    for key in f.keys():
        print(f"  📁 {key}")
    
    print("\n" + "=" * 70)
    print("FULL HIERARCHY (Groups & Datasets):")
    print("=" * 70)
    
    def print_structure(name, obj):
        indent = "  " * (name.count("/") + 1)
        if isinstance(obj, h5py.Group):
            print(f"{indent}📁 {name.split('/')[-1]}/")
        elif isinstance(obj, h5py.Dataset):
            print(f"{indent}📊 {name.split('/')[-1]}  |  Shape: {obj.shape}  |  Type: {obj.dtype}")
    
    f.visititems(print_structure)

print("\n" + "=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)