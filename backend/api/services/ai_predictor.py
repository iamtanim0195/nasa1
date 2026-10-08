"""
Risk prediction for Earth Metamorphosis.

Deliberately dependency-free (no scikit-learn): Python 3.14 is new enough that
wheels are not reliably available, and the model is ordinary least squares on a
single predictor, which is a handful of numpy operations.

The method matches the documented contract:

    predict_risk(detection_type, historical_data) ->
        {"risk": 0..1, "confidence": 0..1, "trend": "up" | "down" | "stable"}

`confidence` is the R^2 of the fit, so a noisy or flat series reports low
confidence rather than a confident-looking number.
"""
import logging

import numpy as np

logger = logging.getLogger("earth_metamorphosis.ai_predictor")

MIN_OBSERVATIONS = 3
INSUFFICIENT = {
    "risk": 0.5,
    "confidence": 0.3,
    "trend": "unknown",
}


def _ols(x, y):
    """Ordinary least squares for y = a + b*x. Returns (intercept, slope, r2)."""
    x_mean = float(np.mean(x))
    y_mean = float(np.mean(y))
    dx = x - x_mean
    var_x = float(np.sum(dx * dx))
    if var_x == 0.0:
        return y_mean, 0.0, 0.0

    slope = float(np.sum(dx * (y - y_mean)) / var_x)
    intercept = y_mean - slope * x_mean

    predicted = intercept + slope * x
    ss_res = float(np.sum((y - predicted) ** 2))
    ss_tot = float(np.sum((y - y_mean) ** 2))
    r2 = 0.0 if ss_tot == 0.0 else max(0.0, 1.0 - ss_res / ss_tot)
    return intercept, slope, r2


def predict_risk(detection_type, historical_data, scale=100.0):
    """
    Project the next value of a time series and express it as a 0..1 risk.

    Args:
        detection_type: module name, echoed back for traceability.
        historical_data: ordered observations (e.g. flood area per date).
        scale: divisor mapping the series onto 0..1. Defaults to 100 so a
            percentage series maps directly.

    Returns:
        dict with risk, confidence, trend, plus the fitted values so the UI can
        show its work.
    """
    series = [float(v) for v in (historical_data or []) if v is not None]

    if len(series) < MIN_OBSERVATIONS:
        return {
            **INSUFFICIENT,
            "detectionType": detection_type,
            "observations": len(series),
            "basis": (
                f"insufficient history: {len(series)} observation(s), "
                f"at least {MIN_OBSERVATIONS} required for a trend"
            ),
        }

    x = np.arange(len(series), dtype=float)
    y = np.asarray(series, dtype=float)

    intercept, slope, r2 = _ols(x, y)
    next_index = float(len(series))
    next_value = intercept + slope * next_index

    risk = float(np.clip(next_value / scale if scale else 0.0, 0.0, 1.0))

    if slope > 1e-9:
        trend = "up"
    elif slope < -1e-9:
        trend = "down"
    else:
        trend = "stable"

    return {
        "risk": round(risk, 4),
        "confidence": round(r2, 4),
        "trend": trend,
        "detectionType": detection_type,
        "observations": len(series),
        "projectedValue": round(float(next_value), 4),
        "slopePerStep": round(slope, 6),
        "basis": f"ordinary least squares over {len(series)} observations (R^2={r2:.3f})",
    }
