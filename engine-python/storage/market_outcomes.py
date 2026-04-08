from __future__ import annotations

from datetime import date, datetime
import json
from math import sqrt
from pathlib import Path
from statistics import median
from typing import Any


BASE_DIR = Path(__file__).parent.parent
ANALYSIS_HISTORY_DIR = BASE_DIR / "storage" / "analysis_snapshot_history"
MARKET_FILE_MAP = {
    "us": "us_stocks",
    "crypto": "crypto",
    "commodities": "commodities",
    "funds": "funds",
}


def _safe_float(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    if parsed != parsed:
        return 0.0
    return parsed


def _market_key(market: str) -> str:
    normalized = str(market or "").lower().strip()
    return MARKET_FILE_MAP.get(normalized, normalized)


def _public_market_name(market: str) -> str:
    normalized = str(market or "").lower().strip()
    return "us" if normalized == "us_stocks" else normalized


def _parse_snapshot_date(path: Path) -> date | None:
    try:
        return datetime.strptime(path.stem, "%Y-%m-%d").date()
    except ValueError:
        return None


def _list_market_snapshot_paths(market: str) -> list[Path]:
    market_dir = ANALYSIS_HISTORY_DIR / _market_key(market)
    if not market_dir.exists():
        return []
    paths = [path for path in market_dir.glob("*.json") if _parse_snapshot_date(path)]
    return sorted(paths, key=lambda item: _parse_snapshot_date(item) or date.min)


def _load_snapshot(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _index_rows(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = ((snapshot.get("data") or {}).get("all")) or []
    return {
        str(row.get("symbol") or "").upper().strip(): row
        for row in rows
        if isinstance(row, dict) and row.get("symbol")
    }


def _find_future_snapshot(anchor_date: date, horizon_days: int, snapshots: list[tuple[date, Path]]) -> tuple[date, Path] | None:
    target_ordinal = anchor_date.toordinal() + max(1, int(horizon_days))
    for snap_date, snap_path in snapshots:
        if snap_date.toordinal() >= target_ordinal:
            return (snap_date, snap_path)
    return None


def _compounded_return_pct(values: list[float]) -> float:
    growth = 1.0
    for value in values:
        growth *= 1.0 + (value / 100.0)
    return round((growth - 1.0) * 100.0, 4)


def _prediction_edge(direction: str, excess_return_pct: float) -> float:
    return excess_return_pct if direction == "bullish" else -excess_return_pct


def _wilson_interval(successes: int, trials: int, z: float = 1.96) -> dict[str, float]:
    if trials <= 0:
        return {"lower": 0.0, "upper": 0.0}
    phat = successes / trials
    denominator = 1 + (z * z / trials)
    center = (phat + (z * z / (2 * trials))) / denominator
    margin = (z * sqrt((phat * (1 - phat) / trials) + (z * z / (4 * trials * trials)))) / denominator
    return {"lower": round(center - margin, 4), "upper": round(center + margin, 4)}


def _selection_summary(items: list[dict[str, Any]], selection_type: str) -> dict[str, Any]:
    returns = [_safe_float(item.get("future_return_pct")) for item in items]
    benchmark_returns = [_safe_float(item.get("benchmark_return_pct")) for item in items]
    excess_returns = [_safe_float(item.get("excess_return_pct")) for item in items]
    direction_successes = sum(1 for item in items if bool(item.get("direction_correct")))
    alpha_successes = sum(1 for item in items if bool(item.get("alpha_correct")))
    sample_size = len(items)
    return {
        "selection_type": selection_type,
        "sample_size": sample_size,
        "avg_return_pct": round(sum(returns) / sample_size, 4) if sample_size else 0.0,
        "median_return_pct": round(median(returns), 4) if returns else 0.0,
        "avg_benchmark_return_pct": round(sum(benchmark_returns) / sample_size, 4) if sample_size else 0.0,
        "avg_excess_return_pct": round(sum(excess_returns) / sample_size, 4) if sample_size else 0.0,
        "median_excess_return_pct": round(median(excess_returns), 4) if excess_returns else 0.0,
        "direction_hit_rate": round((direction_successes / sample_size) * 100.0, 2) if sample_size else 0.0,
        "alpha_hit_rate": round((alpha_successes / sample_size) * 100.0, 2) if sample_size else 0.0,
        "correct_count": alpha_successes,
        "wrong_count": sample_size - alpha_successes,
        "hit_rate_confidence_interval": _wilson_interval(alpha_successes, sample_size),
    }


def _alignment_label(hit_rate: float, score_effect: float, sample_size: int) -> str:
    if sample_size < 2:
        return "İzleniyor"
    if hit_rate >= 62 and score_effect > 0:
        return "Skora Uyumlu"
    if hit_rate <= 42 and score_effect < 0:
        return "Skora Aykırı"
    return "Karışık"


def _alignment_note(label: str, horizon_days: int, sample_size: int) -> str:
    if label == "Skora Uyumlu":
        return f"Son {sample_size} gözlemde {horizon_days} günlük model bu sembolle uyumlu çalıştı."
    if label == "Skora Aykırı":
        return f"Son {sample_size} gözlemde {horizon_days} günlük model bu sembolde temkinli okunmalı."
    return "Örneklem sınırlı ya da sinyal davranışı karışık."


def _build_symbol_alignment(rows: list[dict[str, Any]], horizon_days: int) -> list[dict[str, Any]]:
    symbol_map: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        symbol = str(row.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        symbol_map.setdefault(symbol, []).append(row)

    results: list[dict[str, Any]] = []
    for symbol, items in symbol_map.items():
        sample_size = len(items)
        correct_count = sum(1 for item in items if bool(item.get("correct")))
        wrong_count = sample_size - correct_count
        hit_rate = round((correct_count / sample_size) * 100.0, 2) if sample_size else 0.0
        avg_edge = round(sum(_safe_float(item.get("prediction_edge_pct")) for item in items) / sample_size, 4) if sample_size else 0.0
        score_effect = round((hit_rate - 50.0) * 0.12 + avg_edge, 2)
        label = _alignment_label(hit_rate, score_effect, sample_size)
        bullish_predictions = sum(1 for item in items if str(item.get("direction") or "") == "bullish")
        bearish_predictions = sample_size - bullish_predictions
        results.append(
            {
                "symbol": symbol,
                "name": items[0].get("name"),
                "sample_size": sample_size,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "hit_rate": hit_rate,
                "avg_prediction_edge_pct": avg_edge,
                "bullish_predictions": bullish_predictions,
                "bearish_predictions": bearish_predictions,
                "score_effect": score_effect,
                "alignment_label": label,
                "alignment_note": _alignment_note(label, horizon_days, sample_size),
                "strongest_family": items[0].get("family"),
            }
        )
    return sorted(results, key=lambda item: (-_safe_float(item.get("score_effect")), -int(item.get("sample_size") or 0), str(item.get("symbol") or "")))


def _calibration_bucket_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(rows) < 10:
        return []
    usable = sorted(rows, key=lambda item: _safe_float(item.get("probability_outperform")))
    bucket_size = max(5, len(usable) // 6)
    buckets: list[dict[str, Any]] = []
    for start in range(0, len(usable), bucket_size):
        batch = usable[start:start + bucket_size]
        if not batch:
            continue
        avg_probability = sum(_safe_float(item.get("probability_outperform")) for item in batch) / len(batch)
        realized_rate = sum(1.0 for item in batch if bool(item.get("alpha_correct"))) / len(batch)
        buckets.append(
            {
                "bucket": f"{start + 1}-{start + len(batch)}",
                "avg_probability_outperform": round(avg_probability, 4),
                "realized_outperform_rate": round(realized_rate, 4),
                "count": len(batch),
            }
        )
    return buckets


def _build_latest_candidates_from_snapshot(*, snapshot: dict[str, Any], horizon_days: int, top_n: int) -> dict[str, Any]:
    rows = _index_rows(snapshot)
    scored_rows: list[dict[str, Any]] = []
    for symbol, row in rows.items():
        signal = row.get("market_signal") if isinstance(row.get("market_signal"), dict) else {}
        last_price = _safe_float(row.get("last"))
        if last_price <= 0:
            continue
        scored_rows.append(
            {
                "symbol": symbol,
                "name": row.get("name"),
                "last": last_price,
                "change_percent": _safe_float(row.get("change_percent")),
                "market_signal": signal,
                "score_value": _safe_float(signal.get("score")),
                "probability_positive": _safe_float(signal.get("probability_positive")),
                "probability_outperform": _safe_float(signal.get("probability_outperform")),
                "expected_return_pct": _safe_float(signal.get("expected_return_pct")),
                "expected_excess_return_pct": _safe_float(signal.get("expected_excess_return_pct")),
                "adil_deger": row.get("adil_deger"),
                "hakiki_alfa_pct": _safe_float(row.get("hakiki_alfa_pct")),
                "fund_type": row.get("fund_type"),
                "currency": row.get("currency"),
            }
        )

    return {
        "snapshot_date": snapshot.get("snapshot_date"),
        "score_label": f"{horizon_days} Gün Skoru",
        "rising": sorted(scored_rows, key=lambda item: (item["score_value"], item["change_percent"]), reverse=True)[:top_n],
        "falling": sorted(scored_rows, key=lambda item: (item["score_value"], -item["change_percent"]))[:top_n],
    }


def build_market_outcome_report(*, market: str, horizon_days: int = 1, top_n: int = 20) -> dict[str, Any]:
    snapshot_paths = _list_market_snapshot_paths(market)
    public_market = _public_market_name(market)
    if not snapshot_paths:
        return {
            "status": "insufficient_data",
            "market": public_market,
            "horizon_days": horizon_days,
            "top_n": top_n,
            "snapshot_count": 0,
            "comparison_count": 0,
            "observation_days": 0,
            "latest_snapshot_date": None,
            "message": "Tarihsel outcome arşivi henüz yeterli değil.",
            "window_summary": {
                "rising": _selection_summary([], "rising"),
                "falling": _selection_summary([], "falling"),
                "long_short_spread_pct": 0.0,
                "calibration_bucket_summary": [],
                "probability_brier_score": 0.0,
            },
            "correct_predictions": [],
            "wrong_predictions": [],
            "symbol_alignment": [],
            "score_aligned_symbols": [],
            "score_misaligned_symbols": [],
            "latest_candidates": {
                "snapshot_date": None,
                "score_label": f"{horizon_days} Gün Skoru",
                "rising": [],
                "falling": [],
            },
        }

    if len(snapshot_paths) < 2:
        latest_snapshot = _load_snapshot(snapshot_paths[-1])
        latest_snapshot_date = _parse_snapshot_date(snapshot_paths[-1]).isoformat()
        return {
            "status": "ok",
            "market": public_market,
            "horizon_days": horizon_days,
            "top_n": top_n,
            "snapshot_count": len(snapshot_paths),
            "comparison_count": 0,
            "observation_days": 0,
            "latest_snapshot_date": latest_snapshot_date,
            "message": "Güncel aday listesi hazır. Tarihsel doğrulama için daha fazla günlük snapshot birikiyor.",
            "window_summary": {
                "rising": _selection_summary([], "rising"),
                "falling": _selection_summary([], "falling"),
                "long_short_spread_pct": 0.0,
                "calibration_bucket_summary": [],
                "probability_brier_score": 0.0,
            },
            "correct_predictions": [],
            "wrong_predictions": [],
            "symbol_alignment": [],
            "score_aligned_symbols": [],
            "score_misaligned_symbols": [],
            "latest_candidates": _build_latest_candidates_from_snapshot(
                snapshot=latest_snapshot,
                horizon_days=horizon_days,
                top_n=top_n,
            ),
        }

    snapshots = [(_parse_snapshot_date(path), path) for path in snapshot_paths]
    normalized_snapshots = [(snap_date, path) for snap_date, path in snapshots if snap_date is not None]
    all_predictions: list[dict[str, Any]] = []
    latest_candidates_rising: list[dict[str, Any]] = []
    latest_candidates_falling: list[dict[str, Any]] = []
    latest_snapshot_date: str | None = None
    comparison_count = 0

    for index, (anchor_date, anchor_path) in enumerate(normalized_snapshots):
        future_item = _find_future_snapshot(anchor_date, horizon_days, normalized_snapshots[index + 1:])
        if future_item is None:
            continue
        future_date, future_path = future_item
        anchor_snapshot = _load_snapshot(anchor_path)
        future_snapshot = _load_snapshot(future_path)
        anchor_rows = _index_rows(anchor_snapshot)
        future_rows = _index_rows(future_snapshot)
        if not anchor_rows or not future_rows:
            continue

        benchmark_path_series = [
            _safe_float((_load_snapshot(path).get("data") or {}).get("benchmark_daily_return_pct"))
            for snap_date, path in normalized_snapshots
            if snap_date is not None and anchor_date < snap_date <= future_date
        ]
        benchmark_return_pct = _compounded_return_pct(benchmark_path_series) if benchmark_path_series else 0.0

        scored_rows: list[dict[str, Any]] = []
        for symbol, row in anchor_rows.items():
            signal = row.get("market_signal") if isinstance(row.get("market_signal"), dict) else {}
            last_price = _safe_float(row.get("last"))
            if last_price <= 0:
                continue
            scored_rows.append(
                {
                    "symbol": symbol,
                    "name": row.get("name"),
                    "last": last_price,
                    "change_percent": _safe_float(row.get("change_percent")),
                    "market_signal": signal,
                    "score_value": _safe_float(signal.get("score")),
                    "probability_positive": _safe_float(signal.get("probability_positive")),
                    "probability_outperform": _safe_float(signal.get("probability_outperform")),
                    "expected_return_pct": _safe_float(signal.get("expected_return_pct")),
                    "expected_excess_return_pct": _safe_float(signal.get("expected_excess_return_pct")),
                    "adil_deger": row.get("adil_deger"),
                    "hakiki_alfa_pct": _safe_float(row.get("hakiki_alfa_pct")),
                    "fund_type": row.get("fund_type"),
                    "currency": row.get("currency"),
                }
            )

        rising_candidates = sorted(scored_rows, key=lambda item: (item["score_value"], item["change_percent"]), reverse=True)[:top_n]
        falling_candidates = sorted(scored_rows, key=lambda item: (item["score_value"], -item["change_percent"]))[:top_n]

        if index == len(normalized_snapshots) - 2:
            latest_snapshot_date = anchor_date.isoformat()
            latest_candidates_rising = rising_candidates
            latest_candidates_falling = falling_candidates

        for direction, items in (("bullish", rising_candidates), ("bearish", falling_candidates)):
            for item in items:
                future_row = future_rows.get(item["symbol"])
                future_price = _safe_float((future_row or {}).get("last"))
                if future_price <= 0:
                    continue
                future_return_pct = ((future_price / item["last"]) - 1.0) * 100.0
                excess_return_pct = future_return_pct - benchmark_return_pct
                direction_correct = future_return_pct >= 0 if direction == "bullish" else future_return_pct <= 0
                alpha_correct = excess_return_pct >= 0 if direction == "bullish" else excess_return_pct <= 0
                prediction = {
                    "symbol": item["symbol"],
                    "name": item.get("name"),
                    "segment": f"{public_market}_{direction}",
                    "segment_label": "Yükseliş Modeli" if direction == "bullish" else "Düşüş Modeli",
                    "family": "market_signal",
                    "direction": direction,
                    "future_return_pct": round(future_return_pct, 4),
                    "benchmark_return_pct": round(benchmark_return_pct, 4),
                    "excess_return_pct": round(excess_return_pct, 4),
                    "prediction_edge_pct": round(_prediction_edge(direction, excess_return_pct), 4),
                    "direction_correct": direction_correct,
                    "alpha_correct": alpha_correct,
                    "correct": alpha_correct,
                    "score_value": round(item["score_value"], 2),
                    "probability_positive": round(item["probability_positive"], 4),
                    "probability_outperform": round(item["probability_outperform"], 4),
                    "expected_return_pct": round(item["expected_return_pct"], 4),
                    "expected_excess_return_pct": round(item["expected_excess_return_pct"], 4),
                    "from_date": anchor_date.isoformat(),
                    "to_date": future_date.isoformat(),
                    "holding_days": (future_date - anchor_date).days,
                }
                all_predictions.append(prediction)
                comparison_count += 1

    rising_rows = [item for item in all_predictions if item.get("direction") == "bullish"]
    falling_rows = [item for item in all_predictions if item.get("direction") == "bearish"]
    correct_predictions = [item for item in all_predictions if bool(item.get("correct"))]
    wrong_predictions = [item for item in all_predictions if not bool(item.get("correct"))]
    symbol_alignment = _build_symbol_alignment(all_predictions, horizon_days)
    aligned_symbols = [item for item in symbol_alignment if str(item.get("alignment_label")) == "Skora Uyumlu"]
    misaligned_symbols = [item for item in symbol_alignment if str(item.get("alignment_label")) == "Skora Aykırı"]

    latest_candidates = {
        "snapshot_date": latest_snapshot_date,
        "score_label": f"{horizon_days} Gün Skoru",
        "rising": latest_candidates_rising,
        "falling": latest_candidates_falling,
    }
    rising_summary = _selection_summary(rising_rows, "rising")
    falling_summary = _selection_summary(falling_rows, "falling")
    brier_rows = [
        (_safe_float(item.get("probability_outperform")), 1.0 if bool(item.get("alpha_correct")) else 0.0)
        for item in all_predictions
        if item.get("probability_outperform") is not None
    ]
    probability_brier_score = round(
        sum((prob - actual) ** 2 for prob, actual in brier_rows) / len(brier_rows),
        4,
    ) if brier_rows else 0.0

    return {
        "status": "ok",
        "market": public_market,
        "horizon_days": horizon_days,
        "top_n": top_n,
        "snapshot_count": len(snapshot_paths),
        "comparison_count": comparison_count,
        "observation_days": max(0, len(normalized_snapshots) - 1),
        "latest_snapshot_date": latest_snapshot_date or (_parse_snapshot_date(snapshot_paths[-1]).isoformat() if snapshot_paths else None),
        "window_summary": {
            "rising": rising_summary,
            "falling": falling_summary,
            "long_short_spread_pct": round(_safe_float(rising_summary.get("avg_excess_return_pct")) - _safe_float(falling_summary.get("avg_excess_return_pct")), 4),
            "calibration_bucket_summary": _calibration_bucket_summary(all_predictions),
            "probability_brier_score": probability_brier_score,
        },
        "correct_predictions": correct_predictions[:80],
        "wrong_predictions": wrong_predictions[:80],
        "symbol_alignment": symbol_alignment,
        "score_aligned_symbols": aligned_symbols[:40],
        "score_misaligned_symbols": misaligned_symbols[:40],
        "latest_candidates": latest_candidates,
    }
