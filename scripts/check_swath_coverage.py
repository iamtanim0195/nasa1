"""
Which preset AOIs are actually covered by the radar swath?

The crop window is a bounding box, but the GCOV swath is a rotated parallelogram
inside it, so a window can be mostly no-data. Rangamati, for example, returned
only 17.6% valid pixels. This maps the valid-data footprint and scores every
preset so Phases 3-4 pick AOIs that actually have data.
"""
import glob
import os
import sys

import h5py
import numpy as np
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "science/LSAR/GCOV/grids/frequencyA/"
DATA = r"C:\Users\JM\NISAR_Project\nisar_data\*.h5"
STRIDE = 50  # decimation for the footprint map

PRESETS = [
    ("Feni",         23.07, 91.42, "flood"),
    ("Sunamganj",    25.00, 91.25, "flood"),
    ("Sylhet Fault", 24.85, 92.00, "earthquake"),
    ("Rangamati",    22.75, 92.25, "landslide"),
    ("Rajshahi",     24.40, 88.60, "farming"),
    ("Padma River",  23.75, 89.65, "river-erosion"),
    ("Sundarbans",   21.85, 89.40, "sea-level"),
    ("Dhaka",        23.80, 90.40, "infrastructure"),
]

path = sorted(glob.glob(DATA))[0]
print(f"granule: {os.path.basename(path)}\n")

with h5py.File(path, "r") as f:
    x = f[BASE + "xCoordinates"][:]
    y = f[BASE + "yCoordinates"][:]
    epsg = int(f[BASE + "projection"][()])
    # Decimated backscatter: NaN/invalid where the swath has no data.
    hh = f[BASE + "HHHH"][::STRIDE, ::STRIDE]
    mask = f[BASE + "mask"][::STRIDE, ::STRIDE]

valid = np.isfinite(hh) & (hh > 0)
print(f"decimated grid: {valid.shape}  (stride {STRIDE})")
print(f"VALID-FRACTION OF FULL SCENE: {100.0*valid.mean():.1f}%\n")

# Valid-data bounding box in lon/lat (useful for planning).
rows_valid = np.where(valid.any(axis=1))[0]
cols_valid = np.where(valid.any(axis=0))[0]
if rows_valid.size and cols_valid.size:
    t = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    xs = x[::STRIDE][cols_valid]
    ys = y[::STRIDE][rows_valid]
    lons, lats = t.transform(
        np.array([xs.min(), xs.max()]), np.array([ys.min(), ys.max()])
    )
    print(f"valid-data extent (approx): lat {min(lats):.3f}..{max(lats):.3f}  "
          f"lon {min(lons):.3f}..{max(lons):.3f}\n")

print(f"{'preset':14s} {'module':14s} {'in scene':9s} {'valid% in 3000px window':>24s}")
print("-" * 68)

to_proj = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
CROP = 3000
half = CROP // 2
ny, nx = len(y), len(x)

for name, lat, lon, module in PRESETS:
    px, py = to_proj.transform(lon, lat)
    if not (x.min() <= px <= x.max() and y.min() <= py <= y.max()):
        print(f"{name:14s} {module:14s} {'NO':9s} {'-':>24s}")
        continue

    col = int(np.argmin(np.abs(x - px)))
    row = int(np.argmin(np.abs(y - py)))
    x0 = max(0, min(col - half, nx - CROP))
    y0 = max(0, min(row - half, ny - CROP))

    d0, d1 = y0 // STRIDE, (y0 + CROP) // STRIDE
    c0, c1 = x0 // STRIDE, (x0 + CROP) // STRIDE
    win_valid = valid[d0:d1, c0:c1]
    frac = 100.0 * win_valid.mean() if win_valid.size else 0.0

    verdict = "GOOD" if frac >= 60 else ("PARTIAL" if frac >= 25 else "POOR")
    print(f"{name:14s} {module:14s} {'yes':9s} {frac:20.1f}%  {verdict}")
