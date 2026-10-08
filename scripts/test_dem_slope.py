"""
Validate the DEM -> slope -> SAR-grid chain for Rangamati.

Rangamati sits in the Chittagong Hill Tracts, so a correct slope product must
show genuinely steep terrain. Flat output would mean the reprojection is
misaligned (silently reading the wrong window).
"""
import os
import sys

sys.path.insert(0, r"C:\Users\JM\NISAR_Project\backend")
os.chdir(r"C:\Users\JM\NISAR_Project\backend")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np

from api.services import nisar_processor as N
from api.services import dem

RANGAMATI_WKT = "POLYGON((92.0 22.5, 92.5 22.5, 92.5 23.0, 92.0 23.0, 92.0 22.5))"
FENI_WKT = "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))"

BEFORE = N.glob.glob(os.path.join(N.NISAR_DATA_FOLDER, "*20260702*.h5"))[0]
print(f"granule: {os.path.basename(BEFORE)}\n")

print("=== SRTM tiles on disk ===")
for path, s, w, n, e in dem.available_tiles():
    print(f"  {os.path.basename(path):32s} S{s} W{w} N{n} E{e}")
print()

for label, wkt in (("RANGAMATI (should be STEEP)", RANGAMATI_WKT),
                   ("FENI (should be FLAT)", FENI_WKT)):
    print(f"=== {label} ===")
    data = N.extract_backscatter(BEFORE, wkt=wkt, crop_size=3000)
    print(f"  window       : {data['window']}")
    print(f"  shape        : {data['shape']}")
    print(f"  aoi center px: {data['aoi_center_pixel']}")

    slope, meta = dem.slope_on_sar_grid(data)
    print(f"  demAvailable : {meta.get('demAvailable')}")
    if slope is None:
        print(f"  reason       : {meta.get('reason')}\n")
        continue

    print(f"  demTiles     : {meta.get('demTiles')}")
    print(f"  elevation m  : {meta.get('elevationRangeM')}")
    print(f"  slope deg    : min={meta['slopeMinDeg']} mean={meta['slopeMeanDeg']} max={meta['slopeMaxDeg']}")
    print(f"  slope valid% : {meta['slopeValidPct']}")

    finite = slope[np.isfinite(slope)]
    for thr in (5, 15, 25, 35):
        pct = 100.0 * np.count_nonzero(finite > thr) / finite.size if finite.size else 0
        print(f"    > {thr:2d} deg : {pct:5.1f}% of AOI")
    print()
