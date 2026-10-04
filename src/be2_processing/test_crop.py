import h5py
import numpy as np
import os
import glob
import matplotlib.pyplot as plt

nisar_data_folder = r"C:\Users\JM\NISAR_Project\nisar_data"
output_folder = r"C:\Users\JM\NISAR_Project\output"
os.makedirs(output_folder, exist_ok=True)

h5_files = glob.glob(os.path.join(nisar_data_folder, "*.h5"))
file_path = h5_files[0]

# Test 3 different crop locations
crops = [
    {"name": "Top-Left",     "y": 500,  "x": 500},
    {"name": "Top-Center",   "y": 500,  "x": 15000},
    {"name": "Middle-Left",  "y": 15000, "x": 500},
]

CROP_SIZE = 3000  # Smaller size for faster testing

with h5py.File(file_path, "r") as f:
    base_path = "science/LSAR/GCOV/grids/frequencyA/"
    hhhh_full = f[base_path + "HHHH"]
    full_shape = hhhh_full.shape
    
    fig, axes = plt.subplots(len(crops), 2, figsize=(14, 18))
    
    for idx, crop in enumerate(crops):
        y_start = crop["y"]
        x_start = crop["x"]
        y_end = min(full_shape[0], y_start + CROP_SIZE)
        x_end = min(full_shape[1], x_start + CROP_SIZE)
        
        print(f"\n--- Testing {crop['name']} ---")
        print(f"  Y: {y_start} to {y_end}")
        print(f"  X: {x_start} to {x_end}")
        
        hhhh = hhhh_full[y_start:y_end, x_start:x_end]
        hvhv = f[base_path + "HVHV"][y_start:y_end, x_start:x_end]
        
        # Count non-zero (data) pixels
        data_pixels = np.count_nonzero(hhhh)
        total = hhhh.size
        print(f"  Data Pixels: {data_pixels:,} / {total:,} ({100*data_pixels/total:.1f}%)")
        
        # Convert to dB
        hhhh_clean = np.where(hhhh > 0, hhhh, np.nan)
        hvhv_clean = np.where(hvhv > 0, hvhv, np.nan)
        
        with np.errstate(divide='ignore', invalid='ignore'):
            hhhh_db = 10 * np.log10(hhhh_clean)
            hvhv_db = 10 * np.log10(hvhv_clean)
        
        # Plot
        axes[idx, 0].imshow(hhhh_db, cmap="gray", aspect="auto")
        axes[idx, 0].set_title(f"{crop['name']} - HH")
        axes[idx, 0].axis("off")
        
        axes[idx, 1].imshow(hvhv_db, cmap="gray", aspect="auto")
        axes[idx, 1].set_title(f"{crop['name']} - HV")
        axes[idx, 1].axis("off")
    
    plt.tight_layout()
    output_png = os.path.join(output_folder, "test_crops.png")
    plt.savefig(output_png, dpi=120, bbox_inches="tight")
    plt.close()
    print(f"\n✅ Saved: {output_png}")
    print("\nOpen 'test_crops.png' and see which crop has the best data!")