"""
Determine the geographic footprint of the two local NISAR granules and test
whether each of the 7 preset AOIs falls inside them.

This decides whether Phases 2-4 can use EXISTING local data or must download
new granules (1.6-7.9 GB each).
"""
import glob
import h5py
import numpy as np
from pyproj import Transformer

BASE = "science/LSAR/GCOV/grids/frequencyA/"
DATA = r"C:\Users\JM\NISAR_Project\nisar_data\*.h5"

PRESETS = [
    ("Feni",         23.07, 91.42),
    ("Sunamganj",    25.00, 91.25),
    ("Sylhet Fault", 24.85, 92.00),
    ("Rangamati",    22.75, 92.25),
    ("Rajshahi",     24.40, 88.60),
    ("Padma River",  23.75, 89.65),
    ("Sundarbans",   21.85, 89.40),
    ("Dhaka",        23.80, 90.40),
]

files = sorted(glob.glob(DATA))
print(f"Local granules: {len(files)}\n")

for path in files:
    with h5py.File(path, "r") as f:
        x = f[BASE + "xCoordinates"][:]
        y = f[BASE + "yCoordinates"][:]
        epsg = int(f[BASE + "projection"][()])
        track = int(f["science/LSAR/identification/trackNumber"][()])
        frame = int(f["science/LSAR/identification/frameNumber"][()])

    print("=" * 74)
    print(f"{path.split(chr(92))[-1][:70]}")
    print(f"  track={track} frame={frame}  EPSG:{epsg}")
    print(f"  x: {x.min():.0f} .. {x.max():.0f} m   (n={len(x)}, {x[1]-x[0]:.1f} m/px)")
    print(f"  y: {y.min():.0f} .. {y.max():.0f} m   (n={len(y)}, {y[1]-y[0]:.1f} m/px)")

    t = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    # corners
    lons, lats = t.transform(
        np.array([x.min(), x.max(), x.max(), x.min()]),
        np.array([y.min(), y.min(), y.max(), y.max()]),
    )
    print(f"  scene bbox: lat {lats.min():.3f} .. {lats.max():.3f}   lon {lons.min():.3f} .. {lons.max():.3f}")

    # per-preset containment
    print(f"  {'preset':14s} {'lat':>7} {'lon':>7}   inside scene?")
    for name, lat, lon in PRESETS:
        in_lat = lats.min() <= lat <= lats.max()
        in_lon = lons.min() <= lon <= lons.max()
        # proper test: project preset into the scene CRS and check index range
        tr = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
        px, py = tr.transform(lon, lat)
        inside = (x.min() <= px <= x.max()) and (y.min() <= py <= y.max())
        if inside:
            xi = int(np.argmin(np.abs(x - px)))
            yi = int(np.argmin(np.abs(y - py)))
            print(f"  {name:14s} {lat:7.2f} {lon:7.2f}   YES  -> pixel (y={yi}, x={xi})")
        else:
            print(f"  {name:14s} {lat:7.2f} {lon:7.2f}   NO   (outside scene)")
    print()
