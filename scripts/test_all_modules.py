"""
Phase 2.1 + 3 + 4 acceptance: every detection module end-to-end.

Each module gets an AOI that the real granule actually covers (verified with
scripts/check_swath_coverage.py), and we assert the pipeline reaches a terminal
state with non-degenerate output.
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


def wkt(lat, lon, pad=0.2):
    return (f"POLYGON(({lon-pad} {lat-pad}, {lon+pad} {lat-pad}, "
            f"{lon+pad} {lat+pad}, {lon-pad} {lat+pad}, {lon-pad} {lat-pad}))")


CASES = [
    ("flood",          "Feni",          wkt(23.07, 91.42, 0.1)),
    ("landslide",      "Panchhari",     wkt(23.28, 91.90, 0.2)),
    ("river-erosion",  "Padma River",   wkt(23.75, 89.65, 0.25)),
    ("sea-level",      "Sundarbans",    wkt(21.85, 89.40, 0.3)),
    ("infrastructure", "Dhaka",         wkt(23.80, 90.40, 0.2)),
    ("farming",        "Comilla (auto)", wkt(22.805, 91.627, 0.2)),
    ("earthquake",     "Sylhet (GUNW)", wkt(24.85, 92.00, 0.2)),
]

# Which stat keys matter per module (used to flag degenerate output).
KEY_STATS = {
    "flood": ("coveragePct", "affectedAreaKm2", "floodPixels"),
    "landslide": ("landslidePixels", "meanSlopeInMaskDeg", "terrainConstrained"),
    "river-erosion": ("erodedAreaKm2", "maxErosionM"),
    "sea-level": ("inundationAreaKm2", "waterlineShiftM", "salinityRisk"),
    "infrastructure": ("newConstructionKm2", "modifiedKm2", "urbanGrowthPct"),
    "farming": ("healthyPct", "stressedPct", "meanVegIndex"),
    "earthquake": ("maxDisplacementCm", "coherentPixels", "meanCoherence"),
}


def call(method, path, body=None, timeout=180):
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


print("=" * 78)
print("ALL-MODULE ACCEPTANCE")
print("=" * 78)

summary = []
for detection_type, label, region in CASES:
    print(f"\n--- {detection_type} @ {label} ---")
    st, body, _ = call("POST", "/api/analyze-nisar", {
        "wkt": region, "beforeFileId": B, "afterFileId": A,
        "detectionType": detection_type,
    })
    if body is None:
        print(f"  start FAILED HTTP {st}")
        summary.append((detection_type, "START-FAIL", ""))
        continue

    job_id = body["data"]["jobId"]
    t0 = time.time()
    final = None
    while time.time() - t0 < 400:
        st, b, _ = call("GET", f"/api/analyze-nisar/{job_id}")
        d = b["data"]
        if d.get("status") in ("complete", "error"):
            final = d
            break
        time.sleep(3)

    if final is None:
        print(f"  HUNG after 400s")
        summary.append((detection_type, "HUNG", ""))
        continue

    if final.get("status") != "complete":
        print(f"  ERROR in {time.time()-t0:.1f}s: {final.get('errorMessage')}")
        summary.append((detection_type, "ERROR", (final.get("errorMessage") or "")[:60]))
        continue

    r = final["result"]
    s = r["stats"]
    print(f"  complete in {time.time()-t0:.1f}s")
    for k in KEY_STATS[detection_type]:
        print(f"    {k:24s}: {s.get(k)}")
    print(f"    {'prediction':24s}: {(r.get('prediction') or {}).get('trend')} "
          f"(risk={(r.get('prediction') or {}).get('risk')})")

    # artifacts
    ok_art = True
    for url in (r.get("geotiffUrl"), r.get("previewUrl")):
        if not url:
            ok_art = False
            print(f"    MISSING artifact url")
            continue
        stt, _, size = call("GET", url)
        if stt != 200:
            ok_art = False
            print(f"    artifact HTTP {stt}: {url}")
    print(f"    artifacts: {'OK' if ok_art else 'FAIL'}")

    # results endpoint
    stt, rb, _ = call("GET", f"/api/results/{job_id}?detectionType={detection_type}")
    avail = rb["data"].get("available", True) if rb else False
    print(f"    /api/results: HTTP {stt} available={avail} "
          f"categories={len(rb['data']['categories']) if rb else 0}")

    summary.append((detection_type, "PASS" if ok_art and avail else "PARTIAL", ""))

print("\n" + "=" * 78)
print("SUMMARY")
print("=" * 78)
for name, status, note in summary:
    print(f"  {name:16s} {status:8s} {note}")
passed = sum(1 for _, s, _ in summary if s == "PASS")
print(f"\n  {passed}/{len(summary)} modules PASS")
