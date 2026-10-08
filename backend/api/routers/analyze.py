"""
Analyze Router (Frontend-compatible)
=====================================
Matches frontend/src/types/index.ts exactly.
"""
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4
from datetime import datetime
import threading
import time

from api.services.envelope import envelope

router = APIRouter()

JOBS = {}

# Ordered D-SAR-D stages, used to map real pipeline progress onto the UI steps.
STAGE_ORDER = ['dsard', 'extracting', 'analyzing', 'result']
STEP_IDS = ['ingest', 'calibrate', 'coregister', 'threshold']


class AnalysisLocation(BaseModel):
    name: str
    lat: float
    lng: float


class AnalysisDateRange(BaseModel):
    before: Optional[str] = None
    after: Optional[str] = None


class CreateAnalysisPayload(BaseModel):
    detectionType: str = "flood"
    location: AnalysisLocation
    dateRange: AnalysisDateRange
    datasetId: Optional[str] = None
    mode: Optional[str] = "preview"
    # When both granule ids are supplied the real NISAR pipeline runs instead of
    # the staged simulation. The frontend's ControlPanel supplies them.
    beforeFileId: Optional[str] = None
    afterFileId: Optional[str] = None


def wkt_for_location(location: AnalysisLocation, pad: float = 0.1) -> str:
    """Build a small bbox WKT around a point, matching the ControlPanel logic."""
    west, south = location.lng - pad, location.lat - pad
    east, north = location.lng + pad, location.lat + pad
    return (
        f"POLYGON(({west} {south}, {east} {south}, {east} {north}, "
        f"{west} {north}, {west} {south}))"
    )


def _sync_steps(job_id: str, stage: str) -> None:
    """Mark the four UI steps done/running/pending from the current stage."""
    index = STAGE_ORDER.index(stage) if stage in STAGE_ORDER else 0
    for idx, step in enumerate(JOBS[job_id]['steps']):
        if idx < index:
            step['status'] = 'done'
        elif idx == index:
            step['status'] = 'running'
        else:
            step['status'] = 'pending'


def run_real_analysis(job_id: str, wkt: str, before_file_id: str,
                      after_file_id: str, detection_type: str) -> None:
    """
    Run the real NISAR pipeline and mirror its progress into this router's JOBS.

    `nisar_processor.run_analysis` owns its own job dict, so a lightweight
    monitor thread copies stage/progress across while it works, letting the
    existing `GET /api/analyze/{jobId}` contract serve genuine progress.
    """
    from api.services.nisar_processor import run_analysis, JOBS as PIPELINE_JOBS

    stop = threading.Event()

    def mirror():
        while not stop.is_set():
            real = PIPELINE_JOBS.get(job_id)
            if real and job_id in JOBS:
                stage = real.get('stage') or JOBS[job_id]['stage']
                JOBS[job_id]['stage'] = stage
                JOBS[job_id]['progress'] = real.get('progress', JOBS[job_id]['progress'])
                JOBS[job_id]['message'] = f"Processing stage: {stage}"
                _sync_steps(job_id, stage)
            stop.wait(0.5)

    monitor = threading.Thread(target=mirror, daemon=True)
    monitor.start()
    try:
        run_analysis(job_id, wkt, before_file_id, after_file_id, detection_type)
    finally:
        stop.set()

    real = PIPELINE_JOBS.get(job_id, {})
    if job_id not in JOBS:
        return

    if real.get('status') == 'complete':
        JOBS[job_id].update(
            status='complete', stage='result', progress=100,
            completedAt=datetime.utcnow().isoformat() + 'Z',
            message='Analysis complete',
            result=real.get('result'),
        )
        for step in JOBS[job_id]['steps']:
            step['status'] = 'done'
    else:
        JOBS[job_id].update(
            status='error',
            message=real.get('errorMessage') or 'Analysis failed',
            errorMessage=real.get('errorMessage') or 'Analysis failed',
        )


def simulate_analysis(job_id: str):
    """Simulated progress for demo/preview jobs that carry no granule ids."""
    stages = ['dsard', 'extracting', 'analyzing', 'result']
    step_ids = ['ingest', 'calibrate', 'coregister', 'threshold']

    for i, stage in enumerate(stages):
        for progress in range(0, 101, 25):
            time.sleep(1.5)
            if job_id in JOBS:
                JOBS[job_id]['stage'] = stage
                JOBS[job_id]['progress'] = min(100, int((i * 25) + (progress * 0.25)))
                JOBS[job_id]['message'] = f'Processing stage: {stage}'

                for idx, _ in enumerate(step_ids):
                    step = JOBS[job_id]['steps'][idx]
                    if idx < i:
                        step['status'] = 'done'
                    elif idx == i:
                        step['status'] = 'running'
                    else:
                        step['status'] = 'pending'

    if job_id in JOBS:
        JOBS[job_id]['stage'] = 'result'
        JOBS[job_id]['progress'] = 100
        JOBS[job_id]['status'] = 'complete'
        JOBS[job_id]['completedAt'] = datetime.utcnow().isoformat() + 'Z'
        JOBS[job_id]['message'] = 'Analysis complete'
        for step in JOBS[job_id]['steps']:
            step['status'] = 'done'


@router.post("/analyze")
async def create_analysis(
    request: Request,
    payload: CreateAnalysisPayload,
    background_tasks: BackgroundTasks,
):
    """Create a new analysis job."""
    request_id = request.headers.get("x-request-id")
    job_id = f"job-{uuid4().hex[:12]}"

    JOBS[job_id] = {
        "id": job_id,
        "detectionType": payload.detectionType,
        "locationName": payload.location.name,
        "location": payload.location.model_dump(),
        "dateRange": payload.dateRange.model_dump(),
        "stage": "dsard",
        "progress": 0,
        "status": "running",
        "startedAt": datetime.utcnow().isoformat() + "Z",
        "etaSeconds": 30,
        "message": "Dispatching to the D-SAR-D pipeline",
        "steps": [
            {"id": "ingest", "label": "Ingest", "status": "running"},
            {"id": "calibrate", "label": "Calibrate", "status": "pending"},
            {"id": "coregister", "label": "Coregister", "status": "pending"},
            {"id": "threshold", "label": "Threshold", "status": "pending"},
        ],
    }

    # Real pipeline when granules are supplied; staged simulation otherwise so
    # the preview/demo flow on /analyze still animates.
    if payload.beforeFileId and payload.afterFileId:
        JOBS[job_id]["message"] = "Running NISAR analysis"
        JOBS[job_id]["simulated"] = False
        background_tasks.add_task(
            run_real_analysis,
            job_id,
            wkt_for_location(payload.location),
            payload.beforeFileId,
            payload.afterFileId,
            payload.detectionType,
        )
    else:
        JOBS[job_id]["simulated"] = True
        background_tasks.add_task(simulate_analysis, job_id)

    return envelope(JOBS[job_id], request_id=request_id)


def pipeline_job_view(job_id: str):
    """
    Present a job owned by `nisar_processor.JOBS` in this router's UI shape.

    `POST /api/analyze-nisar` (what the Control Panel uses) stores its job in
    nisar_processor's own dict, but the /analyze page polls THIS router's
    `GET /api/analyze/{jobId}`. Without a fall-through those are two disconnected
    stores and the primary flow - pick AOI, search granules, analyze, view the
    pipeline - dead-ends on "No D-SAR-D run in this session" (verified: HTTP 404).

    Reading the live dict on each poll keeps progress accurate without a second
    mirrored copy that could drift.
    """
    from api.services.nisar_processor import JOBS as PIPELINE_JOBS

    real = PIPELINE_JOBS.get(job_id)
    if not real:
        return None

    stage = real.get('stage') or 'dsard'
    if stage not in STAGE_ORDER:
        stage = 'dsard'

    status = real.get('status') or 'running'
    index = STAGE_ORDER.index(stage)
    if status == 'complete':
        steps = [{"id": s, "label": s.title(), "status": "done"} for s in STEP_IDS]
    else:
        steps = []
        for idx, step_id in enumerate(STEP_IDS):
            if idx < index:
                state = 'done'
            elif idx == index:
                state = 'running'
            else:
                state = 'pending'
            steps.append({"id": step_id, "label": step_id.title(), "status": state})

    return {
        "id": job_id,
        "detectionType": real.get('detectionType', 'flood'),
        "locationName": real.get('locationName', 'NISAR AOI'),
        "location": real.get('location'),
        "dateRange": real.get('dateRange'),
        "stage": stage,
        "progress": 100 if status == 'complete' else real.get('progress', 0),
        "status": status,
        "startedAt": real.get('startedAt'),
        "etaSeconds": real.get('etaSeconds'),
        "message": real.get('errorMessage') or f"Processing stage: {stage}",
        "steps": steps,
        "simulated": False,
        "result": real.get('result'),
        "errorMessage": real.get('errorMessage'),
    }


def find_job(job_id: str):
    """This router's job, or a live view of a pipeline job, or None."""
    if job_id in JOBS:
        return JOBS[job_id]
    return pipeline_job_view(job_id)


@router.get("/analyze/{job_id}")
async def get_analysis(request: Request, job_id: str):
    """Get analysis job status (from this router, or the NISAR pipeline)."""
    request_id = request.headers.get("x-request-id")

    job = find_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return envelope(job, request_id=request_id)


@router.get("/analyze/{job_id}/extractions")
async def get_extractions(request: Request, job_id: str):
    """
    Get extraction categories.
    Matches: ExtractionCategory {
        id, label, icon, featureCount, areaKm2, confidence, trend
    }
    """
    request_id = request.headers.get("x-request-id")

    if find_job(job_id) is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    data = [
        {
            "id": "water",
            "label": "Water Bodies",
            "icon": "Waves",
            "featureCount": 1247,
            "areaKm2": 12.34,
            "confidence": 0.94,
            "trend": 2.5,
        },
        {
            "id": "rivers",
            "label": "Rivers",
            "icon": "Droplets",
            "featureCount": 523,
            "areaKm2": 5.21,
            "confidence": 0.87,
            "trend": -1.2,
        },
        {
            "id": "shorelines",
            "label": "Shorelines",
            "icon": "Waves",
            "featureCount": 842,
            "areaKm2": 8.45,
            "confidence": 0.91,
            "trend": 3.7,
        },
        {
            "id": "inundation",
            "label": "Inundation Zones",
            "icon": "Map",
            "featureCount": 1567,
            "areaKm2": 15.67,
            "confidence": 0.82,
            "trend": 0.8,
        },
    ]

    return envelope(data, request_id=request_id)


@router.get("/analyze/{job_id}/widgets")
async def get_widgets(request: Request, job_id: str):
    """
    Get analysis widgets.
    Matches: AnalysisWidget {
        id, detectionType, headline, riskScore, metrics: Metric[], series: SeriesPoint[]
    }
    """
    request_id = request.headers.get("x-request-id")

    if find_job(job_id) is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    data = [
        {
            "id": "widget-flood-risk",
            "detectionType": "flood",
            "headline": "Flood Risk Index",
            "riskScore": 68,
            "metrics": [
                {"label": "Affected Area", "value": 41.67, "unit": "km2", "delta": 12.5},
                {"label": "Water Bodies", "value": 1247, "unit": "count", "delta": 2.5},
                {"label": "Mean Confidence", "value": 0.92, "unit": "", "delta": 0.03},
                {"label": "Population Impact", "value": 120000, "unit": "people", "delta": 5000},
            ],
            "series": [
                {"label": "Jul W1", "value": 12.3},
                {"label": "Jul W2", "value": 18.7},
                {"label": "Jul W3", "value": 24.1},
                {"label": "Aug W1", "value": 31.5},
                {"label": "Aug W2", "value": 38.2},
                {"label": "Sep W1", "value": 41.7},
            ],
        },
    ]

    return envelope(data, request_id=request_id)