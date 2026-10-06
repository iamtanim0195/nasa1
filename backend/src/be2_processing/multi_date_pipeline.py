"""
NISAR Multi-Date Processing Pipeline
=====================================
Process multiple NISAR HDF5 files and prepare for Change Detection.
"""
import h5py
import numpy as np
import os
import glob
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# ============================================================
# CONFIG
# ============================================================
NISAR_DATA_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"
OUTPUT_FOLDER = r"C:\Users\JM\NISAR_Project\output"
BASE_PATH = "science/LSAR/GCOV/grids/frequencyA/"

# Same crop for all dates
CROP_SIZE = 5000
Y_START = 10000
X_START = 12500

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def find_all_h5_files(folder):
    """Find all .h5 files in folder."""
    return sorted(glob.glob(os.path.join(folder, "*.h5")))


def process_single_file(file_path):
    """Process one HDF5 file and return cropped data."""
    print(f"\n  Processing: {os.path.basename(file_path)}")
    
    with h5py.File(file_path, "r") as f:
        hhhh_ds = f[BASE_PATH + "HHHH"]
        full_shape = hhhh_ds.shape
        
        # Crop
        y_end = min(full_shape[0], Y_START + CROP_SIZE)
        x_end = min(full_shape[1], X_START + CROP_SIZE)
        
        hhhh = hhhh_ds[Y_START:y_end, X_START:x_end]
        hvhv = f[BASE_PATH + "HVHV"][Y_START:y_end, X_START:x_end]
        
        # Coordinates
        x_coords = f[BASE_PATH + "xCoordinates"][X_START:x_end]
        y_coords = f[BASE_PATH + "yCoordinates"][Y_START:y_end]
        projection = f[BASE_PATH + "projection"][()]
        
        # Metadata
        start_time = f["science/LSAR/identification/zeroDopplerStartTime"][()].decode("utf-8")
        orbit_direction = f["science/LSAR/identification/orbitPassDirection"][()].decode("utf-8")
        track_number = int(f["science/LSAR/identification/trackNumber"][()])
        frame_number = int(f["science/LSAR/identification/frameNumber"][()])
        
    # Convert to dB
    hhhh_db = 10 * np.log10(np.where(hhhh > 0, hhhh, np.nan))
    hvhv_db = 10 * np.log10(np.where(hvhv > 0, hvhv, np.nan))
    
    return {
        "file_name": os.path.basename(file_path),
        "date": start_time.split("T")[0],
        "acquisition_time": start_time,
        "orbit_direction": orbit_direction,
        "track_number": track_number,
        "frame_number": frame_number,
        "projection": int(projection),
        "hhhh_db": hhhh_db,
        "hvhv_db": hvhv_db,
        "x_coords": x_coords,
        "y_coords": y_coords,
    }


# ============================================================
# PROCESS ALL FILES
# ============================================================
print("=" * 70)
print("NISAR MULTI-DATE PROCESSING")
print("=" * 70)

h5_files = find_all_h5_files(NISAR_DATA_FOLDER)
print(f"\nFound {len(h5_files)} NISAR files:")
for f in h5_files:
    print(f"  - {os.path.basename(f)}")

if len(h5_files) < 2:
    print(f"\n⚠️ Only {len(h5_files)} file(s) found.")
    print("   Need at least 2 dates for change detection.")
    print("   Fardin, please download another date's data!")
    exit()

# Process all files
processed_data = []
for f in h5_files:
    data = process_single_file(f)
    processed_data.append(data)
    print(f"    ✅ {data['date']} | Track: {data['track_number']} | Frame: {data['frame_number']}")

# ============================================================
# VERIFY SAME TRACK/FRAME
# ============================================================
print("\n" + "=" * 70)
print("VERIFYING ALIGNMENT")
print("=" * 70)

tracks = set(d["track_number"] for d in processed_data)
frames = set(d["frame_number"] for d in processed_data)

if len(tracks) > 1 or len(frames) > 1:
    print(f"⚠️ WARNING: Files have different Track/Frame numbers!")
    print(f"   Tracks: {tracks}")
    print(f"   Frames: {frames}")
    print("   Change detection may not work accurately.")
else:
    print(f"✅ All files aligned: Track {tracks.pop()}, Frame {frames.pop()}")

# ============================================================
# SAVE MULTI-DATE PREVIEW
# ============================================================
n_dates = len(processed_data)
fig, axes = plt.subplots(n_dates, 2, figsize=(16, 6 * n_dates))

if n_dates == 1:
    axes = axes.reshape(1, -1)

for i, data in enumerate(processed_data):
    axes[i, 0].imshow(data["hhhh_db"], cmap="gray")
    axes[i, 0].set_title(f"HH - {data['date']} ({data['orbit_direction']})", fontsize=12)
    axes[i, 0].axis("off")
    
    axes[i, 1].imshow(data["hvhv_db"], cmap="gray")
    axes[i, 1].set_title(f"HV - {data['date']}", fontsize=12)
    axes[i, 1].axis("off")

plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_FOLDER, "multi_date_preview.png"), dpi=150, bbox_inches="tight")
plt.close()
print(f"\n✅ Saved: output/multi_date_preview.png")

# ============================================================
# SAVE METADATA SUMMARY
# ============================================================
summary = [{
    "file_name": d["file_name"],
    "date": d["date"],
    "time": d["acquisition_time"],
    "orbit_direction": d["orbit_direction"],
    "track": d["track_number"],
    "frame": d["frame_number"],
} for d in processed_data]

with open(os.path.join(OUTPUT_FOLDER, "multi_date_summary.json"), "w") as f:
    json.dump(summary, f, indent=2)

print(f"✅ Saved: output/multi_date_summary.json")
print("\n" + "=" * 70)
print("✅ MULTI-DATE PROCESSING COMPLETE!")
print("=" * 70)