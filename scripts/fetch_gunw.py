"""
Download ONE GUNW granule for the Sylhet AOI (Phase 2.1 earthquake module).

A GUNW granule IS an interferogram - it already encodes the phase between two
acquisitions - so one granule yields one deformation map. Downloading two, as
the plan originally said, would be redundant.

Also introspects the HDF5 layout so the extractor targets real dataset paths
instead of assumed ones.
"""
import glob
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT_DIR = r"C:\Users\JM\NISAR_Project\nisar_data"
SYLHET_BBOX = (91.5, 24.5, 92.5, 25.2)
# Widen the window so we have candidates to choose from.
WINDOW = ("2026-06-01", "2026-10-01")

SHORT_NAME = "NISAR_L2_GUNW_PROVISIONAL_V1"

import earthaccess  # noqa: E402

print("Logging in...")
earthaccess.login(strategy="netrc", persist=True)
print("  OK\n")

results = earthaccess.search_data(
    short_name=SHORT_NAME,
    temporal=WINDOW,
    bounding_box=SYLHET_BBOX,
    count=40,
)
print(f"GUNW granules over Sylhet in {WINDOW}: {len(results)}\n")

if not results:
    print("No GUNW granules; earthquake module cannot be real.")
    sys.exit(2)

# Prefer a descending-pass granule (matches our GCOV track 091 orientation) and
# the smallest file, to keep the download bounded.
scored = []
for r in results:
    umm = r.get("umm", {})
    granule = r.get("meta", {}).get("native-id", "")
    try:
        size = umm["DataGranule"]["ArchiveAndDistributionInformation"][0]["SizeInBytes"]
    except Exception:
        size = 0
    orbit = "D" if "_D_" in granule else ("A" if "_A_" in granule else "?")
    scored.append((size, orbit, granule, r))

scored.sort(key=lambda s: (s[1] != "D", s[0]))
print("candidates (descending-pass first, smallest first):")
for size, orbit, granule, _ in scored[:8]:
    print(f"  [{orbit}] {size/1e9:5.2f} GB  {granule[:76]}")

chosen = scored[0]
print(f"\nchosen: {chosen[2]}\n  size: {chosen[0]/1e9:.2f} GB  orbit pass: {chosen[1]}")

print("\ndownloading...")
paths = earthaccess.download([chosen[3]], local_path=OUT_DIR)
print(f"  -> {paths}")

for p in paths:
    print(f"  {os.path.basename(p)}  ({os.path.getsize(p)/1e9:.2f} GB)")

# ---- Introspect the GUNW layout so the extractor uses real paths ----
print("\n" + "=" * 74)
print("GUNW HDF5 LAYOUT (drives the earthquake extractor)")
print("=" * 74)

import h5py  # noqa: E402

for p in paths:
    if p.endswith(".zip"):
        print(f"  {os.path.basename(p)} is a zip; skipping introspection")
        continue
    with h5py.File(p, "r") as f:
        hits = []

        def visit(name, obj):
            if not isinstance(obj, h5py.Dataset):
                return
            low = name.lower()
            if any(k in low for k in ("unwrapped", "coherence", "connected",
                                      "interferogram", "wrapped", "mask")):
                hits.append((name, obj.shape, str(obj.dtype)))

        f.visititems(visit)
    print(f"\n  {os.path.basename(p)}")
    print(f"  identification keys: {list(f.keys()) if False else ''}")
    for name, shape, dtype in hits:
        print(f"    {name}  {shape} {dtype}")
    if not hits:
        print("    (no interferometric datasets matched)")
