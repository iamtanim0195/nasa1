"""
NISAR Project Configuration
============================
All AOI WKT and date ranges for different modules.
"""

# ================= AOI WKT =================
AOI = {
    "flood": {
        "feni": "POLYGON((91.35 22.95, 91.55 22.95, 91.55 23.15, 91.35 23.15, 91.35 22.95))",
        "sunamganj": "POLYGON((91.0 24.8, 91.5 24.8, 91.5 25.2, 91.0 25.2, 91.0 24.8))",
    },
    "earthquake": {
        "sylhet_fault": "POLYGON((91.5 24.5, 92.5 24.5, 92.5 25.2, 91.5 25.2, 91.5 24.5))",
    },
    "landslide": {
        "rangamati": "POLYGON((92.0 22.5, 92.5 22.5, 92.5 23.0, 92.0 23.0, 92.0 22.5))",
    },
    "farming": {
        "rajshahi": "POLYGON((88.4 24.2, 88.8 24.2, 88.8 24.6, 88.4 24.6, 88.4 24.2))",
    },
    "river_erosion": {
        "padma": "POLYGON((89.4 23.6, 89.9 23.6, 89.9 23.9, 89.4 23.9, 89.4 23.6))",
    },
    "sea_level": {
        "sundarbans": "POLYGON((89.0 21.5, 89.8 21.5, 89.8 22.2, 89.0 22.2, 89.0 21.5))",
    },
}

# ================= DATE RANGES =================
DATE_RANGES = {
    "flood": {
        "before": ("2026-06-01", "2026-06-30"),
        "after": ("2026-08-01", "2026-08-31"),
    },
    "earthquake": {
        "before": ("2026-06-01", "2026-06-30"),
        "after": ("2026-12-01", "2026-12-31"),
    },
    "landslide": {
        "before": ("2026-05-01", "2026-05-31"),
        "after": ("2026-08-01", "2026-08-31"),
    },
    # ... etc
}

# ================= SHORT NAME =================
NISAR_SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"