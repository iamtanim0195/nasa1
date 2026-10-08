"""
Find a landslide demo AOI that is both STEEP and WELL-COVERED.

Rangamati (22.75N, 92.25E) is steep but sits at the swath edge (19.5% valid).
This scores candidate points in the Chittagong Hill Tracts on both criteria
using the real SRTM tiles and the real decimated validity map.
"""
import glob
import os
import sys

import h5py
import numpy as np
from pyproj import Transformer

sys.path.insert(0, r"C:\Users\JM\NISAR_Project\backend")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from api.services import dem  # noqa: E402

BASE = "science/LSAR/GCOV/grids/frequencyA/"
path = sorted(glob.glob(r"C:\Users\JM\NISAR_Project\nisar_data\*.h5"))[0]
STRIDE = 50
CROP = 3000

with h5py.File(path, "r") as f:
    x = f[BASE + "xCoordinates"][:]
    y = f[BASE + "yCoordinates"][:]
    epsg = int(f[BASE + "projection"][()])
    hh = f[BASE + "HHHH"][::STRIDE, ::STRIDE]

valid = np.isfinite(hh) & (hh > 0)
to_proj = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
nx, ny = len(x), len(y)
half = CROP // 2

# Candidate AOIs across the hill tracts and the delta, for contrast.
CANDIDATES = [
    ("Rangamati",       22.75, 92.25),
    ("Khagrachari",     23.12, 91.98),
    ("Dighinala",       23.20, 92.05),
    ("Panchhari",       23.28, 91.90),
    ("Ramgarh",         22.55, 92.35),
    ("Bandarban",       22.20, 92.22),
    ("Alikadam",        21.65, 92.35),
    ("Lama",            21.90, 92.20),
    ("Matiranga",       23.05, 91.85),
    ("Feni (flat ref)", 23.07, 91.42),
]

print(f"{'candidate':17s} {'lat':>6} {'lon':>7} {'coverage%':>10} {'meanSlope':>10} {'maxSlope':>9} {'>15deg%':>8}  verdict")
print("-" * 92)

rows = []
for name, lat, lon in CANDIDATES:
    px, py = to_proj.transform(lon, lat)
    if not (x.min() <= px <= x.max() and y.min() <= py <= y.max()):
        print(f"{name:17s} {lat:6.2f} {lon:7.2f} {'OUT OF SCENE':>10}")
        continue

    col = int(np.argmin(np.abs(x - px)))
    row = int(np.argmin(np.abs(y - py)))
    x0 = max(0, min(col - half, nx - CROP))
    y0 = max(0, min(row - half, ny - CROP))

    d0, d1 = y0 // STRIDE, min((y0 + CROP) // STRIDE, valid.shape[0])
    c0, c1 = x0 // STRIDE, min((x0 + CROP) // STRIDE, valid.shape[1])
    win = valid[d0:d1, c0:c1]
    coverage = 100.0 * win.mean() if win.size else 0.0

    # Slope from the SRTM tiles covering this point.
    elev, transform, _ = dem.load_dem_mosaic(lon - 0.2, lat - 0.2, lon + 0.2, lat + 0.2)
    if elev is None:
        mean_s = max_s = pct15 = float("nan")
    else:
        slope = dem.compute_slope_degrees(elev, 30.0)
        finite = slope[np.isfinite(slope)]
        mean_s = float(np.mean(finite)) if finite.size else float("nan")
        max_s = float(np.max(finite)) if finite.size else float("nan")
        pct15 = 100.0 * np.count_nonzero(finite > 15) / finite.size if finite.size else 0.0

    good = coverage >= 60 and pct15 >= 20
    partial = coverage >= 40 and pct15 >= 10
    verdict = "BEST" if good else ("workable" if partial else "poor")
    rows.append((name, lat, lon, coverage, mean_s, max_s, pct15, verdict))
    print(f"{name:17s} {lat:6.2f} {lon:7.2f} {coverage:9.1f}% {mean_s:10.1f} {max_s:9.1f} {pct15:7.1f}%  {verdict}")

print()
best = [r for r in rows if r[7] == "BEST"]
if best:
    b = max(best, key=lambda r: r[6])
    print(f"RECOMMENDED landslide AOI: {b[0]} ({b[1]}, {b[2]})  "
          f"coverage {b[3]:.1f}%  steep {b[6]:.1f}%")
else:
    workable = [r for r in rows if r[7] == "workable"]
    if workable:
        b = max(workable, key=lambda r: r[3] + r[6])
        print(f"No ideal AOI. Best available: {b[0]} ({b[1]}, {b[2]})  "
              f"coverage {b[3]:.1f}%  steep {b[6]:.1f}%")
    else:
        print("No AOI is both steep and well covered in this granule.")
