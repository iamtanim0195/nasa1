"""
Can the earthquake module be REAL?

Phase 2.1 needs the GUNW product (interferometric phase -> displacement).
We only have GCOV locally, which carries amplitude and no phase, so a
"GCOV phase approximation" is not physically possible.

This checks whether GUNW granules actually exist over the Sylhet preset.
"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Sylhet Fault preset bbox (from the backend preset list)
BBOX = (91.5, 24.5, 92.5, 25.2)
WINDOW = ("2026-08-01", "2026-10-01")

CANDIDATES = [
    "NISAR_L2_GUNW_PROVISIONAL_V1",
    "NISAR_L2_PR_GUNW_PROVISIONAL_V1",
    "NISAR_L2_GUNW_BETA_V1",
]

try:
    import earthaccess
except Exception as exc:
    print(f"earthaccess unavailable: {exc}")
    sys.exit(1)

print("Logging in to NASA Earthdata...")
try:
    earthaccess.login(strategy="netrc", persist=True)
    print("  login OK\n")
except Exception as exc:
    print(f"  login FAILED: {exc}")
    sys.exit(1)

for short_name in CANDIDATES:
    print(f"=== short_name={short_name} ===")
    try:
        results = earthaccess.search_data(
            short_name=short_name,
            temporal=WINDOW,
            bounding_box=BBOX,
            count=20,
        )
    except Exception as exc:
        print(f"  search error: {type(exc).__name__}: {str(exc)[:200]}\n")
        continue

    print(f"  granules found over Sylhet bbox {BBOX} in {WINDOW}: {len(results)}")
    for r in results[:5]:
        umm = r.get("umm", {})
        granule = r.get("meta", {}).get("native-id", "?")
        size = 0
        try:
            size = umm["DataGranule"]["ArchiveAndDistributionInformation"][0]["SizeInBytes"]
        except Exception:
            pass
        print(f"    {granule[:78]}  {size/1e9:.2f} GB")
    print()

# Also: does ANY GUNW exist at all (no bbox), to distinguish "product absent"
# from "nothing over this AOI"?
print("=== sanity: does the product exist anywhere? (no bbox) ===")
for short_name in CANDIDATES[:2]:
    try:
        results = earthaccess.search_data(short_name=short_name, count=5)
        print(f"  {short_name}: {len(results)} granules globally")
        for r in results[:2]:
            print(f"      {r.get('meta', {}).get('native-id', '?')[:90]}")
    except Exception as exc:
        print(f"  {short_name}: error {type(exc).__name__}: {str(exc)[:140]}")
