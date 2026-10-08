"""
Re-test the primary demo flow after the fix.

Before: POST /api/analyze-nisar -> 200, but GET /api/analyze/{id} -> 404, so the
/analyze redirect target showed "No D-SAR-D run in this session".
"""
import json
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "http://localhost:8000"

B = "NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001"
A = "NISAR_L2_PR_GCOV_030_091_D_077_2005_DHDH_M_20260912T123454_20260912T123529_P05023_N_F_J_001"
WKT = "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


resp = post("/api/analyze-nisar", {
    "wkt": WKT, "beforeFileId": B, "afterFileId": A, "detectionType": "flood",
})
job_id = resp["data"]["jobId"]
print(f"NISAR job: {job_id}   detectionType echoed: {resp['data'].get('detectionType')}\n")

# Poll the endpoint the /analyze page uses - this used to 404.
print("--- polling GET /api/analyze/{id}  (the /analyze page's endpoint) ---")
final = None
t0 = time.time()
while time.time() - t0 < 300:
    st, body = get(f"/api/analyze/{job_id}")
    if st != 200:
        print(f"  HTTP {st} - STILL BROKEN")
        break
    d = body["data"]
    print(f"  t+{time.time()-t0:5.1f}s  HTTP {st}  stage={d['stage']:11s} "
          f"progress={d['progress']:3d}  status={d.get('status')}")
    if d.get("status") in ("complete", "error"):
        final = d
        break
    time.sleep(4)

print()
if final and final.get("status") == "complete":
    print("  RESULT: complete")
    print(f"    detectionType : {final['detectionType']}")
    print(f"    steps         : {[(s['id'], s['status']) for s in final['steps']]}")
    r = final.get("result") or {}
    print(f"    flood pixels  : {(r.get('stats') or {}).get('floodPixels')}")
    print(f"    affected km2  : {(r.get('stats') or {}).get('affectedAreaKm2')}")

print("\n--- the other two endpoints the Analyze panels call ---")
for suffix in ("extractions", "widgets"):
    st, body = get(f"/api/analyze/{job_id}/{suffix}")
    n = len(body["data"]) if (st == 200 and isinstance(body.get("data"), list)) else "-"
    print(f"  GET /api/analyze/{{id}}/{suffix:12s} -> HTTP {st}  items={n}")

print("\n--- regression: a genuinely unknown id must still 404 ---")
st, _ = get("/api/analyze/job-doesnotexist")
print(f"  GET /api/analyze/job-doesnotexist -> HTTP {st} (want 404)")

print("\n" + "=" * 70)
ok = (final is not None and final.get("status") == "complete")
print(f"DEMO FLOW: {'CONNECTED' if ok else 'STILL BROKEN'}")
print("=" * 70)
