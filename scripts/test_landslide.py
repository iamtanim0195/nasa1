"""
Phase 2.2 acceptance: landslide module on Rangamati (real SAR + real SRTM).
"""
import json
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "http://localhost:8000"

# Rangamati preset bbox — inside the local granule footprint.
RANGAMATI_WKT = "POLYGON((92.0 22.5, 92.5 22.5, 92.5 23.0, 92.0 23.0, 92.0 22.5))"

BEFORE = "NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001"
AFTER = "NISAR_L2_PR_GCOV_030_091_D_077_2005_DHDH_M_20260912T123454_20260912T123529_P05023_N_F_J_001"


def call(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data,
                                headers={"Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw.decode("utf-8")), len(raw)
            except (ValueError, UnicodeDecodeError):
                return r.status, None, len(raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw.decode("utf-8")), len(raw)
        except (ValueError, UnicodeDecodeError):
            return e.code, None, len(raw)


print("=" * 74)
print("PHASE 2.2 ACCEPTANCE — landslide module")
print("=" * 74 + "\n")

status, body, _ = call("POST", "/api/analyze-nisar", {
    "wkt": RANGAMATI_WKT, "beforeFileId": BEFORE, "afterFileId": AFTER,
    "detectionType": "landslide",
})
job_id = body["data"]["jobId"]
print(f"job {job_id} started (detectionType={body['data']['detectionType']})")

t0 = time.time()
final = None
while time.time() - t0 < 420:
    st, b, _ = call("GET", f"/api/analyze-nisar/{job_id}")
    d = b["data"]
    if d.get("status") in ("complete", "error"):
        final = d
        break
    time.sleep(3)

print(f"terminal in {time.time()-t0:.1f}s -> {final.get('status')}")
if final.get("errorMessage"):
    print(f"errorMessage: {final['errorMessage']}")
    sys.exit(1)

r = final["result"]
st_ = r["stats"]
print("\n--- stats (all derived from real data) ---")
for k in ("coveragePct", "affectedAreaKm2", "landslidePixels", "totalPixels",
          "highRiskPixels", "changePixels", "meanSlopeInMaskDeg",
          "slopeThresholdDeg", "changeThresholdDb", "terrainConstrained",
          "meanConfidence"):
    print(f"  {k:22s}: {st_.get(k)}")
print(f"  slopeBands            : {st_.get('slopeBands')}")

print("\n--- DEM provenance ---")
slope = (r["metadata"] or {}).get("slope") or {}
print(f"  demAvailable : {slope.get('demAvailable')}")
print(f"  demSource    : {slope.get('demSource')}")
print(f"  slope mean   : {slope.get('slopeMeanDeg')} deg")
print(f"  slope max    : {slope.get('slopeMaxDeg')} deg")
print(f"  elev range m : {slope.get('elevationRangeM')}")

print("\n--- prediction ---")
print(f"  {r.get('prediction')}")

print("\n--- artifacts ---")
for url in (r.get("geotiffUrl"), r.get("previewUrl")):
    if not url:
        print(f"  MISSING: {url}")
        continue
    stt, _, size = call("GET", url)
    print(f"  HTTP {stt}  {url}  ({size:,} bytes)")

print("\n--- /api/results now serves the landslide module ---")
stt, res_body, _ = call("GET", f"/api/results/{job_id}?detectionType=landslide")
d = res_body["data"]
print(f"  HTTP {stt}  available={d.get('available', True)}")
print(f"  detectionType   : {d['detectionType']}")
print(f"  categories      : {d['categories']}")
print(f"  distribution    : {d['distribution']}")
print(f"  totalAreaKm2    : {d['totalAreaKm2']}")
print(f"  eventCount      : {d['eventCount']}")
print(f"  geotiffUrl      : {d['geotiffUrl']}")

print("\n" + "=" * 74)
ok = (final.get("status") == "complete"
      and st_.get("terrainConstrained") is True
      and st_.get("landslidePixels", 0) > 0
      and slope.get("demAvailable") is True)
print(f"PHASE 2.2 LANDSLIDE: {'PASS' if ok else 'FAIL'}")
