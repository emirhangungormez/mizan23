from __future__ import annotations

from datetime import date, datetime, timezone
import json
from pathlib import Path
from statistics import median
from typing import Any

from storage.proprietary_snapshots import load_latest_bist_proprietary_snapshot


SNAPSHOT_DIR = Path(__file__).parent.parent / "storage" / "proprietary_snapshots"
PREDICTION_MEMORY_PATH = SNAPSHOT_DIR / "bist_prediction_memory.json"
PREDICTION_MEMORY_SCHEMA_VERSION = 1
DEFAULT_MEMORY_HORIZONS = (1, 5, 20)

_prediction_memory_cache: dict[str, Any] | None = None

SEGMENT_CONFIGS: dict[str, dict[str, Any]] = {
    "top_firsat_20": {
        "label": "Guclu Firsat",
        "score_field": "firsat_skoru",
        "direction": "bullish",
        "sort": "desc",
        "family": "firsat",
    },
    "top_trade_20": {
        "label": "Guclu Trade",
        "score_field": "trade_skoru",
        "direction": "bullish",
        "sort": "desc",
        "family": "trade",
    },
    "top_uzun_vade_20": {
        "label": "Guclu Uzun Vade",
        "score_field": "uzun_vade_skoru",
        "direction": "bullish",
        "sort": "desc",
        "family": "uzun_vade",
    },
    "top_hakiki_alfa_20": {
        "label": "Pozitif Hakiki Alfa",
        "score_field": "hakiki_alfa_pct",
        "direction": "bullish",
        "sort": "desc",
        "family": "hakiki_alfa",
    },
    "bottom_firsat_20": {
        "label": "Zayif Firsat",
        "score_field": "firsat_skoru",
        "direction": "bearish",
        "sort": "asc",
        "family": "firsat",
    },
    "bottom_trade_20": {
        "label": "Zayif Trade",
        "score_field": "trade_skoru",
        "direction": "bearish",
        "sort": "asc",
        "family": "trade",
    },
    "bottom_uzun_vade_20": {
        "label": "Zayif Uzun Vade",
        "score_field": "uzun_vade_skoru",
        "direction": "bearish",
        "sort": "asc",
        "family": "uzun_vade",
    },
    "bottom_hakiki_alfa_20": {
        "label": "Negatif Hakiki Alfa",
        "score_field": "hakiki_alfa_pct",
        "direction": "bearish",
        "sort": "asc",
        "family": "hakiki_alfa",
    },
}


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_snapshot_date(path: Path) -> date | None:
    stem = path.stem
    if not stem.startswith("bist_snapshot_"):
        return None
    try:
        return datetime.strptime(stem.replace("bist_snapshot_", ""), "%Y-%m-%d").date()
    except ValueError:
        return None


def list_bist_snapshot_paths() -> list[Path]:
    paths = []
    for path in SNAPSHOT_DIR.glob("bist_snapshot_*.json"):
        if _parse_snapshot_date(path):
            paths.append(path)
    return sorted(paths, key=lambda item: _parse_snapshot_date(item) or date.min)


def load_bist_snapshot(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _index_by_symbol(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    records = snapshot.get("stocks") or []
    return {str(item.get("symbol")).upper(): item for item in records if item.get("symbol")}


def _find_future_snapshot(anchor_date: date, horizon_days: int, snapshots: list[tuple[date, Path]]) -> tuple[date, Path] | None:
    target_date = anchor_date.toordinal() + horizon_days
    for snap_date, path in snapshots:
        if snap_date.toordinal() >= target_date:
            return (snap_date, path)
    return None


def _sort_value(record: dict[str, Any], score_field: str) -> float:
    if score_field == "hakiki_alfa_pct":
        return _safe_float((record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct"))
    return _safe_float(record.get(score_field))


def _window_score_value(record: dict[str, Any], horizon_days: int) -> float:
    firsat = _safe_float(record.get("firsat_skoru"))
    trade = _safe_float(record.get("trade_skoru"))
    uzun_vade = _safe_float(record.get("uzun_vade_skoru"))
    radar = _safe_float(record.get("radar_skoru"))
    finansal = _safe_float(record.get("finansal_dayaniklilik_skoru"))
    sermaye = _safe_float(record.get("sermaye_disiplini_skoru"))
    adil = _safe_float(record.get("adil_deger_skoru"))
    hakiki_alfa = _safe_float((record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct"))

    if horizon_days <= 1:
        return round((firsat * 0.55) + (trade * 0.30) + (radar * 0.15), 2)
    if horizon_days <= 5:
        return round((firsat * 0.25) + (trade * 0.60) + (radar * 0.15), 2)
    if horizon_days <= 30:
        return round((trade * 0.45) + (uzun_vade * 0.25) + (radar * 0.15) + (adil * 0.15), 2)
    if horizon_days <= 180:
        return round((uzun_vade * 0.40) + (radar * 0.10) + (finansal * 0.25) + (sermaye * 0.10) + (adil * 0.15), 2)
    if horizon_days <= 365:
        return round((uzun_vade * 0.45) + (finansal * 0.20) + (sermaye * 0.15) + (adil * 0.10) + (hakiki_alfa * 0.10), 2)
    return round((uzun_vade * 0.40) + (finansal * 0.25) + (sermaye * 0.20) + (adil * 0.10) + (hakiki_alfa * 0.05), 2)


def _window_score_label(horizon_days: int) -> str:
    if horizon_days <= 1:
        return "Gun Ici Skoru"
    if horizon_days <= 5:
        return "5 Gun Skoru"
    if horizon_days <= 30:
        return "30 Gun Skoru"
    if horizon_days <= 180:
        return "6 Ay Skoru"
    if horizon_days <= 365:
        return "1 Yil Skoru"
    return "2 Yil Skoru"


def _window_signal_key(horizon_days: int) -> str:
    if horizon_days <= 1:
        return "firsatlar"
    if horizon_days <= 5:
        return "trade"
    if horizon_days <= 30:
        return "radar"
    return "uzun_vade"


def _window_signal_payload(record: dict[str, Any], horizon_days: int, score_value: float) -> dict[str, Any]:
    signal_key = _window_signal_key(horizon_days)
    signals = record.get("signals") if isinstance(record.get("signals"), dict) else {}
    signal = signals.get(signal_key) if isinstance(signals, dict) and isinstance(signals.get(signal_key), dict) else {}
    probability_positive = _safe_float(signal.get("probability_positive"))
    probability_outperform = _safe_float(signal.get("probability_outperform"))
    expected_return_pct = _safe_float(signal.get("expected_return_pct"))
    expected_excess_return_pct = _safe_float(signal.get("expected_excess_return_pct"))

    if probability_positive <= 0 and probability_outperform <= 0:
        from scoring.probability_engine import estimate_probability_fields

        estimated = estimate_probability_fields(
            market="bist",
            signal_id=signal_key,
            score=round(_safe_float(signal.get("score")) or score_value, 2),
            confidence=72.0,
            horizon_days=horizon_days,
            return_bias_pct=_safe_float((record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
            excess_bias_pct=_safe_float((record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
            volatility_pct=abs(_safe_float(record.get("change_percent"))) * 2.0,
        )
        probability_positive = _safe_float(estimated.get("probability_positive"))
        probability_outperform = _safe_float(estimated.get("probability_outperform"))
        expected_return_pct = _safe_float(estimated.get("expected_return_pct"))
        expected_excess_return_pct = _safe_float(estimated.get("expected_excess_return_pct"))

    return {
        "score": round(_safe_float(signal.get("score")) or score_value, 2),
        "action": signal.get("action"),
        "horizon": signal.get("horizon"),
        "probability_positive": round(probability_positive, 4),
        "probability_outperform": round(probability_outperform, 4),
        "expected_return_pct": round(expected_return_pct, 4),
        "expected_excess_return_pct": round(expected_excess_return_pct, 4),
    }


def _window_family(record: dict[str, Any], horizon_days: int) -> str:
    candidates: list[tuple[str, float]] = [
        ("firsat", _safe_float(record.get("firsat_skoru"))),
        ("trade", _safe_float(record.get("trade_skoru"))),
        ("uzun_vade", _safe_float(record.get("uzun_vade_skoru"))),
        ("hakiki_alfa", _safe_float((record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct"))),
    ]

    if horizon_days <= 1:
        candidates.append(("radar", _safe_float(record.get("radar_skoru"))))
    elif horizon_days >= 180:
        candidates.append(("finansal", _safe_float(record.get("finansal_dayaniklilik_skoru"))))

    return sorted(candidates, key=lambda item: item[1], reverse=True)[0][0]


def _benchmark_daily_return_pct(snapshot: dict[str, Any]) -> float:
    return _safe_float((snapshot.get("global_reference") or {}).get("daily_return_pct"))


def _compounded_return_pct(daily_returns_pct: list[float]) -> float:
    growth = 1.0
    for value in daily_returns_pct:
        growth *= 1.0 + (value / 100.0)
    return (growth - 1.0) * 100.0


def _build_latest_candidates(*, horizon_days: int, top_n: int, snapshot_paths: list[Path]) -> dict[str, Any]:
    if not snapshot_paths:
        return {
            "snapshot_date": None,
            "rising": [],
            "falling": [],
        }

    latest_path = snapshot_paths[-1]
    latest_date = _parse_snapshot_date(latest_path)
    latest_snapshot = load_latest_bist_proprietary_snapshot() or load_bist_snapshot(latest_path)
    latest_date = _parse_snapshot_date(Path(f"bist_snapshot_{latest_snapshot.get('snapshot_date')}.json")) or latest_date
    records = latest_snapshot.get("stocks") or []

    normalized_rows: list[dict[str, Any]] = []
    for record in records:
        symbol = str(record.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        score_value = _window_score_value(record, horizon_days)
        market_signal = _window_signal_payload(record, horizon_days, score_value)
        normalized_rows.append(
            {
                "symbol": symbol,
                "name": record.get("name"),
                "last": round(_safe_float(record.get("last")), 4),
                "change_percent": round(_safe_float(record.get("change_percent")), 4),
                "score_value": score_value,
                "score_label": _window_score_label(horizon_days),
                "snapshot_date": latest_snapshot.get("snapshot_date") or (latest_date.isoformat() if latest_date else None),
                "market_signal": market_signal,
                "probability_positive": market_signal.get("probability_positive"),
                "probability_outperform": market_signal.get("probability_outperform"),
                "expected_return_pct": market_signal.get("expected_return_pct"),
                "expected_excess_return_pct": market_signal.get("expected_excess_return_pct"),
            }
        )

    rising = sorted(
        normalized_rows,
        key=lambda item: (_safe_float(item.get("score_value")), _safe_float(item.get("change_percent"))),
        reverse=True,
    )[:top_n]
    falling = sorted(
        normalized_rows,
        key=lambda item: (_safe_float(item.get("score_value")), -_safe_float(item.get("change_percent"))),
    )[:top_n]

    return {
        "snapshot_date": latest_date.isoformat() if latest_date else None,
        "score_label": _window_score_label(horizon_days),
        "rising": rising,
        "falling": falling,
    }


def _build_bucket(segment_name: str, source_records: list[dict[str, Any]], top_n: int) -> list[dict[str, Any]]:
    config = SEGMENT_CONFIGS[segment_name]
    reverse = config.get("sort") != "asc"
    sorted_records = sorted(
        source_records,
        key=lambda item: _sort_value(item, str(config.get("score_field"))),
        reverse=reverse,
    )
    return sorted_records[:top_n]


def _prediction_edge_pct(direction: str, future_return_pct: float) -> float:
    return future_return_pct if direction == "bullish" else -future_return_pct


def _is_correct_prediction(direction: str, future_return_pct: float) -> bool:
    if direction == "bullish":
        return future_return_pct > 0
    return future_return_pct < 0


def _compute_score_effect(hit_rate: float, avg_prediction_edge_pct: float, sample_size: int) -> float:
    if sample_size < 3:
        return 0.0
    confidence = min(1.0, sample_size / 12.0)
    hit_component = ((hit_rate - 50.0) / 50.0) * 3.2
    edge_component = max(-1.4, min(1.4, avg_prediction_edge_pct / 8.0))
    return round(max(-4.5, min(4.5, (hit_component + edge_component) * confidence)), 2)


def _alignment_label(score_effect: float, sample_size: int) -> str:
    if sample_size < 3:
        return "Izleniyor"
    if score_effect >= 2.2:
        return "Skorla Uyumlu"
    if score_effect >= 0.8:
        return "Genelde Uyumlu"
    if score_effect <= -2.2:
        return "Skora Aykiri"
    if score_effect <= -0.8:
        return "Temkinli"
    return "Karisik"


def _alignment_note(label: str, horizon_days: int, sample_size: int) -> str:
    if sample_size < 3:
        return f"{horizon_days} gun ufkunda yeterli tahmin birikimi yok."
    if label == "Skorla Uyumlu":
        return f"{horizon_days} gun ufkunda bu hisse skor mantigina guclu sekilde uyuyor."
    if label == "Genelde Uyumlu":
        return f"{horizon_days} gun ufkunda sistemle uyum var, ama tam kusursuz degil."
    if label == "Skora Aykiri":
        return f"{horizon_days} gun ufkunda bu hisse skora ters davranma egilimi gosteriyor."
    if label == "Temkinli":
        return f"{horizon_days} gun ufkunda uyumsuzluk riski var; skorlar dikkatle okunmali."
    return f"{horizon_days} gun ufkunda bazen uyumlu bazen uyumsuz; karar verirken ihtiyat gerekiyor."


def _summarize_outcomes(items: list[dict[str, Any]]) -> dict[str, Any]:
    returns = [_safe_float(item.get("future_return_pct")) for item in items]
    edges = [_safe_float(item.get("prediction_edge_pct")) for item in items]
    positive_count = sum(1 for value in returns if value > 0)
    negative_count = sum(1 for value in returns if value < 0)
    neutral_count = len(returns) - positive_count - negative_count
    correct_count = sum(1 for item in items if bool(item.get("correct")))
    wrong_count = sum(1 for item in items if not bool(item.get("correct")) and _safe_float(item.get("future_return_pct")) != 0.0)

    return {
        "sample_size": len(items),
        "avg_return_pct": round(sum(returns) / len(returns), 4) if returns else 0.0,
        "median_return_pct": round(median(returns), 4) if returns else 0.0,
        "avg_prediction_edge_pct": round(sum(edges) / len(edges), 4) if edges else 0.0,
        "median_prediction_edge_pct": round(median(edges), 4) if edges else 0.0,
        "hit_rate": round((correct_count / len(items)) * 100.0, 2) if items else 0.0,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "positive_count": positive_count,
        "negative_count": negative_count,
        "neutral_count": neutral_count,
    }


def _summarize_window_outcomes(items: list[dict[str, Any]], selection_type: str) -> dict[str, Any]:
    returns = [_safe_float(item.get("future_return_pct")) for item in items]
    benchmark_returns = [_safe_float(item.get("benchmark_return_pct")) for item in items]
    excess_returns = [_safe_float(item.get("excess_return_pct")) for item in items]
    direction_correct_count = sum(1 for item in items if bool(item.get("direction_correct")))
    alpha_correct_count = sum(1 for item in items if bool(item.get("alpha_correct")))
    sample_size = len(items)

    return {
        "selection_type": selection_type,
        "sample_size": sample_size,
        "avg_return_pct": round(sum(returns) / sample_size, 4) if sample_size else 0.0,
        "median_return_pct": round(median(returns), 4) if returns else 0.0,
        "avg_benchmark_return_pct": round(sum(benchmark_returns) / sample_size, 4) if sample_size else 0.0,
        "avg_excess_return_pct": round(sum(excess_returns) / sample_size, 4) if sample_size else 0.0,
        "median_excess_return_pct": round(median(excess_returns), 4) if excess_returns else 0.0,
        "direction_hit_rate": round((direction_correct_count / sample_size) * 100.0, 2) if sample_size else 0.0,
        "alpha_hit_rate": round((alpha_correct_count / sample_size) * 100.0, 2) if sample_size else 0.0,
        "correct_count": alpha_correct_count,
        "wrong_count": sample_size - alpha_correct_count,
    }


def _build_symbol_alignment(rows: list[dict[str, Any]], horizon_days: int) -> list[dict[str, Any]]:
    symbol_map: dict[str, dict[str, Any]] = {}

    for row in rows:
        symbol = str(row.get("symbol") or "").upper().strip()
        if not symbol:
            continue
        bucket = symbol_map.setdefault(
            symbol,
            {
                "symbol": symbol,
                "name": row.get("name"),
                "rows": [],
                "bullish_predictions": 0,
                "bearish_predictions": 0,
                "families": {},
            },
        )
        bucket["rows"].append(row)
        direction = str(row.get("direction") or "bullish")
        if direction == "bearish":
            bucket["bearish_predictions"] += 1
        else:
            bucket["bullish_predictions"] += 1
        family = str(row.get("family") or "other")
        bucket["families"][family] = int(bucket["families"].get(family) or 0) + 1

    results: list[dict[str, Any]] = []
    for symbol, bucket in symbol_map.items():
        items = list(bucket["rows"])
        edges = [_safe_float(item.get("prediction_edge_pct")) for item in items]
        correct_count = sum(1 for item in items if bool(item.get("correct")))
        sample_size = len(items)
        wrong_count = sum(1 for item in items if not bool(item.get("correct")) and _safe_float(item.get("future_return_pct")) != 0.0)
        hit_rate = round((correct_count / sample_size) * 100.0, 2) if sample_size else 0.0
        avg_edge = round(sum(edges) / len(edges), 4) if edges else 0.0
        score_effect = _compute_score_effect(hit_rate, avg_edge, sample_size)
        label = _alignment_label(score_effect, sample_size)
        strongest_family = None
        family_counts = bucket.get("families") or {}
        if family_counts:
            strongest_family = sorted(
                family_counts.items(),
                key=lambda item: (-int(item[1]), item[0]),
            )[0][0]

        results.append(
            {
                "symbol": symbol,
                "name": bucket.get("name"),
                "sample_size": sample_size,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "hit_rate": hit_rate,
                "avg_prediction_edge_pct": avg_edge,
                "bullish_predictions": bucket.get("bullish_predictions", 0),
                "bearish_predictions": bucket.get("bearish_predictions", 0),
                "score_effect": score_effect,
                "alignment_label": label,
                "alignment_note": _alignment_note(label, horizon_days, sample_size),
                "strongest_family": strongest_family,
            }
        )

    return sorted(
        results,
        key=lambda item: (
            -_safe_float(item.get("score_effect")),
            -int(item.get("sample_size") or 0),
            str(item.get("symbol") or ""),
        ),
    )


def _latest_snapshot_date(snapshot_paths: list[Path]) -> str | None:
    if not snapshot_paths:
        return None
    latest = _parse_snapshot_date(snapshot_paths[-1])
    return latest.isoformat() if latest else None


def _snapshot_revision(snapshot_paths: list[Path]) -> int:
    if not snapshot_paths:
        return 0
    latest_path = snapshot_paths[-1]
    try:
        return int(latest_path.stat().st_mtime_ns)
    except OSError:
        return 0


def _build_outcome_rows(
    *,
    horizon_days: int,
    top_n: int,
    snapshot_paths: list[Path] | None = None,
) -> dict[str, Any]:
    if snapshot_paths is None:
        snapshot_paths = list_bist_snapshot_paths()

    snapshots = [(_parse_snapshot_date(path), path) for path in snapshot_paths]
    snapshots = [(snap_date, path) for snap_date, path in snapshots if snap_date is not None]

    if len(snapshots) < 2:
        return {
            "status": "insufficient_data",
            "message": "Outcome report icin en az 2 snapshot gerekiyor.",
            "available_snapshots": len(snapshots),
            "horizon_days": horizon_days,
        }

    snapshot_cache: dict[str, dict[str, Any]] = {}

    def _load_cached(path: Path) -> dict[str, Any]:
        cache_key = str(path)
        payload = snapshot_cache.get(cache_key)
        if payload is None:
            payload = load_bist_snapshot(path)
            snapshot_cache[cache_key] = payload
        return payload

    daily_returns_pct = [_benchmark_daily_return_pct(_load_cached(path)) for _, path in snapshots]

    comparisons: list[dict[str, Any]] = []
    segment_rows: dict[str, list[dict[str, Any]]] = {key: [] for key in SEGMENT_CONFIGS}
    legacy_rows: list[dict[str, Any]] = []
    window_rising_rows: list[dict[str, Any]] = []
    window_falling_rows: list[dict[str, Any]] = []
    window_all_rows: list[dict[str, Any]] = []

    for anchor_index, (anchor_date, anchor_path) in enumerate(snapshots):
        future_match = _find_future_snapshot(anchor_date, horizon_days, snapshots)
        if not future_match:
            continue

        future_date, future_path = future_match
        future_index = next((idx for idx, (snap_date, path) in enumerate(snapshots) if snap_date == future_date and path == future_path), None)
        if future_index is None:
            continue

        anchor_snapshot = _load_cached(anchor_path)
        future_snapshot = _load_cached(future_path)

        anchor_records = anchor_snapshot.get("stocks") or []
        future_record_index = _index_by_symbol(future_snapshot)
        benchmark_return_pct = _compounded_return_pct(daily_returns_pct[anchor_index + 1 : future_index + 1])

        for segment_name, config in SEGMENT_CONFIGS.items():
            records = _build_bucket(segment_name, anchor_records, top_n)
            direction = str(config.get("direction") or "bullish")
            family = str(config.get("family") or "other")
            score_field = str(config.get("score_field") or "")

            for record in records:
                symbol = str(record.get("symbol") or "").upper().strip()
                if not symbol:
                    continue

                future_record = future_record_index.get(symbol)
                if not future_record:
                    continue

                start_price = _safe_float(record.get("last"))
                end_price = _safe_float(future_record.get("last"))
                if start_price <= 0 or end_price <= 0:
                    continue

                future_return_pct = ((end_price / start_price) - 1.0) * 100.0
                prediction_edge_pct = _prediction_edge_pct(direction, future_return_pct)
                correct = _is_correct_prediction(direction, future_return_pct)

                row = {
                    "segment": segment_name,
                    "segment_label": config.get("label"),
                    "family": family,
                    "direction": direction,
                    "symbol": symbol,
                    "name": record.get("name"),
                    "from_date": anchor_date.isoformat(),
                    "to_date": future_date.isoformat(),
                    "holding_days": (future_date - anchor_date).days,
                    "start_price": round(start_price, 4),
                    "end_price": round(end_price, 4),
                    "future_return_pct": round(future_return_pct, 4),
                    "prediction_edge_pct": round(prediction_edge_pct, 4),
                    "correct": correct,
                    "score_value": round(_sort_value(record, score_field), 2),
                    "firsat_skoru": record.get("firsat_skoru"),
                    "trade_skoru": record.get("trade_skoru"),
                    "uzun_vade_skoru": record.get("uzun_vade_skoru"),
                    "hakiki_alfa_pct": (record.get("hakiki_alfa") or {}).get("hakiki_alfa_pct"),
                }
                segment_rows[segment_name].append(row)
                legacy_rows.append(row)

        normalized_window_records = []
        for record in anchor_records:
            symbol = str(record.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            score_value = _window_score_value(record, horizon_days)
            normalized_window_records.append(
                {
                    "symbol": symbol,
                    "name": record.get("name"),
                    "score_value": score_value,
                    "family": _window_family(record, horizon_days),
                    "record": record,
                }
            )

        selected_rising = sorted(
            normalized_window_records,
            key=lambda item: (_safe_float(item.get("score_value")), _safe_float((item.get("record") or {}).get("change_percent"))),
            reverse=True,
        )[:top_n]
        selected_falling = sorted(
            normalized_window_records,
            key=lambda item: (_safe_float(item.get("score_value")), -_safe_float((item.get("record") or {}).get("change_percent"))),
        )[:top_n]

        for selection_type, selected_records in (("rising", selected_rising), ("falling", selected_falling)):
            direction = "bullish" if selection_type == "rising" else "bearish"
            segment_label = "Donem Yukselis Listesi" if selection_type == "rising" else "Donem Dusus Listesi"

            for selected in selected_records:
                record = selected.get("record") or {}
                symbol = str(selected.get("symbol") or "").upper().strip()
                if not symbol:
                    continue

                future_record = future_record_index.get(symbol)
                if not future_record:
                    continue

                start_price = _safe_float(record.get("last"))
                end_price = _safe_float(future_record.get("last"))
                if start_price <= 0 or end_price <= 0:
                    continue

                future_return_pct = ((end_price / start_price) - 1.0) * 100.0
                excess_return_pct = future_return_pct - benchmark_return_pct
                direction_correct = future_return_pct > 0 if selection_type == "rising" else future_return_pct < 0
                alpha_correct = excess_return_pct > 0 if selection_type == "rising" else excess_return_pct < 0
                prediction_edge_pct = excess_return_pct if selection_type == "rising" else -excess_return_pct

                row = {
                    "segment": f"window_{selection_type}",
                    "segment_label": segment_label,
                    "family": selected.get("family") or "other",
                    "direction": direction,
                    "selection_type": selection_type,
                    "symbol": symbol,
                    "name": record.get("name"),
                    "from_date": anchor_date.isoformat(),
                    "to_date": future_date.isoformat(),
                    "holding_days": (future_date - anchor_date).days,
                    "start_price": round(start_price, 4),
                    "end_price": round(end_price, 4),
                    "future_return_pct": round(future_return_pct, 4),
                    "benchmark_return_pct": round(benchmark_return_pct, 4),
                    "excess_return_pct": round(excess_return_pct, 4),
                    "prediction_edge_pct": round(prediction_edge_pct, 4),
                    "correct": alpha_correct,
                    "direction_correct": direction_correct,
                    "alpha_correct": alpha_correct,
                    "score_value": round(_safe_float(selected.get("score_value")), 2),
                }

                if selection_type == "rising":
                    window_rising_rows.append(row)
                else:
                    window_falling_rows.append(row)
                window_all_rows.append(row)

        comparisons.append(
            {
                "from_date": anchor_date.isoformat(),
                "to_date": future_date.isoformat(),
                "holding_days": (future_date - anchor_date).days,
                "benchmark_return_pct": round(benchmark_return_pct, 4),
            }
        )

    if not comparisons:
        return {
            "status": "insufficient_forward_window",
            "message": "Secilen ufuk icin yeterli ileri tarihli snapshot bulunamadi.",
            "available_snapshots": len(snapshots),
            "horizon_days": horizon_days,
        }

    segments_summary = {}
    for segment_name, rows in segment_rows.items():
        summary = _summarize_outcomes(rows)
        summary["direction"] = SEGMENT_CONFIGS[segment_name]["direction"]
        summary["segment_label"] = SEGMENT_CONFIGS[segment_name]["label"]
        summary["examples"] = sorted(rows, key=lambda item: _safe_float(item.get("prediction_edge_pct")), reverse=True)[:10]
        summary["wrong_examples"] = sorted(rows, key=lambda item: _safe_float(item.get("prediction_edge_pct")))[:10]
        segments_summary[segment_name] = summary

    window_summary = {
        "rising": _summarize_window_outcomes(window_rising_rows, "rising"),
        "falling": _summarize_window_outcomes(window_falling_rows, "falling"),
        "long_short_spread_pct": round(
            _safe_float((_summarize_window_outcomes(window_rising_rows, "rising")).get("avg_excess_return_pct"))
            - _safe_float((_summarize_window_outcomes(window_falling_rows, "falling")).get("avg_excess_return_pct")),
            4,
        ),
    }

    symbol_alignment = _build_symbol_alignment(window_all_rows, horizon_days)
    correct_predictions = sorted(window_all_rows, key=lambda item: (str(item.get("from_date") or ""), _safe_float(item.get("prediction_edge_pct"))), reverse=True)
    wrong_predictions = sorted(window_all_rows, key=lambda item: (str(item.get("from_date") or ""), -_safe_float(item.get("prediction_edge_pct"))), reverse=True)
    score_aligned_symbols = [item for item in symbol_alignment if _safe_float(item.get("score_effect")) > 0][:24]
    score_misaligned_symbols = [item for item in sorted(symbol_alignment, key=lambda item: _safe_float(item.get("score_effect"))) if _safe_float(item.get("score_effect")) < 0][:24]
    latest_candidates = _build_latest_candidates(horizon_days=horizon_days, top_n=top_n, snapshot_paths=snapshot_paths)

    return {
        "status": "ok",
        "market": "bist",
        "horizon_days": horizon_days,
        "top_n": top_n,
        "snapshot_count": len(snapshots),
        "comparison_count": len(comparisons),
        "observation_days": len(comparisons),
        "latest_snapshot_date": latest_candidates.get("snapshot_date"),
        "segments": segments_summary,
        "window_summary": window_summary,
        "comparisons": comparisons[-20:],
        "correct_predictions": correct_predictions,
        "wrong_predictions": wrong_predictions,
        "symbol_alignment": symbol_alignment,
        "score_aligned_symbols": score_aligned_symbols,
        "score_misaligned_symbols": score_misaligned_symbols,
        "latest_candidates": latest_candidates,
    }


def build_bist_outcome_report(*, horizon_days: int = 1, top_n: int = 20) -> dict[str, Any]:
    snapshot_paths = list_bist_snapshot_paths()
    return _build_outcome_rows(horizon_days=horizon_days, top_n=top_n, snapshot_paths=snapshot_paths)


def _compact_horizon_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "sample_size": int(profile.get("sample_size") or 0),
        "correct_count": int(profile.get("correct_count") or 0),
        "wrong_count": int(profile.get("wrong_count") or 0),
        "hit_rate": round(_safe_float(profile.get("hit_rate")), 2),
        "avg_prediction_edge_pct": round(_safe_float(profile.get("avg_prediction_edge_pct")), 4),
        "score_effect": round(_safe_float(profile.get("score_effect")), 2),
        "alignment_label": profile.get("alignment_label"),
        "alignment_note": profile.get("alignment_note"),
        "strongest_family": profile.get("strongest_family"),
    }


def _combine_effect(entries: list[tuple[float, dict[str, Any] | None]]) -> float:
    weighted_total = 0.0
    weight_sum = 0.0
    for base_weight, entry in entries:
        if not entry:
            continue
        sample_size = int(entry.get("sample_size") or 0)
        confidence = min(1.0, sample_size / 8.0)
        if confidence <= 0:
            continue
        weight = base_weight * confidence
        weighted_total += _safe_float(entry.get("score_effect")) * weight
        weight_sum += weight
    if weight_sum <= 0:
        return 0.0
    return round(weighted_total / weight_sum, 2)


def _build_overall_symbol_profile(symbol: str, horizons: dict[str, dict[str, Any]]) -> dict[str, Any]:
    short_term = _combine_effect([(0.45, horizons.get("1")), (0.55, horizons.get("5"))])
    medium_term = _safe_float((horizons.get("5") or {}).get("score_effect"))
    long_term = _safe_float((horizons.get("20") or {}).get("score_effect"))
    overall_effect = _combine_effect(
        [
            (0.22, horizons.get("1")),
            (0.33, horizons.get("5")),
            (0.45, horizons.get("20")),
        ]
    )
    prediction_count = sum(int((entry or {}).get("sample_size") or 0) for entry in horizons.values())
    correct_count = sum(int((entry or {}).get("correct_count") or 0) for entry in horizons.values())
    wrong_count = sum(int((entry or {}).get("wrong_count") or 0) for entry in horizons.values())
    hit_rate = round((correct_count / prediction_count) * 100.0, 2) if prediction_count else 0.0
    label = _alignment_label(overall_effect, prediction_count)

    return {
        "symbol": symbol,
        "prediction_count": prediction_count,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "hit_rate": hit_rate,
        "overall_score_effect": overall_effect,
        "overall_alignment_label": label,
        "overall_note": _alignment_note(label, 5, prediction_count),
        "short_term_effect": round(short_term, 2),
        "short_term_label": _alignment_label(short_term, int(((horizons.get("1") or {}).get("sample_size") or 0) + ((horizons.get("5") or {}).get("sample_size") or 0))),
        "medium_term_effect": round(medium_term, 2),
        "medium_term_label": _alignment_label(medium_term, int((horizons.get("5") or {}).get("sample_size") or 0)),
        "long_term_effect": round(long_term, 2),
        "long_term_label": _alignment_label(long_term, int((horizons.get("20") or {}).get("sample_size") or 0)),
        "horizons": horizons,
    }


def build_bist_prediction_memory(*, force: bool = False) -> dict[str, Any]:
    snapshot_paths = list_bist_snapshot_paths()
    latest_snapshot_date = _latest_snapshot_date(snapshot_paths)
    snapshot_revision = _snapshot_revision(snapshot_paths)

    symbols: dict[str, dict[str, Any]] = {}
    horizons_payload: dict[str, Any] = {}

    for horizon_days in DEFAULT_MEMORY_HORIZONS:
        report = _build_outcome_rows(horizon_days=horizon_days, top_n=20, snapshot_paths=snapshot_paths)
        horizon_key = str(horizon_days)
        if report.get("status") != "ok":
            horizons_payload[horizon_key] = {
                "status": report.get("status"),
                "message": report.get("message"),
            }
            continue

        aligned = report.get("score_aligned_symbols") or []
        misaligned = report.get("score_misaligned_symbols") or []
        horizons_payload[horizon_key] = {
            "status": "ok",
            "prediction_count": len(report.get("correct_predictions") or []) + len(report.get("wrong_predictions") or []),
            "comparison_count": int(report.get("comparison_count") or 0),
            "aligned_count": len(aligned),
            "misaligned_count": len(misaligned),
        }

        for item in report.get("symbol_alignment") or []:
            symbol = str(item.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            bucket = symbols.setdefault(symbol, {"symbol": symbol, "horizons": {}})
            bucket["horizons"][horizon_key] = _compact_horizon_profile(item)

    normalized_symbols = {}
    for symbol, payload in symbols.items():
        horizons = payload.get("horizons") or {}
        normalized_symbols[symbol] = _build_overall_symbol_profile(symbol, horizons)

    memory = {
        "schema_version": PREDICTION_MEMORY_SCHEMA_VERSION,
        "built_at": _utc_now_iso(),
        "latest_snapshot_date": latest_snapshot_date,
        "snapshot_count": len(snapshot_paths),
        "snapshot_revision": snapshot_revision,
        "symbols": normalized_symbols,
        "horizons": horizons_payload,
    }

    PREDICTION_MEMORY_PATH.write_text(json.dumps(memory, ensure_ascii=False, indent=2), encoding="utf-8")
    global _prediction_memory_cache
    _prediction_memory_cache = memory
    return memory


def load_bist_prediction_memory(*, force: bool = False) -> dict[str, Any]:
    global _prediction_memory_cache
    snapshot_paths = list_bist_snapshot_paths()
    latest_snapshot_date = _latest_snapshot_date(snapshot_paths)
    snapshot_count = len(snapshot_paths)
    snapshot_revision = _snapshot_revision(snapshot_paths)

    if not force and _prediction_memory_cache:
        if (
            _prediction_memory_cache.get("latest_snapshot_date") == latest_snapshot_date
            and int(_prediction_memory_cache.get("snapshot_count") or 0) == snapshot_count
            and int(_prediction_memory_cache.get("snapshot_revision") or 0) == snapshot_revision
        ):
            return _prediction_memory_cache

    if not force and PREDICTION_MEMORY_PATH.exists():
        try:
            payload = json.loads(PREDICTION_MEMORY_PATH.read_text(encoding="utf-8"))
            if (
                int(payload.get("schema_version") or 0) == PREDICTION_MEMORY_SCHEMA_VERSION
                and payload.get("latest_snapshot_date") == latest_snapshot_date
                and int(payload.get("snapshot_count") or 0) == snapshot_count
                and int(payload.get("snapshot_revision") or 0) == snapshot_revision
            ):
                _prediction_memory_cache = payload
                return payload
        except Exception:
            pass

    return build_bist_prediction_memory(force=True)


def get_bist_symbol_prediction_profile(symbol: str | None) -> dict[str, Any] | None:
    normalized = str(symbol or "").upper().strip()
    if not normalized:
        return None
    memory = load_bist_prediction_memory()
    return (memory.get("symbols") or {}).get(normalized)
