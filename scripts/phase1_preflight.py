"""Phase 1 preflight: verify what the master prompt assumes actually exists."""
import importlib
import sys

print("=== Python:", sys.version.split()[0])

print("\n=== Http clients (Phase 1.2 Nominatim needs one) ===")
for m in ("requests", "httpx", "urllib3", "aiohttp"):
    try:
        mod = importlib.import_module(m)
        print(f"  OK    {m:10s} {getattr(mod, '__version__', '?')}")
    except Exception as e:
        print(f"  FAIL  {m:10s} {type(e).__name__}")

print("\n=== Phase 5 AI needs sklearn ===")
for m in ("sklearn", "scipy", "pandas"):
    try:
        mod = importlib.import_module(m)
        print(f"  OK    {m:10s} {getattr(mod, '__version__', '?')}")
    except Exception as e:
        print(f"  FAIL  {m:10s} {type(e).__name__}")

print("\n=== Phase 2.2 landslide needs scipy for morphology ===")
try:
    from scipy import ndimage
    print("  OK    scipy.ndimage available")
except Exception as e:
    print(f"  FAIL  scipy.ndimage: {type(e).__name__}")

print("\n=== Phase 6 frontend already has Cesium? ===")
import os
pkg = r"C:\Users\JM\NISAR_Project\frontend\package.json"
if os.path.exists(pkg):
    import json
    deps = json.load(open(pkg, encoding="utf-8"))
    all_deps = {**deps.get("dependencies", {}), **deps.get("devDependencies", {})}
    for k in ("cesium", "resium", "leaflet", "georaster", "recharts"):
        print(f"  {'OK   ' if k in all_deps else 'FAIL '} {k:12s} {all_deps.get(k, '(not installed)')}")
