"""
Pick a farming AOI automatically: well-covered, flat, and vegetated.

Rajshahi (the preset) is outside the local granule, so this scans a grid of
candidate centres inside the valid swath and scores them on
  - valid-data coverage      (from the real granule)
  - flatness                 (slope from real SRTM)
  - vegetation signature     (HV backscatter, volume scattering from canopy)
and reports the best cropland window.
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
STRIDE = 50
CROP = 3000
path = sorted(glob.glob(r"C:\Users\JM\NISAR_Project\nisar_data\*.h5"))[0]
print(f"granule: {os.path.basename(path)}\n")

with h5py.File(path, "r") as f:
    x = f[BASE + "xCoordinates"][:]
    y = f[BASE + "yCoordinates"][:]
    epsg = int(f[BASE + "projection"][()])
    hh = f[BASE + "HHHH"][::STRIDE, ::STRIDE].astype(np.float32)
    hv = f[BASE + "HVHV"][::STRIDE, ::STRIDE].astype(np.float32)

valid = np.isfinite(hh) & (hh > 0) & np.isfinite(hv) & (hv > 0)
hh_db = np.where(valid, 10 * np.log10(np.where(hh > 0, hh, np.nan)), np.nan)
hv_db = np.where(valid, 10 * np.log10(np.where(hv > 0, hv, np.nan)), np.nan)

to_proj = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
to_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
nx, ny = len(x), len(y)
half = CROP // 2
xs_d, ys_d = x[::STRIDE], y[::STRIDE]

# Candidate centres on a coarse grid across the whole scene.
results = []
for row in range(0, len(ys_d), 12):
    for col in range(0, len(xs_d), 12):
        px, py = xs_d[col], ys_d[row]
        x0 = max(0, min(int(np.argmin(np.abs(x - px))) - half, nx - CROP))
        y0 = max(0, min(int(np.argmin(np.abs(y - py))) - half, ny - CROP))
        d0, d1 = y0 // STRIDE, min((y0 + CROP) // STRIDE, valid.shape[0])
        c0, c1 = x0 // STRIDE, min((x0 + CROP) // STRIDE, valid.shape[1])

        win = valid[d0:d1, c0:c1]
        cov = 100.0 * win.mean() if win.size else 0.0
        if cov < 90.0:
            continue

        mean_hv = float(np.nanmean(hv_db[d0:d1, c0:c1]))
        mean_hh = float(np.nanmean(hh_db[d0:d1, c0:c1]))

        lon, lat = to_wgs.transform(px, py)
        elev, _, _ = dem.load_dem_mosaic(lon - 0.15, lat - 0.15, lon + 0.15, lat + 0.15)
        slope_mean = float("nan")
        if elev is not None and np.isfinite(elev).any():
            slope = dem.compute_slope_degrees(elev, 30.0)
            fin = slope[np.isfinite(slope)]
            slope_mean = float(np.mean(fin)) if fin.size else float("nan")

        results.append({
            "lat": round(lat, 3), "lon": round(lon, 3), "coverage": round(cov, 1),
            "hv": round(mean_hv, 2), "hh": round(mean_hh, 2),
            "slope": None if not np.isfinite(slope_mean) else round(slope_mean, 2),
        })

print(f"candidate windows with >=90% coverage: {len(results)}\n")

# Cropland: flat, and a healthy HV canopy signature with low HH (not urban).
def score(r):
    if r["slope"] is None:
        return -1e9
    flat = max(0.0, 5.0 - r["slope"])          # prefer slope < 5 deg
    veg = r["hv"] - r["hh"] * 0.2              # volume scattering over surface
    return flat * 2.0 + veg

results.sort(key=score, reverse=True)

print(f"{'lat':>7} {'lon':>8} {'cover%':>7} {'meanHV':>7} {'meanHH':>7} {'slope':>7}")
print("-" * 50)
for r in results[:12]:
    print(f"{r['lat']:7.3f} {r['lon']:8.3f} {r['coverage']:7.1f} {r['hv']:7.2f} "
          f"{r['hh']:7.2f} {str(r['slope']):>7}")

if results:
    b = results[0]
    print(f"\nRECOMMENDED farming AOI: {b['lat']}N {b['lon']}E  "
          f"coverage {b['coverage']}%  slope {b['slope']} deg  meanHV {b['hv']} dB")
