"""
Interactive NISAR Download Manager (Fixed Version)
====================================================
Team: Nova Matrics - VI
Author: Md. Shafaet Ullah
Event: NASA Space Apps Challenge 2026

Features:
- WKT → BBOX auto-conversion
- Fixed 'pair' command: only uses SMALL files, same Track+Frame
- Duplicate detection (same granule appears once)
- Color-coded file sizes
- Interactive: Click a number, range, or command
- Real-time progress with speed & ETA
- Track+Frame grouping summary
"""

import earthaccess
import os
import sys
import time
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

# Feni Flood AOI (Verified from geojson.io)
FENI_WKT = "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))"

# NISAR dataset
SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"

# Search date range
START_DATE = "2026-06-01"
END_DATE = "2026-12-31"

# Download folder
DOWNLOAD_FOLDER = r"C:\Users\JM\NISAR_Project\nisar_data"

# Size threshold (MB): files below this are considered "SMALL"
SMALL_FILE_THRESHOLD_MB = 3000


# ============================================================
# COLORS
# ============================================================
os.system("")  # Enable ANSI colors on Windows


class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    GRAY = "\033[90m"


# ============================================================
# WKT → BBOX
# ============================================================
def wkt_to_bbox(wkt):
    """Extract (west, south, east, north) from a simple POLYGON WKT."""
    coords_str = wkt.replace("POLYGON((", "").replace("))", "")
    lons, lats = [], []
    for pair in coords_str.split(","):
        lon, lat = map(float, pair.strip().split())
        lons.append(lon)
        lats.append(lat)
    return (min(lons), min(lats), max(lons), max(lats))


FENI_BBOX = wkt_to_bbox(FENI_WKT)


# ============================================================
# HELPERS
# ============================================================
def print_header(title, char="="):
    width = 78
    print(f"\n{Colors.CYAN}{char * width}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{title.center(width)}{Colors.RESET}")
    print(f"{Colors.CYAN}{char * width}{Colors.RESET}")


def format_size(bytes_val):
    if bytes_val >= 1024**3:
        return f"{bytes_val / (1024**3):.2f} GB"
    elif bytes_val >= 1024**2:
        return f"{bytes_val / (1024**2):.1f} MB"
    else:
        return f"{bytes_val / 1024:.1f} KB"


def format_speed(bytes_per_sec):
    if bytes_per_sec >= 1024**2:
        return f"{bytes_per_sec / (1024**2):.2f} MB/s"
    elif bytes_per_sec >= 1024:
        return f"{bytes_per_sec / 1024:.1f} KB/s"
    else:
        return f"{bytes_per_sec:.0f} B/s"


def format_eta(seconds):
    if seconds < 0 or seconds > 86400:
        return "??:??"
    minutes, sec = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours}h {minutes}m {sec}s"
    return f"{minutes}m {sec}s"


def extract_metadata(result):
    """Extract metadata from an earthaccess result."""
    try:
        granule_id = result.get("meta", {}).get("native-id", "Unknown")
        umm = result.get("umm", {})

        # Temporal
        temporal = umm.get("TemporalExtent", {}).get("RangeDateTime", {})
        start_time = temporal.get("BeginningDateTime", "Unknown")

        # Size
        data_granule = umm.get("DataGranule", {})
        archive_info = data_granule.get("ArchiveAndDistributionInformation", [])
        size_bytes = archive_info[0].get("SizeInBytes", 0) if archive_info else 0

        # Parse granule name: NISAR_L2_PR_GCOV_XXX_TTT_A_FFF_...
        # Index:           0     1  2   3    4   5  6  7
        parts = granule_id.split("_")
        track = parts[5] if len(parts) > 5 else "???"
        orbit_dir = parts[6] if len(parts) > 6 else "?"  # A or D
        frame = parts[7] if len(parts) > 7 else "???"

        return {
            "granule_id": granule_id,
            "start_time": start_time,
            "size_bytes": size_bytes,
            "size_mb": size_bytes / (1024**2),
            "track": track,
            "frame": frame,
            "orbit_direction": orbit_dir,
        }
    except Exception as e:
        return {
            "granule_id": "Unknown",
            "start_time": "Unknown",
            "size_bytes": 0,
            "size_mb": 0,
            "track": "???",
            "frame": "???",
            "orbit_direction": "?",
            "error": str(e),
        }


def deduplicate_results(files_meta):
    """Remove duplicate granule IDs (keep smallest)."""
    seen = {}
    for meta in files_meta:
        gid = meta["granule_id"]
        if gid not in seen:
            seen[gid] = meta
        else:
            # Keep the smaller one
            if meta["size_bytes"] < seen[gid]["size_bytes"]:
                seen[gid] = meta
    return list(seen.values())


def display_file_list(files_meta):
    """Display list of files with color formatting."""
    print(f"\n{Colors.BOLD}{Colors.WHITE}"
          f"{'#':<4} {'Date':<12} {'Time':<9} {'Track':<6} {'Frame':<6} {'Orbit':<6} {'Size':<14} {'Status'}"
          f"{Colors.RESET}")
    print(f"{Colors.GRAY}{'-' * 92}{Colors.RESET}")

    for i, meta in enumerate(files_meta, 1):
        size_mb = meta["size_mb"]
        if size_mb == 0:
            status = f"{Colors.RED}❌ INVALID{Colors.RESET}"
            size_str = f"{Colors.RED}N/A{Colors.RESET}"
        elif size_mb < 500:
            status = f"{Colors.GREEN}✅ TINY (Best!){Colors.RESET}"
            size_str = f"{Colors.GREEN}{format_size(meta['size_bytes'])}{Colors.RESET}"
        elif size_mb < SMALL_FILE_THRESHOLD_MB:
            status = f"{Colors.GREEN}✅ SMALL (Good){Colors.RESET}"
            size_str = f"{Colors.GREEN}{format_size(meta['size_bytes'])}{Colors.RESET}"
        elif size_mb < 6000:
            status = f"{Colors.YELLOW}⚠️  MEDIUM{Colors.RESET}"
            size_str = f"{Colors.YELLOW}{format_size(meta['size_bytes'])}{Colors.RESET}"
        else:
            status = f"{Colors.RED}🚫 LARGE (Skip){Colors.RESET}"
            size_str = f"{Colors.RED}{format_size(meta['size_bytes'])}{Colors.RESET}"

        try:
            dt = datetime.fromisoformat(meta["start_time"].replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
            time_str = dt.strftime("%H:%M:%S")
        except Exception:
            date_str = meta["start_time"][:10] if len(meta["start_time"]) > 10 else "Unknown"
            time_str = meta["start_time"][11:19] if len(meta["start_time"]) > 19 else ""

        track_str = meta["track"][:5]
        frame_str = meta["frame"][:5]
        orbit_str = meta["orbit_direction"]

        print(f"{Colors.BOLD}{i:<4}{Colors.RESET} "
              f"{date_str:<12} "
              f"{time_str:<9} "
              f"{track_str:<6} "
              f"{frame_str:<6} "
              f"{orbit_str:<6} "
              f"{size_str:<22} "
              f"{status}")


def display_grouping_summary(files_meta):
    """Show which Track+Frame has SMALL files."""
    groups = {}
    for i, m in enumerate(files_meta, 1):
        if 0 < m["size_mb"] < SMALL_FILE_THRESHOLD_MB:
            key = (m["track"], m["frame"])
            groups.setdefault(key, []).append(i)

    if not groups:
        print(f"\n{Colors.YELLOW}⚠️  No SMALL files found in any Track+Frame group.{Colors.RESET}")
        return

    print(f"\n{Colors.BOLD}📊 SMALL FILES BY TRACK+FRAME:{Colors.RESET}")
    for (track, frame), indices in sorted(groups.items()):
        dates = sorted(set(files_meta[i-1]["start_time"][:10] for i in indices))
        total_size = sum(files_meta[i-1]["size_bytes"] for i in indices)
        print(f"  {Colors.CYAN}Track {track}, Frame {frame}{Colors.RESET}: "
              f"{len(indices)} files | {len(dates)} unique dates | "
              f"Total: {format_size(total_size)}")
        for i in indices:
            m = files_meta[i-1]
            print(f"     {Colors.GRAY}#{i:<3}{Colors.RESET} {m['start_time'][:10]} | {format_size(m['size_bytes'])}")


def custom_download(results, folder, files_meta):
    """Download files with progress reporting."""
    os.makedirs(folder, exist_ok=True)
    total_files = len(results)
    print(f"\n{Colors.CYAN}📥 Starting download of {total_files} file(s)...{Colors.RESET}")
    print(f"{Colors.GRAY}Destination: {folder}{Colors.RESET}\n")

    overall_start = time.time()

    for idx, result in enumerate(results, 1):
        granule_id = result.get("meta", {}).get("native-id", "Unknown")
        meta = next((m for m in files_meta if m["granule_id"] == granule_id), None)
        if meta is None:
            meta = extract_metadata(result)

        print(f"{Colors.BOLD}{Colors.MAGENTA}[{idx}/{total_files}] {granule_id[:70]}{Colors.RESET}")
        print(f"{Colors.GRAY}  Date: {meta['start_time'][:19]} | Size: {format_size(meta['size_bytes'])}{Colors.RESET}")
        print(f"{Colors.CYAN}  ⏳ Downloading...{Colors.RESET}")

        try:
            file_start = time.time()
            earthaccess.download([result], local_path=folder)
            elapsed = time.time() - file_start
            speed = meta["size_bytes"] / elapsed if elapsed > 0 else 0
            print(f"{Colors.GREEN}  ✅ Downloaded in {format_eta(elapsed)} | Avg Speed: {format_speed(speed)}{Colors.RESET}\n")
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}  ⚠️  Download interrupted by user.{Colors.RESET}")
            return
        except Exception as e:
            print(f"{Colors.RED}  ❌ Failed: {type(e).__name__}: {e}{Colors.RESET}\n")
            continue

    total_elapsed = time.time() - overall_start
    print(f"{Colors.GREEN}{Colors.BOLD}✨ All downloads complete in {format_eta(total_elapsed)}!{Colors.RESET}")


# ============================================================
# MAIN
# ============================================================
def main():
    print_header("NISAR INTERACTIVE DOWNLOAD MANAGER")
    print(f"{Colors.BOLD}Team: Nova Matrics - VI | NASA Space Apps Challenge 2026{Colors.RESET}")
    print(f"{Colors.BOLD}Event: Dancing with the SARs (NISAR){Colors.RESET}")
    print(f"{Colors.BOLD}Focus: Feni Flood Area (Bangladesh){Colors.RESET}")
    print(f"\n{Colors.CYAN}AOI (WKT):{Colors.RESET} {FENI_WKT[:65]}...")
    print(f"{Colors.CYAN}BBOX:     {Colors.RESET} {FENI_BBOX}")
    print(f"{Colors.CYAN}Date Range:{Colors.RESET} {START_DATE} to {END_DATE}")
    print(f"{Colors.CYAN}Download Folder:{Colors.RESET} {DOWNLOAD_FOLDER}")

    # ================= LOGIN =================
    print_header("STEP 1: AUTHENTICATION", "-")
    try:
        print(f"{Colors.YELLOW}🔐 Logging in to NASA Earthdata...{Colors.RESET}")
        earthaccess.login(strategy="netrc", persist=True)
        print(f"{Colors.GREEN}✅ Login successful!{Colors.RESET}")
    except Exception as e:
        print(f"{Colors.RED}❌ Login failed: {e}{Colors.RESET}")
        sys.exit(1)

    # ================= SEARCH =================
    print_header("STEP 2: SEARCHING FENI FLOOD DATA", "-")
    print(f"{Colors.YELLOW}🔍 Searching NISAR data over Feni...{Colors.RESET}")
    print(f"{Colors.GRAY}   Using bounding_box = {FENI_BBOX}{Colors.RESET}")

    try:
        results = earthaccess.search_data(
            short_name=SHORT_NAME,
            temporal=(START_DATE, END_DATE),
            bounding_box=FENI_BBOX,
            count=200
        )
    except Exception as e:
        print(f"{Colors.RED}❌ Search failed: {e}{Colors.RESET}")
        sys.exit(1)

    if len(results) == 0:
        print(f"{Colors.RED}❌ No NISAR data found over Feni for this date range.{Colors.RESET}")
        sys.exit(0)

    print(f"{Colors.GREEN}✅ Found {len(results)} files (raw){Colors.RESET}")

    # ================= EXTRACT & DEDUPE =================
    files_meta = []
    for r in results:
        meta = extract_metadata(r)
        meta["result"] = r
        files_meta.append(meta)

    # Remove duplicates
    before_dedup = len(files_meta)
    files_meta = deduplicate_results(files_meta)
    after_dedup = len(files_meta)
    if before_dedup != after_dedup:
        print(f"{Colors.YELLOW}🧹 Deduplicated: {before_dedup} → {after_dedup} files{Colors.RESET}")

    # Sort by date (newest first)
    files_meta.sort(key=lambda x: x["start_time"], reverse=True)

    # ================= DISPLAY =================
    print_header("STEP 3: AVAILABLE FILES", "-")
    print(f"{Colors.BOLD}Legend:{Colors.RESET}")
    print(f"  {Colors.GREEN}✅ TINY (< 500 MB){Colors.RESET}  |  "
          f"{Colors.GREEN}✅ SMALL (< 3 GB){Colors.RESET}  |  "
          f"{Colors.YELLOW}⚠️  MEDIUM (< 6 GB){Colors.RESET}  |  "
          f"{Colors.RED}🚫 LARGE (> 6 GB){Colors.RESET}")

    display_file_list(files_meta)

    # ================= SUMMARY =================
    print(f"\n{Colors.BOLD}📊 OVERALL SUMMARY:{Colors.RESET}")
    small_files = [i for i, m in enumerate(files_meta, 1) if 0 < m["size_mb"] < SMALL_FILE_THRESHOLD_MB]
    medium_files = [i for i, m in enumerate(files_meta, 1) if SMALL_FILE_THRESHOLD_MB <= m["size_mb"] < 6000]
    large_files = [i for i, m in enumerate(files_meta, 1) if m["size_mb"] >= 6000]
    print(f"  {Colors.GREEN}✅ Downloadable (Small): {len(small_files)} files → {small_files[:12]}{' ...' if len(small_files) > 12 else ''}{Colors.RESET}")
    print(f"  {Colors.YELLOW}⚠️  Medium: {len(medium_files)} files{Colors.RESET}")
    print(f"  {Colors.RED}🚫 Large: {len(large_files)} files{Colors.RESET}")

    # Show grouping for SMALL files
    display_grouping_summary(files_meta)

    # ================= INTERACTIVE =================
    print_header("STEP 4: SELECT FILES TO DOWNLOAD", "-")
    print(f"{Colors.BOLD}How to select:{Colors.RESET}")
    print(f"  • Single file:       {Colors.CYAN}3{Colors.RESET}")
    print(f"  • Multiple files:    {Colors.CYAN}1,3,5{Colors.RESET}")
    print(f"  • Range:             {Colors.CYAN}2-6{Colors.RESET}")
    print(f"  • All small files:   {Colors.CYAN}small{Colors.RESET}")
    print(f"  • Best Before/After: {Colors.CYAN}pair{Colors.RESET} (smallest pair, same Track+Frame)")
    print(f"  • Export list:       {Colors.CYAN}export{Colors.RESET} (save file list to CSV)")
    print(f"  • Exit:              {Colors.CYAN}q{Colors.RESET}")
    print()

    while True:
        try:
            user_input = input(f"{Colors.BOLD}{Colors.CYAN}👉 Enter your choice: {Colors.RESET}").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print(f"\n{Colors.YELLOW}Goodbye!{Colors.RESET}")
            sys.exit(0)

        if user_input in ["q", "quit", "exit"]:
            print(f"{Colors.YELLOW}👋 Exiting...{Colors.RESET}")
            sys.exit(0)

        # ============ EXPORT ============
        if user_input == "export":
            csv_path = os.path.join(os.path.dirname(DOWNLOAD_FOLDER), "nisar_files_list.csv")
            try:
                with open(csv_path, "w", encoding="utf-8") as f:
                    f.write("Index,Date,Time,Track,Frame,Orbit,Size_MB,Size_GB,Status,Granule_ID\n")
                    for i, m in enumerate(files_meta, 1):
                        size_mb = m["size_mb"]
                        if size_mb == 0:
                            status = "INVALID"
                        elif size_mb < 500:
                            status = "TINY"
                        elif size_mb < SMALL_FILE_THRESHOLD_MB:
                            status = "SMALL"
                        elif size_mb < 6000:
                            status = "MEDIUM"
                        else:
                            status = "LARGE"
                        date = m["start_time"][:10]
                        time_str = m["start_time"][11:19]
                        f.write(f"{i},{date},{time_str},{m['track']},{m['frame']},{m['orbit_direction']},"
                                f"{size_mb:.1f},{size_mb/1024:.2f},{status},{m['granule_id']}\n")
                print(f"{Colors.GREEN}✅ Exported: {csv_path}{Colors.RESET}\n")
            except Exception as e:
                print(f"{Colors.RED}❌ Export failed: {e}{Colors.RESET}\n")
            continue

        selected_indices = []

        # ============ SMALL ============
        if user_input == "small":
            if not small_files:
                print(f"{Colors.RED}❌ No small files available.{Colors.RESET}\n")
                continue
            selected_indices = small_files

        # ============ PAIR (FIXED) ============
        elif user_input == "pair":
            # Group SMALL files by (track, frame)
            groups = {}
            for i in small_files:
                m = files_meta[i-1]
                key = (m["track"], m["frame"])
                groups.setdefault(key, []).append(i)

            best_group = None
            for key, indices in groups.items():
                # Get unique dates
                dates = {}
                for i in indices:
                    date = files_meta[i-1]["start_time"][:10]
                    if date not in dates:
                        dates[date] = i

                if len(dates) < 2:
                    continue  # Need 2+ different dates

                # Pick earliest + latest
                sorted_dates = sorted(dates.keys())
                earliest_idx = dates[sorted_dates[0]]
                latest_idx = dates[sorted_dates[-1]]
                pair_size = (files_meta[earliest_idx-1]["size_bytes"]
                             + files_meta[latest_idx-1]["size_bytes"])

                if best_group is None or pair_size < best_group[2]:
                    best_group = (key, [earliest_idx, latest_idx], pair_size,
                                  sorted_dates[0], sorted_dates[-1])

            if best_group is None:
                print(f"{Colors.RED}❌ No SMALL pair found with same Track+Frame on different dates.{Colors.RESET}")
                print(f"{Colors.YELLOW}💡 Try: 'small' to see all, or manually select.{Colors.RESET}\n")
                continue

            key, selected_indices, pair_size, earliest_date, latest_date = best_group
            print(f"{Colors.GREEN}✅ Auto-selected pair (Track {key[0]}, Frame {key[1]}){Colors.RESET}")
            print(f"{Colors.GRAY}   Before: {earliest_date} | After: {latest_date}{Colors.RESET}")
            print(f"{Colors.GRAY}   Total size: {format_size(pair_size)}{Colors.RESET}")

        # ============ RANGE ============
        elif "-" in user_input:
            try:
                start, end = user_input.split("-")
                selected_indices = list(range(int(start), int(end) + 1))
            except ValueError:
                print(f"{Colors.RED}❌ Invalid range format. Use: 2-6{Colors.RESET}\n")
                continue

        # ============ COMMA LIST ============
        elif "," in user_input:
            try:
                selected_indices = [int(x.strip()) for x in user_input.split(",")]
            except ValueError:
                print(f"{Colors.RED}❌ Invalid format. Use: 1,3,5{Colors.RESET}\n")
                continue

        # ============ SINGLE ============
        else:
            try:
                selected_indices = [int(user_input)]
            except ValueError:
                print(f"{Colors.RED}❌ Invalid input. Try: 3, 1,3,5, 2-6, small, pair, export, q{Colors.RESET}\n")
                continue

        # Validate
        selected_indices = [i for i in selected_indices if 1 <= i <= len(files_meta)]
        if not selected_indices:
            print(f"{Colors.RED}❌ No valid files selected.{Colors.RESET}\n")
            continue

        # ============ CONFIRM ============
        total_size = sum(files_meta[i-1]["size_bytes"] for i in selected_indices)
        print(f"\n{Colors.BOLD}You selected {len(selected_indices)} file(s):{Colors.RESET}")
        for i in selected_indices:
            m = files_meta[i-1]
            print(f"  {Colors.CYAN}#{i}{Colors.RESET} {m['start_time'][:10]} | "
                  f"{format_size(m['size_bytes'])} | Track {m['track']}, Frame {m['frame']}")
        print(f"\n{Colors.BOLD}Total size: {Colors.YELLOW}{format_size(total_size)}{Colors.RESET}")

        try:
            confirm = input(f"\n{Colors.BOLD}Proceed with download? (y/n): {Colors.RESET}").strip().lower()
        except (KeyboardInterrupt, EOFError):
            continue

        if confirm != "y":
            print(f"{Colors.YELLOW}Cancelled. Choose again.{Colors.RESET}\n")
            continue

        # ============ DOWNLOAD ============
        selected_results = [files_meta[i-1]["result"] for i in selected_indices]
        custom_download(selected_results, DOWNLOAD_FOLDER, files_meta)

        # Ask to continue
        try:
            again = input(f"\n{Colors.BOLD}Download more files? (y/n): {Colors.RESET}").strip().lower()
            if again != "y":
                print(f"{Colors.GREEN}{Colors.BOLD}🎉 Thank you for using the Interactive Download Manager!{Colors.RESET}")
                break
        except (KeyboardInterrupt, EOFError):
            break


# ============================================================
# ENTRY
# ============================================================
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}👋 Interrupted by user. Goodbye!{Colors.RESET}")
        sys.exit(0)