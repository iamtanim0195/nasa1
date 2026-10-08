import earthaccess

earthaccess.login(strategy="netrc")

# Specific date for second file
results = earthaccess.search_data(
    short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
    temporal=("2026-06-30", "2026-06-30"),  # <-- এখানে তারিখ বসাও
    bounding_box=(90.0, 22.0, 91.0, 23.0),
    count=5
)

print(f"Found {len(results)} files for download.")
earthaccess.download(results, local_path="nisar_data")
print("✅ Download complete!")