"""UTF-8-safe test of /api/search-location (Windows console is cp1252)."""
import json
import sys
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

QUERIES = ["Feni", "London", "Dhaka", "Sundarbans", "Tokyo", "Rangamati"]

for q in QUERIES:
    url = "http://localhost:8000/api/search-location?" + urllib.parse.urlencode({"q": q})
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except Exception as exc:
        print(f"=== q={q} === FAIL {type(exc).__name__}: {exc}\n")
        continue

    data = payload["data"]
    print(f"=== q={q} === HTTP 200  count={len(data)}")
    for item in data:
        bbox = ", ".join(f"{v:.3f}" for v in item["bbox"])
        print(f"    [{item['source']:6s}] {item['name'][:34]:34s} "
              f"{item['country'][:18]:18s} {item['lat']:8.3f} {item['lng']:9.3f}  bbox=[{bbox}]")
    print()

# Contract check against the frontend GeoLocation shape.
print("=== contract check (required keys present on every row) ===")
REQUIRED = {"id", "name", "country", "region", "lat", "lng", "bbox", "altitude", "source"}
with urllib.request.urlopen(
    "http://localhost:8000/api/search-location?" + urllib.parse.urlencode({"q": "London"}),
    timeout=30,
) as r:
    rows = json.loads(r.read().decode("utf-8"))["data"]
bad = [row.get("id") for row in rows if not REQUIRED.issubset(row.keys())]
print(f"  rows checked: {len(rows)}   rows missing keys: {bad or 'NONE'}")
if rows:
    print(f"  bbox is 4 numerics: {all(len(x['bbox']) == 4 for x in rows)}")
    print(f"  bbox order [W,S,E,N]: {[round(v,3) for v in rows[0]['bbox']]}")
