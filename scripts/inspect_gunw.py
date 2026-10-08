"""
Introspect the downloaded GUNW granule so the earthquake extractor targets real
dataset paths rather than assumed ones (Phase 2.1).
"""
import glob
import os
import sys

import h5py
import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

files = glob.glob(r"C:\Users\JM\NISAR_Project\nisar_data\*GUNW*.h5")
if not files:
    print("No GUNW granule found.")
    sys.exit(1)

for path in files:
    print("=" * 78)
    print(os.path.basename(path))
    print(f"  size: {os.path.getsize(path)/1e9:.2f} GB")
    print("=" * 78)

    with h5py.File(path, "r") as f:
        print("\n-- identification --")
        for key in ("missionId", "productType", "productLevel", "trackNumber",
                    "frameNumber", "orbitPassDirection", "radarBand",
                    "zeroDopplerStartTime", "zeroDopplerEndTime", "boundingPolygon"):
            p = f"science/LSAR/identification/{key}"
            if p in f:
                v = f[p][()]
                if isinstance(v, bytes):
                    v = v.decode("utf-8", "replace")
                v = str(v)
                print(f"  {key:24s}: {v[:110]}")

        print("\n-- grids --")
        if "science/LSAR/GUNW/grids" in f:
            for freq in f["science/LSAR/GUNW/grids"].keys():
                g = f[f"science/LSAR/GUNW/grids/{freq}"]
                print(f"  frequency {freq}:")
                for name in g.keys():
                    obj = g[name]
                    if isinstance(obj, h5py.Dataset):
                        print(f"    {name:38s} {str(obj.shape):18s} {obj.dtype}")
        else:
            print("  science/LSAR/GUNW/grids NOT PRESENT")

        print("\n-- products (unwrappedInterferogram / coherence / connectedComponents) --")
        hits = []

        def visit(name, obj):
            if not isinstance(obj, h5py.Dataset):
                return
            low = name.lower()
            if any(k in low for k in ("unwrapped", "coherence", "connectedcomponent",
                                      "wrappedinterferogram", "ionosphere",
                                      "reference", "secondary")):
                hits.append((name, obj.shape, str(obj.dtype)))

        f.visititems(visit)
        for name, shape, dtype in hits:
            print(f"  {name:62s} {str(shape):18s} {dtype}")

        # Value scale of the unwrapped phase, for displacement conversion.
        print("\n-- phase sample --")
        for name, shape, dtype in hits:
            if "unwrapped" in name.lower() and "ionosphere" not in name.lower():
                try:
                    d = f[name]
                    idx = tuple(slice(0, min(4, s)) for s in d.shape)
                    sample = d[idx]
                    print(f"  {name}")
                    print(f"    dtype={d.dtype}  sample_min={float(np.nanmin(sample)):.3f} "
                          f"sample_max={float(np.nanmax(sample)):.3f}")
                except Exception as exc:
                    print(f"  {name}: could not sample ({exc})")
                break

