"""
Fetch an SRTM DEM for a Bangladesh AOI via NASA earthaccess.

Phase 2.2's landslide module needs a slope filter. `backend/static/srtm_bangladesh.tif`
does not exist, so this locates and downloads the real SRTM tiles instead.

Rangamati preset: 22.75 N, 92.25 E -> SRTM tile N22E092.
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT_DIR = r"C:\Users\JM\NISAR_Project\nisar_data\dem"
os.makedirs(OUT_DIR, exist_ok=True)

# Rangamati bbox (from the backend preset list), padded slightly.
BBOX = (92.0, 22.5, 92.5, 23.0)

CANDIDATES = ["SRTMGL1", "SRTMGL3", "SRTMGL1N"]

import earthaccess  # noqa: E402

print("Logging in to NASA Earthdata...")
earthaccess.login(strategy="netrc", persist=True)
print("  login OK\n")

found = None
for short_name in CANDIDATES:
    print(f"=== short_name={short_name} over bbox {BBOX} ===")
    try:
        results = earthaccess.search_data(
            short_name=short_name,
            bounding_box=BBOX,
            count=10,
        )
    except Exception as exc:
        print(f"  search error: {type(exc).__name__}: {str(exc)[:160]}\n")
        continue

    print(f"  granules: {len(results)}")
    for r in results:
        granule = r.get("meta", {}).get("native-id", "?")
        print(f"    {granule}")
    if results and found is None:
        found = (short_name, results)
    print()

if not found:
    print("No SRTM granules found. Landslide will need the change-only fallback.")
    sys.exit(2)

short_name, results = found
print(f"=== downloading {len(results)} granule(s) from {short_name} ===")
try:
    paths = earthaccess.download(results, local_path=OUT_DIR)
except Exception as exc:
    print(f"  download FAILED: {type(exc).__name__}: {exc}")
    sys.exit(3)

print(f"  downloaded {len(paths)} file(s):")
for p in paths:
    print(f"    {p}  ({os.path.getsize(p)/1e6:.1f} MB)")

print("\n=== can rasterio read them? ===")
import rasterio  # noqa: E402

for p in paths:
    try:
        with rasterio.open(p) as src:
            print(f"  {os.path.basename(p)}: {src.width}x{src.height} "
                  f"crs={src.crs} dtype={src.dtypes[0]} nodata={src.nodata}")
    except Exception as exc:
        print(f"  {os.path.basename(p)}: rasterio cannot open -> {type(exc).__name__}: {str(exc)[:120]}")
        print("     (likely a .hgt.zip that needs extracting)")
