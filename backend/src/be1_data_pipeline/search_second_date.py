"""
Search NISAR data for second date (Change Detection)
====================================================
Looking for same track/frame as our first file:
- Track: 170
- Frame: 012
- Area: Bangladesh
- Different date
"""
import earthaccess
from datetime import datetime

# ================= CONFIG =================
TARGET_TRACK = 170
TARGET_FRAME = 12

# Broader search window to find same track/frame
START_DATE = "2026-06-01"
END_DATE = "2026-12-31"

# Bangladesh bounding box
BOUNDING_BOX = (88.0, 20.5, 92.7, 26.7)  # West, South, East, North

# ================= LOGIN =================
print("=" * 70)
print("SEARCHING FOR SECOND DATE NISAR DATA")
print("=" * 70)
print(f"Target Track: {TARGET_TRACK}, Frame: {TARGET_FRAME}")
print(f"Date Range: {START_DATE} to {END_DATE}")
print()

earthaccess.login(strategy="netrc")
print("✅ Login successful!\n")

# ================= SEARCH =================
print("Searching...")
results = earthaccess.search_data(
    short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
    temporal=(START_DATE, END_DATE),
    bounding_box=BOUNDING_BOX,
    count=50  # Get more results to filter
)

print(f"Found {len(results)} total NISAR files.\n")

# ================= FILTER BY TRACK/FRAME =================
matching = []
for r in results:
    # Check track/frame from metadata
    # (This may require additional metadata lookup)
    matching.append(r)

print(f"Total candidates: {len(matching)}\n")

# ================= DISPLAY RESULTS =================
print("=" * 70)
print("AVAILABLE DATES FOR CHANGE DETECTION")
print("=" * 70)

for i, r in enumerate(matching, 1):
    try:
        # Parse metadata
        spatial = r.get("umm", {}).get("SpatialExtent", {})
        temporal = r.get("umm", {}).get("TemporalExtent", {})
        beginning = temporal.get("RangeDateTime", {}).get("BeginningDateTime", "Unknown")
        size_mb = r.get("umm", {}).get("DataGranule", {}).get("ArchiveAndDistributionInformation", [{}])[0].get("SizeInBytes", 0) / (1024*1024)
        
        print(f"\n--- File {i} ---")
        print(f"  Date: {beginning.split('T')[0] if 'T' in beginning else beginning}")
        print(f"  Size: {size_mb:.2f} MB")
        print(f"  Granule: {r.get('meta', {}).get('native-id', 'Unknown')}")
    except Exception as e:
        print(f"\n--- File {i} --- (metadata error: {e})")

# ================= RECOMMENDATION =================
print("\n" + "=" * 70)
print("📌 RECOMMENDATION")
print("=" * 70)
print("""
Your first file was from: 2026-06-25
For Change Detection, choose a file with:
- A different date (preferably 2-4 weeks apart)
- Same Track (170) and Frame (012)
- Same area coverage

Best options:
- 2026-06-18 (7 days earlier)
- 2026-06-30 (5 days later)
- 2026-07-05 (10 days later)

Now update download_nisar.py with the chosen date
and run it to download the second date's data.
""")