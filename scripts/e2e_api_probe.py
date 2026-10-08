"""
E2E API probe for Earth Metamorphosis backend.
Read-only: exercises every documented endpoint and reports status + shape.
Usage: python scripts/e2e_api_probe.py
"""
import json
import urllib.request
import urllib.error
import time

BASE = "http://localhost:8000"
RESULTS = []


def call(method, path, body=None, timeout=25):
    url = BASE + path
    data = None
    headers = {"x-request-id": "e2e-probe"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            ms = int((time.time() - t0) * 1000)
            return r.status, raw, ms
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        ms = int((time.time() - t0) * 1000)
        return e.code, raw, ms
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return None, f"{type(e).__name__}: {e}", ms


def summarize(raw, limit=300):
    try:
        obj = json.loads(raw)
    except Exception:
        return raw[:limit]
    # unwrap envelope
    if isinstance(obj, dict) and "data" in obj and "meta" in obj:
        d = obj["data"]
        if isinstance(d, list):
            kind = f"LIST[{len(d)}]"
            first = d[0] if d else None
        elif isinstance(d, dict):
            kind = f"DICT keys={list(d.keys())}"
            first = None
        else:
            kind = type(d).__name__
            first = None
        return f"envelope OK | data={kind}" + (f"\n      first item keys={list(first.keys())}" if isinstance(first, dict) else "")
    return "NOT ENVELOPED: " + raw[:limit]


def record(name, method, path, status, raw, ms, body=None):
    ok = status == 200
    RESULTS.append({"name": name, "method": method, "path": path, "status": status,
                    "ms": ms, "ok": ok, "body": body, "raw": raw})
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {method:4s} {path}")
    print(f"        -> HTTP {status} in {ms}ms")
    s = summarize(raw)
    for line in s.splitlines():
        print(f"        {line}")
    if not ok:
        print(f"        RAW: {raw[:400]}")
    print()
    return raw


print("=" * 78)
print("E2E API PROBE - Earth Metamorphosis backend (port 8000)")
print("=" * 78 + "\n")

# ---------- health / root ----------
s, r, ms = call("GET", "/")
record("root", "GET", "/", s, r, ms)

s, r, ms = call("GET", "/api/health")
record("health", "GET", "/api/health", s, r, ms)

# ---------- openapi ----------
s, r, ms = call("GET", "/openapi.json")
if s == 200:
    spec = json.loads(r)
    paths = sorted(spec.get("paths", {}).keys())
    print(f"[INFO] OpenAPI declares {len(paths)} paths:")
    for p in paths:
        methods = ",".join(sorted(m.upper() for m in spec["paths"][p]))
        print(f"        {methods:12s} {p}")
    print()
    RESULTS.append({"name": "openapi", "method": "GET", "path": "/openapi.json",
                    "status": s, "ms": ms, "ok": True, "raw": r, "body": None})
else:
    record("openapi", "GET", "/openapi.json", s, r, ms)

# ---------- location search ----------
s, r, ms = call("GET", "/api/search-location?q=Feni")
record("search-location Feni", "GET", "/api/search-location?q=Feni", s, r, ms)

s, r, ms = call("GET", "/api/search-location?q=zzzznomatch")
record("search-location no-match", "GET", "/api/search-location?q=zzzznomatch", s, r, ms)

# ---------- mission ----------
s, r, ms = call("GET", "/api/mission/summary")
record("mission summary", "GET", "/api/mission/summary", s, r, ms)

# ---------- events ----------
s, r, ms = call("GET", "/api/events?pageSize=5&page=1")
record("events list", "GET", "/api/events?pageSize=5&page=1", s, r, ms)
events_raw = r
first_event_id = None
try:
    first_event_id = json.loads(r)["data"]["items"][0]["id"]
except Exception:
    pass

# Determinism check: call twice, compare
s2, r2, ms2 = call("GET", "/api/events?pageSize=5&page=1")
same = (r == r2 and s == s2)
print(f"[INFO] /api/events determinism across 2 identical calls: {'STABLE' if same else 'UNSTABLE (bodies differ)'}")
RESULTS.append({"name": "events determinism", "method": "GET", "path": "/api/events (x2)",
                "status": s, "ms": ms2, "ok": same, "raw": "", "body": None})
print()

# The critical cross-endpoint test: ID from list -> detail
if first_event_id:
    s, r, ms = call("GET", f"/api/events/{first_event_id}")
    record(f"event detail for id from list ({first_event_id})", "GET", f"/api/events/{first_event_id}", s, r, ms)
    if s != 200:
        print(f"        ^^^ CROSS-ENDPOINT BUG: id {first_event_id} came from /api/events")
        print(f"            but /api/events/{{id}} returned HTTP {s}\n")

s, r, ms = call("GET", "/api/events/event-001")
record("event detail event-001", "GET", "/api/events/event-001", s, r, ms)

# ---------- analyze (mock/deterministic) ----------
payload = {
    "detectionType": "flood",
    "location": {"name": "Feni", "lat": 23.07, "lng": 91.42},
    "dateRange": {"before": "2026-07-02", "after": "2026-09-12"},
    "mode": "preview",
}
s, r, ms = call("POST", "/api/analyze", payload)
record("create analysis", "POST", "/api/analyze", s, r, ms, body=payload)
job_id = None
try:
    job_id = json.loads(r)["data"]["id"]
except Exception:
    pass

if job_id:
    s, r, ms = call("GET", f"/api/analyze/{job_id}")
    record(f"analysis status {job_id}", "GET", f"/api/analyze/{job_id}", s, r, ms)

    s, r, ms = call("GET", f"/api/analyze/{job_id}/extractions")
    record("extractions", "GET", f"/api/analyze/{job_id}/extractions", s, r, ms)

    s, r, ms = call("GET", f"/api/analyze/{job_id}/widgets")
    record("widgets", "GET", f"/api/analyze/{job_id}/widgets", s, r, ms)

    s, r, ms = call("GET", f"/api/results/{job_id}")
    record("results", "GET", f"/api/results/{job_id}", s, r, ms)

# 404 behaviour
s, r, ms = call("GET", "/api/analyze/job-doesnotexist")
record("analysis 404 (bogus id)", "GET", "/api/analyze/job-doesnotexist", s, r, ms)

# ---------- results with arbitrary id (claimed deterministic) ----------
s, r, ms = call("GET", "/api/results/totally-made-up-id")
record("results with bogus id", "GET", "/api/results/totally-made-up-id", s, r, ms)

# ---------- static assets advertised by results ----------
for asset in ["/static/feni_flood_mask.tif", "/static/feni_flood_detection.png"]:
    s, r, ms = call("GET", asset)
    record(f"advertised asset {asset}", "GET", asset, s, r, ms)

# ---------- NISAR live search (needs Earthdata creds) ----------
s, r, ms = call("POST", "/api/search-nisar-files", {
    "wkt": "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))",
    "beforeDate": "2026-06-01",
    "afterDate": "2026-09-30",
    "detectionType": "flood",
}, timeout=60)
record("search-nisar-files (live Earthdata)", "POST", "/api/search-nisar-files", s, r, ms)

# ---------- NISAR analyze (background, real file ids) ----------
s, r, ms = call("POST", "/api/analyze-nisar", {
    "wkt": "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))",
    "beforeFileId": "NISAR_L2_PR_GCOV_024_091_D_077_2005_DHDH_M_20260702T123457_20260702T123531_P05023_N_F_J_001",
    "afterFileId": "NISAR_L2_PR_GCOV_030_091_D_077_2005_DHDH_M_20260912T123454_20260912T123529_P05023_N_F_J_001",
    "detectionType": "flood",
})
record("analyze-nisar start", "POST", "/api/analyze-nisar", s, r, ms)
nisar_job = None
try:
    nisar_job = json.loads(r)["data"]["jobId"]
except Exception:
    pass

if nisar_job:
    for attempt in range(3):
        time.sleep(2)
        s, r, ms = call("GET", f"/api/analyze-nisar/{nisar_job}")
        try:
            st = json.loads(r)["data"]
            print(f"[INFO] poll {attempt+1}: status={st.get('status')} stage={st.get('stage')} "
                  f"progress={st.get('progress')} err={st.get('errorMessage')}")
        except Exception:
            print(f"[INFO] poll {attempt+1}: HTTP {s} raw={r[:200]}")
    RESULTS.append({"name": "analyze-nisar poll", "method": "GET",
                    "path": f"/api/analyze-nisar/{nisar_job}", "status": s, "ms": ms,
                    "ok": True, "raw": r, "body": None})
    s, r, ms = call("GET", f"/api/analyze-nisar/{nisar_job}/result")
    record("analyze-nisar result (not complete -> 400 expected)", "GET",
           f"/api/analyze-nisar/{nisar_job}/result", s, r, ms)

# ---------- summary ----------
print("=" * 78)
print("SUMMARY")
print("=" * 78)
hard_fail = [x for x in RESULTS if not x["ok"]]
print(f"Probes run: {len(RESULTS)}   Passing: {len(RESULTS)-len(hard_fail)}   Non-200: {len(hard_fail)}\n")
print(f"{'STATUS':>7}  {'METHOD':6} {'PATH'}")
for x in RESULTS:
    print(f"{str(x['status']):>7}  {x['method']:6} {x['path']}")

with open("output/e2e_api_probe_results.json", "w", encoding="utf-8") as f:
    json.dump(RESULTS, f, indent=2)
print("\nFull results -> output/e2e_api_probe_results.json")
