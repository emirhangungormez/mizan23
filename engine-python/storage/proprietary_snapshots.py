from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any


SNAPSHOT_DIR = Path(__file__).parent.parent / "storage" / "proprietary_snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

LATEST_BIST_SNAPSHOT_PATH = SNAPSHOT_DIR / "latest_bist_snapshot.json"
SNAPSHOT_SCHEMA_VERSION = 3


def _snapshot_path_for_date(snapshot_date: str) -> Path:
    return SNAPSHOT_DIR / f"bist_snapshot_{snapshot_date}.json"


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _snapshot_has_signal_data(payload: dict[str, Any]) -> bool:
    stocks = payload.get("stocks")
    if not isinstance(stocks, list) or not stocks:
        return False
    valid_count = 0
    for stock in stocks:
        if not isinstance(stock, dict):
            continue
        has_scores = any(
            stock.get(field) not in (None, "")
            for field in ("firsat_skoru", "trade_skoru", "uzun_vade_skoru", "radar_skoru")
        )
        signals = stock.get("signals")
        has_signals = isinstance(signals, dict) and any(isinstance(value, dict) for value in signals.values())
        if has_scores or has_signals:
            valid_count += 1
    return valid_count >= max(10, len(stocks) // 20)


def _load_snapshot_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if int(payload.get("schema_version") or 0) < SNAPSHOT_SCHEMA_VERSION:
        return None
    return payload


def _list_snapshot_paths() -> list[Path]:
    return sorted(SNAPSHOT_DIR.glob("bist_snapshot_*.json"), reverse=True)


def _build_summary(stocks: list[dict[str, Any]]) -> dict[str, Any]:
    sorted_by_firsat = sorted(stocks, key=lambda item: _safe_float(item.get("firsat_skoru")), reverse=True)
    sorted_by_hakiki = sorted(
        stocks,
        key=lambda item: _safe_float((item.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
        reverse=True,
    )

    return {
        "stock_count": len(stocks),
        "top_firsatlar": [
            {
                "symbol": stock.get("symbol"),
                "name": stock.get("name"),
                "firsat_skoru": stock.get("firsat_skoru"),
                "action": ((stock.get("signals") or {}).get("firsatlar") or {}).get("action"),
                "hakiki_alfa_pct": ((stock.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
            }
            for stock in sorted_by_firsat[:20]
        ],
        "top_hakiki_alfa": [
            {
                "symbol": stock.get("symbol"),
                "name": stock.get("name"),
                "hakiki_alfa_pct": ((stock.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
                "firsat_skoru": stock.get("firsat_skoru"),
            }
            for stock in sorted_by_hakiki[:20]
        ],
    }


def _build_stock_record(stock: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": stock.get("symbol"),
        "name": stock.get("name"),
        "sector": stock.get("sector"),
        "industry": stock.get("industry"),
        "market_cap": stock.get("market_cap"),
        "website": stock.get("website"),
        "last": stock.get("last"),
        "change_percent": stock.get("change_percent"),
        "volume": stock.get("volume"),
        "dividend_yield": stock.get("dividend_yield"),
        "next_dividend_yield": stock.get("next_dividend_yield"),
        "forward_dividend_yield": stock.get("forward_dividend_yield"),
        "trailing_dividend_yield": stock.get("trailing_dividend_yield"),
        "dividends": stock.get("dividends"),
        "calendar": stock.get("calendar"),
        "next_dividend_date": stock.get("next_dividend_date"),
        "last_dividend_date": stock.get("last_dividend_date"),
        "next_dividend_amount": stock.get("next_dividend_amount"),
        "dividend_event_count": stock.get("dividend_event_count"),
        "dividend_payout_years_60m": stock.get("dividend_payout_years_60m"),
        "dividend_consistency_score": stock.get("dividend_consistency_score"),
        "dividend_status": stock.get("dividend_status"),
        "dividend_status_label": stock.get("dividend_status_label"),
        "trend_score": stock.get("trend_score"),
        "liquidity_score": stock.get("liquidity_score"),
        "quality_score": stock.get("quality_score"),
        "value_support_score": stock.get("value_support_score"),
        "firsat_skoru": stock.get("firsat_skoru"),
        "trade_skoru": stock.get("trade_skoru"),
        "uzun_vade_skoru": stock.get("uzun_vade_skoru"),
        "radar_skoru": stock.get("radar_skoru"),
        "scan_priority_rank": stock.get("scan_priority_rank"),
        "scan_priority_label": stock.get("scan_priority_label"),
        "scan_priority_bucket": stock.get("scan_priority_bucket"),
        "data_status": stock.get("data_status"),
        "data_status_label": stock.get("data_status_label"),
        "has_live_data": stock.get("has_live_data"),
        "has_snapshot_data": stock.get("has_snapshot_data"),
        "is_registered_symbol": stock.get("is_registered_symbol"),
        "hakiki_alfa": stock.get("hakiki_alfa"),
        "hakiki_alfa_pct": ((stock.get("hakiki_alfa") or {}).get("hakiki_alfa_pct")),
        "signals": stock.get("signals"),
        "adil_deger": stock.get("adil_deger"),
        "adil_deger_skoru": stock.get("adil_deger_skoru"),
        "portfolio_action": stock.get("portfolio_action"),
        "portfolio_action_reason": stock.get("portfolio_action_reason"),
        "temettu_guven_skoru": stock.get("temettu_guven_skoru"),
        "temettu_tuzagi_riski": stock.get("temettu_tuzagi_riski"),
        "temettu_takvim_firsati": stock.get("temettu_takvim_firsati"),
        "halka_aciklik_risk_skoru": stock.get("halka_aciklik_risk_skoru"),
        "finansal_dayaniklilik_skoru": stock.get("finansal_dayaniklilik_skoru"),
        "sermaye_disiplini_skoru": stock.get("sermaye_disiplini_skoru"),
        "fair_value_data_band": stock.get("fair_value_data_band"),
        "fair_value_confidence_band": stock.get("fair_value_confidence_band"),
        "prediction_memory": stock.get("prediction_memory"),
        "data_quality": stock.get("data_quality"),
        "global_reference": stock.get("global_reference"),
        "updated_at": stock.get("updated_at"),
    }


def save_bist_proprietary_snapshot(
    *,
    stocks_by_symbol: dict[str, dict[str, Any]],
    global_reference: dict[str, Any],
    captured_at: datetime,
) -> dict[str, Any]:
    snapshot_date = captured_at.date().isoformat()
    snapshot_path = _snapshot_path_for_date(snapshot_date)

    stocks = [_build_stock_record(stock) for stock in stocks_by_symbol.values()]
    stocks.sort(key=lambda item: item.get("symbol") or "")

    payload = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "market": "bist",
        "captured_at": captured_at.isoformat(),
        "snapshot_date": snapshot_date,
        "global_reference": {
            "as_of": global_reference.get("as_of"),
            "daily_return_pct": global_reference.get("daily_return_pct"),
            "total_trillion_usd": global_reference.get("total_trillion_usd"),
            "confidence_score": global_reference.get("confidence_score"),
            "confidence_label": global_reference.get("confidence_label"),
        },
        "summary": _build_summary(stocks),
        "stocks": stocks,
    }

    snapshot_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if _snapshot_has_signal_data(payload):
        LATEST_BIST_SNAPSHOT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "snapshot_date": snapshot_date,
        "path": str(snapshot_path),
        "stock_count": len(stocks),
        "is_valid_signal_snapshot": _snapshot_has_signal_data(payload),
    }


def load_latest_bist_proprietary_snapshot() -> dict[str, Any] | None:
    latest_payload = _load_snapshot_file(LATEST_BIST_SNAPSHOT_PATH)
    if latest_payload and _snapshot_has_signal_data(latest_payload):
        return latest_payload

    for path in _list_snapshot_paths():
        payload = _load_snapshot_file(path)
        if payload and _snapshot_has_signal_data(payload):
            if path != LATEST_BIST_SNAPSHOT_PATH:
                try:
                    LATEST_BIST_SNAPSHOT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                except OSError:
                    pass
            return payload

    return latest_payload
