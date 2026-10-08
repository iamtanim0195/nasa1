"""
Events Router
==============
GET /api/events - List detected events
GET /api/events/{id} - Get single event
"""
from fastapi import APIRouter, Request, Query
from typing import Optional
from datetime import datetime, timedelta
import random

from api.services.envelope import envelope

router = APIRouter()


def generate_events(count: int = 26):
    """Generate mock events for demo."""
    types = ['flood', 'earthquake', 'landslide', 'farming', 'sea-level', 'river-erosion']
    severities = ['low', 'medium', 'high', 'critical']
    locations = [
        ('Feni', 23.07, 91.42),
        ('Sylhet', 24.89, 91.87),
        ('Sunamganj', 25.0, 91.25),
        ('Rangamati', 22.75, 92.25),
        ('Rajshahi', 24.4, 88.6),
        ('Khulna', 22.82, 89.55),
    ]

    events = []
    for i in range(count):
        loc = random.choice(locations)
        event_type = random.choice(types)
        severity = random.choice(severities)
        days_ago = random.randint(1, 180)

        events.append({
            "id": f"event-{i+1:03d}",
            "detectionType": event_type,
            "eventDate": (datetime.utcnow() - timedelta(days=days_ago)).isoformat() + "Z",
            "location": {
                "name": loc[0],
                "lat": loc[1],
                "lng": loc[2],
            },
            "severity": severity,
            "confidence": round(0.65 + random.random() * 0.34, 2),
            "areaKm2": round(5 + random.random() * 150, 2),
            "status": "new",
            "summary": f"{event_type.title()} detected in {loc[0]}",
        })

    return events


@router.get("/events")
async def list_events(
    request: Request,
    pageSize: int = Query(50, ge=1, le=200),
    page: int = Query(1, ge=1),
    detectionTypes: Optional[str] = None,
    severities: Optional[str] = None,
    minConfidence: Optional[float] = None,
):
    """List detected events with pagination."""
    request_id = request.headers.get("x-request-id")

    all_events = generate_events(26)

    # Filter by detection types
    if detectionTypes:
        types_list = detectionTypes.split(",")
        all_events = [e for e in all_events if e["detectionType"] in types_list]

    # Filter by severity
    if severities:
        sev_list = severities.split(",")
        all_events = [e for e in all_events if e["severity"] in sev_list]

    # Filter by confidence
    if minConfidence is not None:
        all_events = [e for e in all_events if e["confidence"] >= minConfidence]

    # Paginate
    total = len(all_events)
    total_pages = max(1, (total + pageSize - 1) // pageSize)
    start = (page - 1) * pageSize
    end = start + pageSize
    items = all_events[start:end]

    return envelope({
        "items": items,
        "page": page,
        "pageSize": pageSize,
        "total": total,
        "totalPages": total_pages,
    }, request_id=request_id)


@router.get("/events/{event_id}")
async def get_event(request: Request, event_id: str):
    """Get a single event by ID."""
    request_id = request.headers.get("x-request-id")

    all_events = generate_events(26)
    event = next((e for e in all_events if e["id"] == event_id), None)

    if not event:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    return envelope(event, request_id=request_id)