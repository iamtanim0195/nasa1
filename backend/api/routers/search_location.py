"""
Location Search Router
=======================
GET /api/search-location?q=Feni&limit=8

Two-tier search:
  1. PRESET_LOCATIONS — curated AOIs, instant, offline.
  2. Nominatim (OpenStreetMap) — worldwide geocoding.

Presets are always returned first so the curated AOIs stay one click away.
Nominatim is best-effort: any failure degrades gracefully to preset-only
results rather than surfacing an error to the UI.
"""
import logging

from fastapi import APIRouter, Query, Request

from api.services.envelope import envelope

logger = logging.getLogger("earth_metamorphosis.search_location")

router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy requires a descriptive User-Agent identifying the app.
# `Accept-Language: en` keeps place names in Latin script for consistency with the
# curated presets (without it Nominatim answers a "Dhaka" query with "ঢাকা").
NOMINATIM_HEADERS = {
    "User-Agent": "EarthMetamorphosis/1.0 (NASA Space Apps 2026)",
    "Accept": "application/json",
    "Accept-Language": "en",
}
NOMINATIM_TIMEOUT = 6  # seconds

PRESET_LOCATIONS = [
    {"id": "preset-feni", "name": "Feni", "country": "Bangladesh", "region": "Chittagong",
     "lat": 23.07, "lng": 91.42, "bbox": [91.35, 22.95, 91.55, 23.15], "altitude": 50000, "source": "preset"},
    {"id": "preset-sunamganj", "name": "Sunamganj", "country": "Bangladesh", "region": "Sylhet",
     "lat": 25.0, "lng": 91.25, "bbox": [91.0, 24.8, 91.5, 25.2], "altitude": 50000, "source": "preset"},
    {"id": "preset-sylhet-fault", "name": "Sylhet Fault Zone", "country": "Bangladesh", "region": "Sylhet",
     "lat": 24.85, "lng": 92.0, "bbox": [91.5, 24.5, 92.5, 25.2], "altitude": 80000, "source": "preset"},
    {"id": "preset-rangamati", "name": "Rangamati", "country": "Bangladesh", "region": "Chittagong Hill Tracts",
     "lat": 22.75, "lng": 92.25, "bbox": [92.0, 22.5, 92.5, 23.0], "altitude": 60000, "source": "preset"},
    # Panchhari sits in the same hill tracts but ~4.5x better covered by the
    # NISAR swath (86.8% vs 19.5% valid), so it is the better landslide demo AOI.
    {"id": "preset-panchhari", "name": "Panchhari", "country": "Bangladesh", "region": "Khagrachari",
     "lat": 23.28, "lng": 91.90, "bbox": [91.7, 23.1, 92.1, 23.5], "altitude": 60000, "source": "preset"},
    {"id": "preset-rajshahi", "name": "Rajshahi", "country": "Bangladesh", "region": "Rajshahi",
     "lat": 24.4, "lng": 88.6, "bbox": [88.4, 24.2, 88.8, 24.6], "altitude": 50000, "source": "preset"},
    {"id": "preset-padma", "name": "Padma River", "country": "Bangladesh", "region": "Rajbari",
     "lat": 23.75, "lng": 89.65, "bbox": [89.4, 23.6, 89.9, 23.9], "altitude": 40000, "source": "preset"},
    {"id": "preset-sundarbans", "name": "Sundarbans", "country": "Bangladesh", "region": "Khulna",
     "lat": 21.85, "lng": 89.4, "bbox": [89.0, 21.5, 89.8, 22.2], "altitude": 40000, "source": "preset"},
    {"id": "preset-dhaka", "name": "Dhaka", "country": "Bangladesh", "region": "Dhaka",
     "lat": 23.8, "lng": 90.4, "bbox": [90.2, 23.6, 90.6, 24.0], "altitude": 50000, "source": "preset"},
]


def _match_presets(query_lower: str) -> list:
    """Presets whose name/region/country contains the query."""
    return [
        loc for loc in PRESET_LOCATIONS
        if query_lower in loc["name"].lower()
        or query_lower in loc.get("region", "").lower()
        or query_lower in loc.get("country", "").lower()
    ]


def _geocode(query: str, limit: int) -> list:
    """
    Query Nominatim and map its records onto our GeoLocation shape.

    Returns [] on any failure — the caller falls back to preset-only results.
    Nominatim's boundingbox is [south, north, west, east] as strings; our bbox
    contract is [west, south, east, north].
    """
    try:
        import requests

        response = requests.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "json",
                "limit": limit,
                "addressdetails": 1,
            },
            headers=NOMINATIM_HEADERS,
            timeout=NOMINATIM_TIMEOUT,
        )
        response.raise_for_status()
        results = response.json()
    except Exception as exc:  # network, timeout, bad JSON, missing dependency
        logger.warning("Nominatim lookup failed for %r: %s", query, exc)
        return []

    out = []
    for index, result in enumerate(results):
        try:
            lat = float(result["lat"])
            lng = float(result["lon"])

            address = result.get("address") or {}
            display_name = result.get("display_name") or ""

            # boundingbox is [south, north, west, east] as strings.
            bbox = result.get("boundingbox") or []
            if len(bbox) == 4:
                south, north, west, east = (float(v) for v in bbox)
            else:
                # Degenerate fallback: a small box around the point.
                south, north = lat - 0.1, lat + 0.1
                west, east = lng - 0.1, lng + 0.1

            out.append({
                "id": f"geocoded-{index}",
                "name": (display_name.split(",")[0] or display_name).strip(),
                "country": address.get("country", ""),
                "region": address.get("state") or address.get("county") or "",
                "lat": lat,
                "lng": lng,
                "bbox": [west, south, east, north],
                "altitude": 50000,
                "source": "search",
            })
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed Nominatim record: %s", exc)
            continue

    return out


def _dedupe_by_coords(locations: list) -> list:
    """Drop entries sharing a rounded coordinate with an earlier entry."""
    seen = set()
    out = []
    for loc in locations:
        key = (round(loc["lat"], 2), round(loc["lng"], 2))
        if key in seen:
            continue
        seen.add(key)
        out.append(loc)
    return out


@router.get("/search-location")
async def search_location(
    request: Request,
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
):
    request_id = request.headers.get("x-request-id")
    query = q.strip()
    query_lower = query.lower()

    preset_matches = _match_presets(query_lower)
    geocoded = _geocode(query, limit)

    # Presets first, then geocoded results, de-duplicated and capped.
    matches = _dedupe_by_coords(preset_matches + geocoded)[:limit]

    return envelope(matches, request_id=request_id)
