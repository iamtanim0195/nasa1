"""
NISAR Data Router
==================
Replaces SarDropzone with real NASA Earthdata integration.
"""
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from pydantic import BaseModel
from uuid import uuid4

from api.services.envelope import envelope
from api.services.nisar_processor import (
    search_nisar_files,
    run_analysis,
    get_job_status,
)

router = APIRouter()


# ============================================================
# REQUEST MODELS
# ============================================================
class SearchNisarRequest(BaseModel):
    wkt: str
    beforeDate: str
    afterDate: str
    detectionType: str = "flood"


class AnalyzeRequest(BaseModel):
    wkt: str
    beforeFileId: str
    afterFileId: str
    detectionType: str = "flood"


# ============================================================
# ENDPOINTS
# ============================================================
@router.post("/search-nisar-files")
async def search_nisar(request: Request, req: SearchNisarRequest):
    """Search for available NISAR files matching WKT + date range."""
    request_id = request.headers.get("x-request-id")

    try:
        coords_str = req.wkt.replace("POLYGON((", "").replace("))", "")
        lons, lats = [], []
        for pair in coords_str.split(","):
            lon, lat = map(float, pair.strip().split())
            lons.append(lon)
            lats.append(lat)

        bbox = (min(lons), min(lats), max(lons), max(lats))

        files = search_nisar_files(
            bbox=bbox,
            before_date=req.beforeDate,
            after_date=req.afterDate,
            detection_type=req.detectionType,
        )

        return envelope({
            "files": files,
            "total": len(files),
            "bbox": list(bbox),
            "beforeDate": req.beforeDate,
            "afterDate": req.afterDate,
        }, request_id=request_id)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-nisar")
async def analyze_nisar(request: Request, req: AnalyzeRequest, background_tasks: BackgroundTasks):
    """Start NISAR analysis in background, dispatched on the requested detection type."""
    request_id = request.headers.get("x-request-id")
    job_id = f"job-{uuid4().hex[:12]}"

    background_tasks.add_task(
        run_analysis,
        job_id=job_id,
        wkt=req.wkt,
        before_file_id=req.beforeFileId,
        after_file_id=req.afterFileId,
        detection_type=req.detectionType,
    )

    return envelope({
        "jobId": job_id,
        "status": "started",
        "detectionType": req.detectionType,
    }, request_id=request_id)


@router.get("/analyze-nisar/{job_id}")
async def get_job(request: Request, job_id: str):
    """Poll analysis progress."""
    request_id = request.headers.get("x-request-id")
    status = get_job_status(job_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return envelope(status, request_id=request_id)


@router.get("/analyze-nisar/{job_id}/result")
async def get_job_result(request: Request, job_id: str):
    """Get final analysis result."""
    request_id = request.headers.get("x-request-id")
    status = get_job_status(job_id)

    if not status:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if status.get("status") != "complete":
        raise HTTPException(status_code=400, detail="Analysis not complete")

    payload = dict(status.get("result", {}) or {})
    # Echo back the exact AOI the user requested so the frontend can restore
    # the correct location on reload (never fall back to a preset).
    aoi_bbox = status.get("aoiBbox")
    if aoi_bbox:
        payload["aoiBbox"] = aoi_bbox
        meta = payload.get("metadata") or {}
        meta["aoiBbox"] = aoi_bbox
        payload["metadata"] = meta

    return envelope(payload, request_id=request_id)