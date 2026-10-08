"""
Mission Summary Router
=======================
GET /api/mission/summary
Provides top-bar KPI stats for the dashboard.
Matches frontend/src/types/index.ts - MissionSummary exactly.
"""
from fastapi import APIRouter, Request
from datetime import datetime
from api.services.envelope import envelope

router = APIRouter()


@router.get("/mission/summary")
async def mission_summary(request: Request):
    """
    Return mission-level KPIs for the dashboard top-bar.
    
    Matches frontend MissionSummary type:
    - activeEvents: number
    - monitoredAreaKm2: number
    - scenesIngested: number
    - meanLatencySeconds: number
    - uptimeRatio: number
    - lastIngestAt: string (ISO)
    """
    request_id = request.headers.get("x-request-id")

    data = {
        # Event counts
        "activeEvents": 12,

        # Monitored area in square kilometers
        "monitoredAreaKm2": 1500.5,

        # Number of scenes ingested
        "scenesIngested": 26,

        # Mean processing latency in seconds
        "meanLatencySeconds": 4.2,

        # Uptime as a ratio (0.998 = 99.8%)
        "uptimeRatio": 0.998,

        # Last ingest timestamp (ISO 8601)
        "lastIngestAt": datetime.utcnow().isoformat() + "Z",

        # Extra fields (kept for dashboard KPIs, not in MissionSummary type)
        "totalEvents": 45,
        "criticalEvents": 3,
        "satellitesOnline": 2,
        "dataProcessedGB": 12.5,
        "lastUpdate": datetime.utcnow().isoformat() + "Z",
    }

    return envelope(data, request_id=request_id)