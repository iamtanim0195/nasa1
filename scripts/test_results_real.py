"""Verify /api/results/{job} now serves REAL pipeline data, plus the artifact mount."""
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8000"


def get(path, timeout=60):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return r.status, r.read()


print("=== /api/results/test-job (real artifacts) ===")
status, raw = get("/api/results/test-job")
d = json.loads(raw.decode("utf-8"))["data"]
print(f"HTTP {status}")
print(f"  detectionType   : {d['detectionType']}")
print(f"  totalAreaKm2    : {d['totalAreaKm2']}")
print(f"  eventCount      : {d['eventCount']}")
print(f"  meanConfidence  : {d['meanConfidence']}")
print(f"  categories      : {d['categories']}")
print(f"  distribution    : {d['distribution']}")
print(f"  confidenceBands : {d['confidenceBands']}")
print(f"  timeline        : {d['timeline']}")
print(f"  geotiffUrl      : {d['geotiffUrl']}")
print(f"  previewUrl      : {d['previewUrl']}")
md = d["metadata"]
print(f"  metadata        : before={md.get('beforeDate')} after={md.get('afterDate')} "
      f"track={md.get('track')} frame={md.get('frame')} coveragePct={md.get('coveragePct')} "
      f"severity={md.get('severity')} pixelAreaKm2={md.get('pixelAreaKm2')}")

print("\n=== cross-check against the raw metadata on disk ===")
meta = json.load(open(r"C:\Users\JM\NISAR_Project\output\feni\feni_metadata.json", encoding="utf-8"))
fs = meta["flood_stats"]
px = 0.02 * 0.02
expected_area = round(fs["flood_pixels"] * px, 2)
print(f"  flood_pixels={fs['flood_pixels']}  coverage_pct={fs['coverage_pct']}")
print(f"  expected flood area = {fs['flood_pixels']} * {px} = {expected_area} km2")
print(f"  served category sum = {round(sum(c['value'] for c in d['categories']), 2)} km2")
print(f"  MATCH: {abs(expected_area - d['categories'][0]['value']) < 0.01}")

print("\n=== artifact URLs now resolve? (previously both 404) ===")
for url in (d["geotiffUrl"], d["previewUrl"]):
    try:
        st, body = get(url)
        print(f"  HTTP {st}  {url}  ({len(body):,} bytes)")
    except Exception as exc:
        print(f"  FAIL {url} -> {exc}")

print("\n=== backward compatibility ===")
st, raw = get("/api/results/anything-at-all")
d2 = json.loads(raw.decode("utf-8"))["data"]
print(f"  /api/results/anything-at-all -> HTTP {st}, jobId={d2['jobId']}, available={d2.get('available', True)}")

print("\n=== unknown module degrades gracefully ===")
st, raw = get("/api/results/x?detectionType=earthquake")
d3 = json.loads(raw.decode("utf-8"))["data"]
print(f"  HTTP {st}  available={d3.get('available')}")
print(f"  message: {d3.get('message')}")
print(f"  arrays still present: categories={d3['categories']} timeline={d3['timeline']}")
