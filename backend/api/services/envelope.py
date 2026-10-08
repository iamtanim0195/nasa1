"""
API Envelope Helper
====================
Matches the frontend's ApiEnvelope<T> type exactly.
"""
from datetime import datetime
from uuid import uuid4


def envelope(data, request_id: str = None, elapsed_ms: int = None):
    """Wrap data in the API envelope matching frontend's ApiEnvelope<T>."""
    if request_id is None:
        request_id = f"req-{uuid4().hex[:8]}"

    meta = {
        "requestId": request_id,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "source": "backend",
    }

    if elapsed_ms is not None:
        meta["elapsedMs"] = elapsed_ms

    return {"data": data, "meta": meta}