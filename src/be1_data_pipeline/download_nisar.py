import earthaccess

# Step 1: Login
print("Logging in to NASA Earthdata...")
earthaccess.login(strategy="netrc")
print("Login Successful!")

# Step 2: Search NISAR GCOV data (same as before)
print("\nSearching NISAR GCOV data...")
results = earthaccess.search_data(
    short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
    temporal=("2026-06-17", "2026-12-31"),
    bounding_box=(90.0, 22.0, 91.0, 23.0),
    count=5
)

# Step 3: Download only the smallest file (File 3 - 1.58 GB)
# This is for testing. Later, you can download all.
print("\nDownloading the smallest NISAR file (File 3)...")

# Filter for File 3 by size (smallest)
smallest_file = min(results, key=lambda x: x.size)

earthaccess.download([smallest_file], local_path="nisar_data")
print("\nDownload Complete! File saved to 'nisar_data' folder.")