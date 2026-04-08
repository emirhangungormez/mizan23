from __future__ import annotations

from math import exp, sqrt
from statistics import median
from typing import Any

from .formula_registry import get_formula_config, resolve_horizon_days


CALIBRATION_VERSION = "2026.04-sigmoid-v1"
MIN_ISOTONIC_SAMPLE_SIZE = 40

_HORIZON_RETURN_SCALE = {
    1: 1.8,
    5: 4.2,
    30: 8.5,
    180: 16.0,
    365: 24.0,
    730: 32.0,
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed != parsed:
        return default
    return parsed


def _sigmoid_probability(score: float, center: float = 55.0, slope: float = 0.115) -> float:
    return 1.0 / (1.0 + exp(-slope * (score - center)))


def _resolve_return_scale(horizon_days: int) -> float:
    if horizon_days in _HORIZON_RETURN_SCALE:
        return _HORIZON_RETURN_SCALE[horizon_days]
    if horizon_days < 5:
        return 2.6
    if horizon_days < 30:
        return 5.2
    if horizon_days < 180:
        return 10.5
    if horizon_days < 365:
        return 18.5
    return 28.0


def _sorted_buckets(observations: list[dict[str, Any]]) -> list[dict[str, float]]:
    if not observations:
        return []
    usable = [
        {
            "score": _safe_float(item.get("score_value"), 50.0),
            "positive": 1.0 if bool(item.get("direction_correct")) else 0.0,
            "outperform": 1.0 if bool(item.get("alpha_correct")) else 0.0,
            "future_return_pct": _safe_float(item.get("future_return_pct")),
            "future_excess_return_pct": _safe_float(item.get("excess_return_pct")),
        }
        for item in observations
    ]
    usable.sort(key=lambda item: item["score"])
    bucket_size = max(8, len(usable) // 10)
    buckets: list[dict[str, float]] = []
    for start in range(0, len(usable), bucket_size):
        batch = usable[start:start + bucket_size]
        if not batch:
            continue
        score_center = median(item["score"] for item in batch)
        positive_rate = sum(item["positive"] for item in batch) / len(batch)
        outperform_rate = sum(item["outperform"] for item in batch) / len(batch)
        avg_return = sum(item["future_return_pct"] for item in batch) / len(batch)
        avg_excess = sum(item["future_excess_return_pct"] for item in batch) / len(batch)
        buckets.append(
            {
                "score": score_center,
                "positive_rate": positive_rate,
                "outperform_rate": outperform_rate,
                "avg_return_pct": avg_return,
                "avg_excess_return_pct": avg_excess,
                "count": float(len(batch)),
            }
        )

    # Lightweight isotonic-style monotonic smoothing.
    running_positive = 0.0
    running_outperform = 0.0
    for index, bucket in enumerate(buckets):
        if index == 0:
            running_positive = bucket["positive_rate"]
            running_outperform = bucket["outperform_rate"]
        else:
            running_positive = max(running_positive, bucket["positive_rate"])
            running_outperform = max(running_outperform, bucket["outperform_rate"])
            bucket["positive_rate"] = running_positive
            bucket["outperform_rate"] = running_outperform
    return buckets


def _interpolate_bucket(score: float, buckets: list[dict[str, float]], key: str, fallback: float) -> float:
    if not buckets:
        return fallback
    if score <= buckets[0]["score"]:
        return buckets[0][key]
    if score >= buckets[-1]["score"]:
        return buckets[-1][key]
    for left, right in zip(buckets, buckets[1:]):
        if left["score"] <= score <= right["score"]:
            distance = right["score"] - left["score"]
            if distance <= 0:
                return left[key]
            ratio = (score - left["score"]) / distance
            return left[key] + ((right[key] - left[key]) * ratio)
    return fallback


def estimate_probability_fields(
    *,
    market: str,
    signal_id: str,
    score: float,
    confidence: float,
    horizon_days: int | None = None,
    historical_rows: list[dict[str, Any]] | None = None,
    return_bias_pct: float = 0.0,
    excess_bias_pct: float = 0.0,
    volatility_pct: float | None = None,
) -> dict[str, Any]:
    config = get_formula_config(market, signal_id)
    resolved_horizon_days = resolve_horizon_days(market, signal_id, fallback=horizon_days)
    confidence_value = _clamp(_safe_float(confidence, 50.0), 0.0, 100.0)
    confidence_factor = 0.55 + ((confidence_value / 100.0) * 0.45)
    score_value = _clamp(_safe_float(score, 50.0), 0.0, 100.0)

    sigmoid_positive = _sigmoid_probability(score_value)
    sigmoid_outperform = _sigmoid_probability(score_value, center=57.0, slope=0.105)
    method = "sigmoid"
    sample_size = 0
    buckets: list[dict[str, float]] = []
    if historical_rows and len(historical_rows) >= MIN_ISOTONIC_SAMPLE_SIZE:
        buckets = _sorted_buckets(historical_rows)
        if buckets:
            sigmoid_positive = _interpolate_bucket(score_value, buckets, "positive_rate", sigmoid_positive)
            sigmoid_outperform = _interpolate_bucket(score_value, buckets, "outperform_rate", sigmoid_outperform)
            sample_size = len(historical_rows)
            method = "isotonic-bucket"

    positive_probability = _clamp(sigmoid_positive * confidence_factor + (0.5 * (1.0 - confidence_factor)), 0.02, 0.98)
    outperform_probability = _clamp(sigmoid_outperform * confidence_factor + (0.5 * (1.0 - confidence_factor)), 0.02, 0.98)

    return_scale = _resolve_return_scale(resolved_horizon_days)
    expected_return_pct = ((positive_probability - 0.5) * 2.0 * return_scale) + _safe_float(return_bias_pct) * 0.35
    expected_excess_return_pct = ((outperform_probability - 0.5) * 2.0 * (return_scale * 0.65)) + _safe_float(excess_bias_pct) * 0.45

    realized_volatility = max(0.0, _safe_float(volatility_pct, 0.0))
    if realized_volatility <= 0:
        realized_volatility = max(1.0, (100.0 - confidence_value) * 0.16)
    risk_forecast_pct = _clamp((realized_volatility * sqrt(max(resolved_horizon_days, 1)) / 5.5) * (1.10 - confidence_factor * 0.35), 0.4, 40.0)

    calibration_confidence = confidence_value
    if sample_size > 0:
        calibration_confidence = _clamp(confidence_value * 0.55 + min(100.0, sample_size * 1.2) * 0.45, 0.0, 100.0)

    return {
        "probability_positive": round(positive_probability, 4),
        "probability_outperform": round(outperform_probability, 4),
        "expected_return_pct": round(expected_return_pct, 4),
        "expected_excess_return_pct": round(expected_excess_return_pct, 4),
        "risk_forecast_pct": round(risk_forecast_pct, 4),
        "calibration_confidence": round(calibration_confidence, 2),
        "signal_version": config.get("version"),
        "calibration_version": CALIBRATION_VERSION,
        "calibration_method": method,
        "horizon_days": resolved_horizon_days,
        "horizon_label": config.get("horizon_label"),
        "thresholds": config.get("thresholds"),
        "sample_size": sample_size,
        "bucket_summary": [
            {
                "score": round(bucket["score"], 2),
                "positive_rate": round(bucket["positive_rate"], 4),
                "outperform_rate": round(bucket["outperform_rate"], 4),
                "avg_return_pct": round(bucket["avg_return_pct"], 4),
                "avg_excess_return_pct": round(bucket["avg_excess_return_pct"], 4),
                "count": int(bucket["count"]),
            }
            for bucket in buckets
        ],
    }


def derive_probability_action(
    *,
    market: str,
    signal_id: str,
    probability_positive: float,
    expected_excess_return_pct: float,
    default_action: str,
    default_horizon: str,
) -> dict[str, str]:
    config = get_formula_config(market, signal_id)
    thresholds = config.get("thresholds") or {}
    labels = config.get("labels") or {}
    strong_probability = _safe_float(thresholds.get("strong_probability"), 0.62)
    watch_probability = _safe_float(thresholds.get("watch_probability"), 0.55)
    weak_probability = _safe_float(thresholds.get("weak_probability"), 0.45)

    if probability_positive >= strong_probability and expected_excess_return_pct > 0:
        return {
            "action": str(labels.get("strong_action") or default_action),
            "horizon": str(config.get("horizon_label") or default_horizon),
            "decision_band": "guclu",
        }
    if probability_positive >= watch_probability:
        return {
            "action": str(labels.get("watch_action") or default_action),
            "horizon": str(config.get("horizon_label") or default_horizon),
            "decision_band": "izleme",
        }
    if probability_positive <= weak_probability:
        return {
            "action": str(labels.get("weak_action") or default_action),
            "horizon": str(config.get("horizon_label") or default_horizon),
            "decision_band": "zayif",
        }
    return {
        "action": default_action,
        "horizon": default_horizon,
        "decision_band": "notr",
    }
