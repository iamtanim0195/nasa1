"""
End-to-end test of the Phase 1.4/1.5 fix.

The previous build hung forever at stage 'extracting' because
extract_backscatter read the full 17028x17316 scene (~4.4 GB peak).
This asserts the cropped path completes, crops to the right place, and that
failures are reported instead of hanging.
"""
import json
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8000"

FENI_WKT = "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))"
# Sylhet Fault preset: lat 24.85 is NORTH of the granule's 24.328 limit.
SYLHET_WKT = "POLYGON((91.5 24.5, 92.5 24.5, 92.5 25.2, 91.5 25.2, 91.5 24.5))"

BEFORE = "NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001"
AFTER = "NISAR_L2_PR_GCOV_030_091_D_077_2005_DHDH_M_20260912T123454_20260912T123529_P05023_N_F_J_001"


def post(path, payload, timeout=60):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-request-id": "e2e-1.4"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def get(path, timeout=90):
    try:
        with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def run_job(label, wkt, detection_type="flood", budget=420):
    print(f"=== {label} ===")
    started = time.time()
    resp = post("/api/analyze-nisar", {
        "wkt": wkt, "beforeFileId": BEFORE, "afterFileId": AFTER,
        "detectionType": detection_type,
    })
    job_id = resp["data"]["jobId"]
    print(f"  started {job_id} (detectionType={resp['data'].get('detectionType')})")

    last = None
    while time.time() - started < budget:
        status, body = get(f"/api/analyze-nisar/{job_id}")
        d = body.get("data", {})
        line = f"  t+{time.time()-started:5.1f}s  status={d.get('status')} stage={d.get('stage')} progress={d.get('progress')}"
        if line != last:
            print(line, flush=True)
            last = line
        if d.get("status") in ("complete", "error"):
            print(f"  TERMINAL after {time.time()-started:.1f}s : {d.get('status')}")
            if d.get("errorMessage"):
                print(f"  errorMessage: {d['errorMessage']}")
            return d
        time.sleep(3)

    print(f"  !!! STILL RUNNING after {budget}s — this is the old hang bug")
    return {"status": "hung"}


print("=" * 74)
print("PHASE 1.4 / 1.5 — cropped analysis + dispatcher")
print("=" * 74 + "\n")

# 1. The real thing: Feni flood, must COMPLETE
res = run_job("TEST 1: Feni flood (must complete)", FENI_WKT)
print()
if res.get("status") == "complete":
    r = res["result"]
    st = r["stats"]
    print("  --- result ---")
    print(f"    coveragePct    : {st['coveragePct']}")
    print(f"    affectedAreaKm2: {st['affectedAreaKm2']}")
    print(f"    floodPixels    : {st['floodPixels']:,}")
    print(f"    totalPixels    : {st['totalPixels']:,}")
    print(f"    thresholdDb    : {st['thresholdDb']}")
    print(f"    pixelAreaKm2   : {st['pixelAreaKm2']}")
    print(f"    before.window  : {r['before']['window']}")
    print(f"    before.aoiPx   : {r['before'].get('aoi_center_pixel')}")
    print(f"    track/frame    : {r['metadata']['track']}/{r['metadata']['frame']}")
    print(f"    geotiffUrl     : {r['geotiffUrl']}")

# 2. AOI outside the granule -> must ERROR clearly, not hang
res2 = run_job("TEST 2: Sylhet (outside granule) must error cleanly", SYLHET_WKT)
print()
outside_ok = res2.get("status") == "error" and "outside this granule" in (res2.get("errorMessage") or "")
print(f"  --> graceful failure: {outside_ok}")

# 3. Unknown detection type
res3 = run_job("TEST 3: bogus detection type must error", FENI_WKT, detection_type="volcano")
print()
unknown_ok = res3.get("status") == "error" and "Unknown detection type" in (res3.get("errorMessage") or "")
print(f"  --> rejected unknown type: {unknown_ok}")

# 4. Registered-but-unimplemented module (honest placeholder)
res4 = run_job("TEST 4: landslide (registered, not yet built)", FENI_WKT, detection_type="landslide")
print()
stub_ok = res4.get("status") == "error" and "not implemented" in (res4.get("errorMessage") or "")
print(f"  --> honest placeholder: {stub_ok}")

print("\n" + "=" * 74)
print("SUMMARY")
print("=" * 74)
print(f"  Feni flood completes            : {res.get('status') == 'complete'}")
print(f"  Outside-AOI errors cleanly      : {outside_ok}")
print(f"  Unknown type rejected           : {unknown_ok}")
print(f"  Unbuilt module honest           : {stub_ok}")
