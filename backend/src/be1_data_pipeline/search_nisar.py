import earthaccess

# Step 1: Login
print("Logging in to NASA Earthdata...")
earthaccess.login(strategy="netrc")
print("Login Successful!")

# Step 2: Search NISAR GCOV data for Bangladesh
print("\nSearching NISAR GCOV data...")

results = earthaccess.search_data(
    short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
    temporal=("2026-06-17", "2026-12-31"),
    bounding_box=(90.0, 22.0, 91.0, 23.0),  # West, South, East, North (Bangladesh)
    count=5
)

# Step 3: Show results
print(f"\nFound {len(results)} NISAR data files.\n")

for i, result in enumerate(results, 1):
    print(f"--- File {i} ---")
    print(result)
    print()