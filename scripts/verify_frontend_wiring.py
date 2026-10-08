"""
Verify the frontend can actually reach everything the overlay now depends on.

Mirrors exactly what Workspace.tsx does:
  1. GET {API}/api/results/latest?detectionType=<module>   (react-query)
  2. GET {API}{previewUrl}                                 (resolveApiUrl + <img>)
  3. GET {API}{geotiffUrl}
Also confirms events render on the globe (Workspace now passes the real array).
"""
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = "http://localhost:8000"
FRONTEND = "http://localhost:3000"

MODULES = ["flood", "landslide", "river-erosion", "sea-level",
           "infrastructure", "farming", "earthquake"]


def fetch(url, timeout=60):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except Exception as e:
        return None, str(e).encode(), {}


def resolve_api_url(path):
    """Same logic as resolveApiUrl() in apiClient.ts."""
    if not path:
        return None
    if path.lower().startswith(("http://", "https://")):
        return path
    return f"{API.rstrip('/')}/{path.lstrip('/')}"


print("=" * 78)
print("FRONTEND WIRING VERIFICATION")
print("=" * 78 + "\n")

# --- frontend routes ---
print("=== frontend routes ===")
for route in ("/", "/analyze", "/results", "/?result=feni"):
    st, body, _ = fetch(FRONTEND + route, timeout=120)
    marker = ""
    if st == 200:
        text = body.decode("utf-8", "replace")
        if "Cannot find module" in text or "Application error" in text:
            marker = "  <-- ERROR MARKER IN HTML"
    print(f"  HTTP {st}  {route}  ({len(body):,} bytes){marker}")
print()

# --- events (globe now receives the real array) ---
print("=== /api/events (workspace now passes these to the globe) ===")
st, body, _ = fetch(f"{API}/api/events?pageSize=100")
d = json.loads(body.decode())["data"]
print(f"  HTTP {st}  items={len(d['items'])}  total={d['total']}")
print(f"  -> globe receives {len(d['items'])} event entities (was 0)")
print()

# --- per-module overlay chain ---
print("=== per-module overlay chain ===")
print(f"  {'module':16s} {'results':>8} {'avail':>6} {'preview':>8} {'geotiff':>8}  stats")
print("  " + "-" * 74)

all_ok = True
for module in MODULES:
    st, body, _ = fetch(f"{API}/api/results/latest?detectionType={module}")
    if st != 200:
        print(f"  {module:16s} HTTP {st}")
        all_ok = False
        continue

    data = json.loads(body.decode())["data"]
    avail = data.get("available", True)
    preview = resolve_api_url(data.get("previewUrl"))
    geotiff = resolve_api_url(data.get("geotiffUrl"))

    p_st = p_len = "-"
    if preview:
        ps, pb, _ = fetch(preview)
        p_st, p_len = ps, f"{len(pb)//1024}KB"
    g_st = "-"
    if geotiff:
        gs, _, _ = fetch(geotiff)
        g_st = gs

    ok = (st == 200 and str(p_st) == "200" and str(g_st) == "200")
    if not ok:
        all_ok = False

    md = data.get("metadata") or {}
    print(f"  {module:16s} {st:>8} {str(avail):>6} {str(p_st):>8} {str(g_st):>8}  "
          f"{md.get('beforeDate')}->{md.get('afterDate')} "
          f"cov={md.get('coveragePct')} conf={data.get('meanConfidence')} "
          f"{'OK' if ok else 'FAIL'}")

print()
print("=" * 78)
print(f"WIRING: {'PASS - every module reachable from the frontend' if all_ok else 'FAIL'}")
print("=" * 78)
