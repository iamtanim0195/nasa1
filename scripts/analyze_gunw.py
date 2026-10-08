"""
GUNW footprint + phase units, so the earthquake module targets the right AOI
with the right conversion.
"""
import glob
import os
import re
import sys

import h5py
import numpy as np
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = glob.glob(r"C:\Users\JM\NISAR_Project\nisar_data\*GUNW*.h5")[0]
print(os.path.basename(path), "\n")

ROOT = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"

with h5py.File(path, "r") as f:
    x = f[f"{ROOT}/HH/xCoordinates"][:]
    y = f[f"{ROOT}/HH/yCoordinates"][:]
    epsg = int(f[f"{ROOT}/projection"][()])
    freq = float(f["science/LSAR/GUNW/grids/frequencyA/centerFrequency"][()])
    orbit = f["science/LSAR/identification/orbitPassDirection"][()].decode()
    track = int(f["science/LSAR/identification/trackNumber"][()])
    frame = int(f["science/LSAR/identification/frameNumber"][()])

    print(f"track={track} frame={frame} orbit={orbit} EPSG:{epsg}")
    print(f"centerFrequency = {freq/1e9:.4f} GHz")

    C = 299792458.0
    wavelength = C / freq
    print(f"wavelength      = {wavelength:.4f} m")
    print(f"phase->LOS factor = {wavelength/(4*np.pi):.6f} m/rad  "
          f"(displacement = -phase * lambda / 4pi)\n")

    # Footprint from the coordinate axes.
    t = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    lons, lats = t.transform(
        np.array([x.min(), x.max(), x.max(), x.min()]),
        np.array([y.min(), y.min(), y.max(), y.max()]),
    )
    west, east = float(min(lons)), float(max(lons))
    south, north = float(min(lats)), float(max(lats))
    print(f"footprint bbox: lat {south:.4f} .. {north:.4f}   lon {west:.4f} .. {east:.4f}")
    print(f"grid: {len(y)} rows x {len(x)} cols, "
          f"spacing {abs(x[1]-x[0]):.2f} m\n")

    # Phase + coherence statistics on a decimated interior sample.
    phase = f[f"{ROOT}/HH/unwrappedPhase"][::8, ::8].astype(np.float64)
    coh = f[f"{ROOT}/HH/coherenceMagnitude"][::8, ::8].astype(np.float64)

    fin = np.isfinite(phase)
    print(f"unwrappedPhase: finite {100*fin.mean():.1f}%")
    if fin.any():
        pv = phase[fin]
        print(f"  min={pv.min():.2f}  max={pv.max():.2f}  "
              f"p1={np.percentile(pv,1):.2f}  p99={np.percentile(pv,99):.2f}")
        print(f"  => LOS displacement range {(-pv.max()*wavelength/(4*np.pi))*100:.1f} cm "
              f"to {(-pv.min()*wavelength/(4*np.pi))*100:.1f} cm")

    cf = np.isfinite(coh)
    print(f"\ncoherenceMagnitude: finite {100*cf.mean():.1f}%")
    if cf.any():
        cv = coh[cf]
        print(f"  min={cv.min():.3f} max={cv.max():.3f} mean={cv.mean():.3f}")
        for thr in (0.2, 0.3, 0.5):
            print(f"  coherence >= {thr}: {100*np.count_nonzero(cv>=thr)/cv.size:.1f}%")

    # A good AOI is where coherence is high (reliable phase).
    print("\nbest-coherence sub-window (candidate AOI):")
    bh, bw = coh.shape
    th, tw = bh // 4, bw // 4
    best = None
    for i in range(4):
        for j in range(4):
            tile = coh[i*th:(i+1)*th, j*tw:(j+1)*tw]
            tf = np.isfinite(tile)
            if not tf.any():
                continue
            m = float(tile[tf].mean())
            if best is None or m > best[0]:
                # centre pixel of that tile -> lon/lat
                r = min(int((i + 0.5) * th * 8), len(y) - 1)
                c = min(int((j + 0.5) * tw * 8), len(x) - 1)
                best = (m, r, c)
    if best:
        m, r, c = best
        lon, lat = t.transform(float(x[c]), float(y[r]))
        print(f"  quadrant centre lat={lat:.4f} lon={lon:.4f}  mean coherence={m:.3f}")
