"""Phase 1 acceptance test: real dispatch via /api/analyze + regression probe."""
import json
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "http://localhost:8000"

BEFORE = "NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001"
AFTER = "NISAR_L2_PR_GCOV_030_091_D_077_2005_DHDH_M_20260912T123454_20260912T123529_P05023_N_F_J_001"


def call(method, path, body=None, timeout=90):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Content-Type": "application/json", "x-request-id": "phase1-accept"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw.decode("utf-8")), len(raw)
            except (ValueError, UnicodeDecodeError):
                # Binary payload (GeoTIFF/PNG) — status + size is all we need.
                return r.status, None, len(raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw.decode("utf-8")), len(raw)
        except (ValueError, UnicodeDecodeError):
            return e.code, None, len(raw)


print("=" * 74)
print("PHASE 1 ACCEPTANCE")
print("=" * 74 + "\n")

# --- 1. /api/analyze WITH granule ids must run the REAL pipeline ---
print("=== /api/analyze with granule ids (real dispatch) ===")
payload = {
    "detectionType": "flood",
    "location": {"name": "Feni", "lat": 23.07, "lng": 91.42},
    "dateRange": {"before": "2026-07-02", "after": "2026-09-12"},
    "mode": "preview",
    "beforeFileId": BEFORE,
    "afterFileId": AFTER,
}
status, body, _sz = call("POST", "/api/analyze", payload)
job = body["data"]
job_id = job["id"]
print(f"  HTTP {status}  jobId={job_id}  simulated={job.get('simulated')}")

t0 = time.time()
final = None
while time.time() - t0 < 300:
    st, b, _sz = call("GET", f"/api/analyze/{job_id}")
    d = b["data"]
    if d.get("status") in ("complete", "error"):
        final = d
        break
    time.sleep(2)
print(f"  terminal in {time.time()-t0:.1f}s -> status={final.get('status') if final else 'HUNG'}")
if final:
    print(f"  stage={final.get('stage')} progress={final.get('progress')} message={final.get('message')}")
    for s in final.get("steps", []):
        print(f"    step {s['id']:12s} {s['status']}")
    if final.get("errorMessage"):
        print(f"  errorMessage: {final['errorMessage']}")
    res = final.get("result")
    if res:
        print(f"  REAL RESULT: coverage={res['stats']['coveragePct']}% "
              f"area={res['stats']['affectedAreaKm2']} km2 px={res['stats']['floodPixels']:,}")
print()

# --- 2. /api/analyze WITHOUT ids must still simulate (demo path intact) ---
print("=== /api/analyze without granule ids (demo path preserved) ===")
status, body, _sz = call("POST", "/api/analyze", {
    "detectionType": "flood",
    "location": {"name": "Feni", "lat": 23.07, "lng": 91.42},
    "dateRange": {"before": "2026-07-02", "after": "2026-09-12"},
})
sim = body["data"]
print(f"  HTTP {status}  jobId={sim['id']}  simulated={sim.get('simulated')}")
print()

# --- 3. Regression: every other endpoint still answers ---
print("=== regression probe ===")
CHECKS = [
    ("GET", "/api/health", None),
    ("GET", "/api/search-location?q=Feni", None),
    ("GET", "/api/search-location?q=London", None),
    ("GET", "/api/mission/summary", None),
    ("GET", "/api/events?pageSize=5", None),
    ("GET", f"/api/results/{job_id}?detectionType=flood", None),
    ("GET", "/api/analyze/job-nope", None),
    ("GET", "/artifacts/feni/feni_flood_mask.tif", None),
    ("GET", "/artifacts/feni/feni_flood_detection.png", None),
]
failures = []
for method, path, body in CHECKS:
    st, b, sz = call(method, path, body, timeout=60)
    expected = 404 if path == "/api/analyze/job-nope" else 200
    ok = st == expected
    if not ok:
        failures.append((path, st))
    print(f"  [{'PASS' if ok else 'FAIL'}] HTTP {st:3d} (want {expected})  {path}")

print()
print("=" * 74)
print(f"PHASE 1 ACCEPTANCE: {'PASS' if not failures and final and final.get('status') == 'complete' else 'FAIL'}")
if failures:
    print(f"  failures: {failures}")
