"""
Phase 7.1 as written: PASS/FAIL per module using the presets the UI exposes.

Earlier verification used AOIs I chose. This uses the exact preset list a judge
can click in the Control Panel, so a preset that cannot produce a result is
caught rather than discovered live during the demo.
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

# Exactly the AOI_PRESETS the frontend ships (name, lat, lng, detectionType).
PRESETS = [
    ("Feni",         23.07, 91.42, "flood"),
    ("Sunamganj",    25.00, 91.25, "flood"),
    ("Sylhet Fault", 24.85, 92.00, "earthquake"),
    ("Rangamati",    22.75, 92.25, "landslide"),
    ("Panchhari",    23.28, 91.90, "landslide"),
    ("Dhaka",        23.80, 90.40, "infrastructure"),
    ("Rajshahi",     24.40, 88.60, "farming"),
    ("Padma River",  23.75, 89.65, "river-erosion"),
    ("Sundarbans",   21.85, 89.40, "sea-level"),
]


def wkt(lat, lon, pad=0.1):
    return (f"POLYGON(({lon-pad} {lat-pad}, {lon+pad} {lat-pad}, "
            f"{lon+pad} {lat+pad}, {lon-pad} {lat+pad}, {lon-pad} {lat-pad}))")


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=90) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


print("=" * 100)
print("PHASE 7.1 — PASS/FAIL USING THE PRESETS THE UI EXPOSES")
print("=" * 100)
print(f"\n{'preset':14s} {'module':15s} {'result':8s} {'preview':8s} {'predict':9s} detail")
print("-" * 100)

rows = []
for name, lat, lng, module in PRESETS:
    started = time.time()
    try:
        resp = post("/api/analyze-nisar", {
            "wkt": wkt(lat, lng), "beforeFileId": B, "afterFileId": A,
            "detectionType": module,
        })
    except Exception as exc:
        print(f"{name:14s} {module:15s} {'START-FAIL':8s} {'-':8s} {'-':9s} {exc}")
        rows.append((name, module, "START-FAIL", ""))
        continue

    job_id = resp["data"]["jobId"]
    final = None
    while time.time() - started < 360:
        st, body = get(f"/api/analyze-nisar/{job_id}")
        if body and body["data"].get("status") in ("complete", "error"):
            final = body["data"]
            break
        time.sleep(3)

    if final is None:
        print(f"{name:14s} {module:15s} {'HUNG':8s}")
        rows.append((name, module, "HUNG", ""))
        continue

    if final.get("status") != "complete":
        msg = (final.get("errorMessage") or "")[:52]
        print(f"{name:14s} {module:15s} {'ERROR':8s} {'-':8s} {'-':9s} {msg}")
        rows.append((name, module, "ERROR", msg))
        continue

    r = final["result"]
    prev = r.get("previewUrl")
    pst = get(prev)[0] if prev else None
    pred = r.get("prediction") or {}
    detail = (f"{time.time()-started:.0f}s  {r['stats'].get('affectedAreaKm2')} km2  "
              f"trend={pred.get('trend')}")
    ok = pst == 200
    print(f"{name:14s} {module:15s} {'PASS' if ok else 'PARTIAL':8s} "
          f"{str(pst):8s} {str(pred.get('trend')):9s} {detail}")
    rows.append((name, module, "PASS" if ok else "PARTIAL", detail))

print("\n" + "=" * 100)
passed = [r for r in rows if r[2] == "PASS"]
broken = [r for r in rows if r[2] in ("ERROR", "START-FAIL", "HUNG")]
partial = [r for r in rows if r[2] == "PARTIAL"]
print(f"PASS {len(passed)}/{len(rows)}   PARTIAL {len(partial)}   BROKEN {len(broken)}")
if broken:
    print("\nPRESETS A JUDGE CAN CLICK THAT FAIL:")
    for name, module, status, msg in broken:
        print(f"  {name:14s} ({module})  {msg}")
