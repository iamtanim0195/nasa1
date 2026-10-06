"""
NISAR Change Detection
======================
Compare two dates of NISAR SAR data to detect surface changes.
"""
import numpy as np
import os
import glob
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

NPY_FOLDER = r"C:\Users\JM\NISAR_Project\output\npy"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"

# Find HH files
hh_files = sorted(glob.glob(os.path.join(NPY_FOLDER, "*_HHHH_dB.npy")))
hv_files = sorted(glob.glob(os.path.join(NPY_FOLDER, "*_HVHV_dB.npy")))

if len(hh_files) < 2:
    print(f"❌ Need at least 2 dates for change detection.")
    print(f"   Found {len(hh_files)} HH files.")
    print(f"   Please download a second date's data first.")
    exit()

print(f"✅ Found {len(hh_files)} dates")
for f in hh_files:
    print(f"   - {os.path.basename(f)}")

# Load first two
hh1 = np.load(hh_files[0])
hh2 = np.load(hh_files[1])
hv1 = np.load(hv_files[0])
hv2 = np.load(hv_files[1])

# Compute difference
hh_diff = hh2 - hh1
hv_diff = hv2 - hv1

# Threshold for significant change
threshold = 3.0  # dB

hh_change_mask = np.abs(hh_diff) > threshold
hv_change_mask = np.abs(hv_diff) > threshold

print(f"\nChange Statistics (threshold = {threshold} dB):")
print(f"  HH changed pixels: {100 * hh_change_mask.mean():.2f}%")
print(f"  HV changed pixels: {100 * hv_change_mask.mean():.2f}%")

# Visualize
fig, axes = plt.subplots(2, 2, figsize=(16, 14))

axes[0, 0].imshow(hh1, cmap="gray")
axes[0, 0].set_title(f"HH - Date 1: {os.path.basename(hh_files[0])}")
axes[0, 0].axis("off")

axes[0, 1].imshow(hh2, cmap="gray")
axes[0, 1].set_title(f"HH - Date 2: {os.path.basename(hh_files[1])}")
axes[0, 1].axis("off")

im = axes[1, 0].imshow(hh_diff, cmap="RdBu_r", vmin=-10, vmax=10)
axes[1, 0].set_title("HH Change Map (Red=Increase, Blue=Decrease)")
axes[1, 0].axis("off")
plt.colorbar(im, ax=axes[1, 0], fraction=0.046, pad=0.04)

im = axes[1, 1].imshow(hh_change_mask, cmap="hot")
axes[1, 1].set_title(f"Significant Changes (|Δ| > {threshold} dB)")
axes[1, 1].axis("off")
plt.colorbar(im, ax=axes[1, 1], fraction=0.046, pad=0.04)

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_FOLDER, "change_detection.png"), dpi=150, bbox_inches="tight")
plt.close()

print(f"\n✅ Saved: output/change_detection.png")