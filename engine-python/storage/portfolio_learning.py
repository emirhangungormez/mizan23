from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
from statistics import median
from typing import Any

from scoring.formula_registry import get_formula_config
from scoring.probability_engine import derive_probability_action, estimate_probability_fields
from storage.proprietary_snapshots import load_latest_bist_proprietary_snapshot


LEARNING_MEMORY_PATH = Path(__file__).parent / "portfolio_learning_memory.json"
LEARNING_SCHEMA_VERSION = 1
FOLLOW_WINDOW_DAYS = 7
MIN_EVAL_HOURS = 12
DEFAULT_TARGET_PROFILE = "six_month"
TARGET_PROFILE_PRESETS = {
    "intraday": {"label": "Gun Ici", "target_return_pct": 1.0, "min_multiplier": 0.8, "max_multiplier": 1.6},
    "one_month": {"label": "1 Ay", "target_return_pct": 5.0, "min_multiplier": 0.75, "max_multiplier": 1.55},
    "six_month": {"label": "6 Ay", "target_return_pct": 15.0, "min_multiplier": 0.7, "max_multiplier": 1.6},
    "one_year": {"label": "1 Yil", "target_return_pct": 45.0, "min_multiplier": 0.65, "max_multiplier": 1.7},
    "custom": {"label": "Ozel", "target_return_pct": 10.0, "min_multiplier": 0.75, "max_multiplier": 1.5},
}


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _parse_iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        normalized = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _load_learning_memory() -> dict[str, Any]:
    if not LEARNING_MEMORY_PATH.exists():
        return {
            "schema_version": LEARNING_SCHEMA_VERSION,
            "portfolios": {},
        }
    try:
        payload = json.loads(LEARNING_MEMORY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        payload = {}
    if int(payload.get("schema_version") or 0) != LEARNING_SCHEMA_VERSION:
        return {
            "schema_version": LEARNING_SCHEMA_VERSION,
            "portfolios": {},
        }
    payload.setdefault("portfolios", {})
    return payload


def _save_learning_memory(payload: dict[str, Any]) -> None:
    LEARNING_MEMORY_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _wilson_interval_pct(successes: int, total: int, z: float = 1.96) -> dict[str, float]:
    if total <= 0:
        return {"lower": 0.0, "upper": 0.0}

    phat = successes / total
    denominator = 1.0 + (z * z) / total
    center = (phat + (z * z) / (2 * total)) / denominator
    margin = (z / denominator) * math.sqrt((phat * (1.0 - phat) / total) + ((z * z) / (4 * total * total)))
    return {
        "lower": round(max(0.0, (center - margin) * 100.0), 2),
        "upper": round(min(100.0, (center + margin) * 100.0), 2),
    }


def _safe_div(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _snapshot_lookup() -> dict[str, dict[str, Any]]:
    snapshot = load_latest_bist_proprietary_snapshot() or {}
    records = snapshot.get("stocks") or []
    return {
        str(item.get("symbol") or "").upper(): item
        for item in records
        if item.get("symbol")
    }


def _resolve_target_mode(asset: dict[str, Any]) -> str:
    mode = str(asset.get("target_mode") or "").lower()
    if mode in {"system", "manual"}:
        return mode
    if str(asset.get("target_profile") or "").lower() == "custom" and _safe_float(asset.get("target_return_pct")) > 0:
        return "manual"
    return "system"


def _recommended_target_return_pct(
    *,
    profile: str,
    firsat_score: float,
    trade_score: float,
    long_score: float,
    radar_score: float,
    hakiki_alfa_pct: float,
    snapshot_available: bool,
) -> float:
    preset = TARGET_PROFILE_PRESETS.get(profile) or TARGET_PROFILE_PRESETS[DEFAULT_TARGET_PROFILE]
    base = _safe_float(preset.get("target_return_pct")) or 10.0
    if not snapshot_available:
        return round(base, 2)

    score_mix = (trade_score * 0.4) + (long_score * 0.35) + (firsat_score * 0.15) + (radar_score * 0.1)
    strength = (score_mix - 50.0) / 50.0
    alpha_boost = _clamp(hakiki_alfa_pct / 12.0, -0.2, 0.2)
    multiplier = _clamp(
        1.0 + (strength * 0.35) + alpha_boost,
        _safe_float(preset.get("min_multiplier")) or 0.75,
        _safe_float(preset.get("max_multiplier")) or 1.5,
    )
    return round(base * multiplier, 2)


def _target_profile_horizon_days(profile: str) -> int:
    mapping = {
        "intraday": 1,
        "one_month": 30,
        "six_month": 180,
        "one_year": 365,
        "custom": 30,
    }
    return int(mapping.get(profile, 30))


def _portfolio_signal_confidence(*, snapshot_available: bool, target_mode: str, target_profile: str) -> float:
    base = 74.0 if snapshot_available else 48.0
    if target_mode == "manual":
        base -= 6.0
    if target_profile == "one_year":
        base += 4.0
    elif target_profile == "intraday":
        base -= 3.0
    return _clamp(base, 35.0, 92.0)


def _resolve_target_plan(asset: dict[str, Any]) -> tuple[str, str, str, float]:
    profile = str(asset.get("target_profile") or DEFAULT_TARGET_PROFILE)
    preset = TARGET_PROFILE_PRESETS.get(profile) or TARGET_PROFILE_PRESETS[DEFAULT_TARGET_PROFILE]
    mode = _resolve_target_mode(asset)
    manual_target_return_pct = _safe_float(asset.get("target_return_pct"))
    return (profile, str(preset.get("label") or "Hedef"), mode, manual_target_return_pct)


def _conviction_score(
    *,
    firsat_score: float,
    trade_score: float,
    long_score: float,
    radar_score: float,
    hakiki_alfa_pct: float,
    pnl_pct: float,
    snapshot_available: bool,
) -> float:
    if snapshot_available:
        firsat_base = firsat_score
        trade_base = trade_score
        long_base = long_score
        radar_base = radar_score
    else:
        firsat_base = 50.0
        trade_base = 50.0
        long_base = 50.0
        radar_base = 50.0

    alpha_score = _clamp(50.0 + (hakiki_alfa_pct * 8.0), 0.0, 100.0)
    pnl_support = _clamp(50.0 + (pnl_pct * 1.2), 0.0, 100.0)
    return (
        (trade_base * 0.31)
        + (long_base * 0.26)
        + (firsat_base * 0.18)
        + (radar_base * 0.10)
        + (alpha_score * 0.10)
        + (pnl_support * 0.05)
    )


def _holding_action(
    *,
    pnl_pct: float,
    trade_score: float,
    long_score: float,
    hakiki_alfa_pct: float,
    probability_positive: float,
    expected_excess_return_pct: float,
    calibration_confidence: float,
) -> tuple[str, str, str]:
    if pnl_pct <= -12 and probability_positive < 0.40 and expected_excess_return_pct < 0:
        return ("Kesin Sat", "kritik", "Zarar derin ve skor destegi zayifliyor.")
    if pnl_pct <= -6 and probability_positive <= 0.45 and expected_excess_return_pct <= 0:
        return ("Sat", "uyari", "Pozisyon baski altinda; risk azaltmak mantikli.")
    if probability_positive >= 0.62 and expected_excess_return_pct > 0:
        return ("Tut", "olasilik_guclu", "Olasilik yapisi ve beklenen alfa pozisyonu tasimayi destekliyor.")
    if pnl_pct >= 18 and trade_score < 42 and hakiki_alfa_pct < 0:
        return ("Sat", "kar_realizasyonu", "Kar var ama skorlar zayifliyor; realize etmek dusunulebilir.")
    if calibration_confidence < 45 and pnl_pct < 0:
        return ("Tut", "dusuk_guven", "Model guveni dusuk; pozisyon teyitle izlenmeli.")
    if long_score >= 58 or trade_score >= 55 or hakiki_alfa_pct >= 1:
        return ("Tut", "iyi_konumda", "Skor yapisi pozisyonu tasimayi destekliyor.")
    return ("Tut", "notr", "Belirgin satis baskisi yok; izleyerek elde tutulabilir.")


def _entry_signal(
    *,
    firsat_score: float,
    trade_score: float,
    long_score: float,
    hakiki_alfa_pct: float,
    snapshot_available: bool,
) -> tuple[str, str]:
    if not snapshot_available:
        return ("Bekle", "Skor verisi sinirli; yeni ekleme icin daha fazla teyit beklenmeli.")
    composite = (firsat_score * 0.35) + (trade_score * 0.35) + (long_score * 0.2) + max(min(hakiki_alfa_pct * 4, 20), -20) + 10
    if composite >= 68:
        return ("Sepete Eklenebilir", "Skor dengesi guclu; yeni ekleme icin olumlu alan var.")
    if composite <= 40:
        return ("Uzak Dur", "Skor dengesi zayif; yeni giris icin sabir daha iyi olabilir.")
    return ("Bekle", "Karmasik sinyal var; yeni ekleme icin daha iyi seviye beklenebilir.")


def _target_action(
    *,
    pnl_pct: float,
    target_return_pct: float,
    conviction_score: float,
    trade_score: float,
    long_score: float,
    hakiki_alfa_pct: float,
    probability_positive: float,
    probability_outperform: float,
    expected_excess_return_pct: float,
    risk_forecast_pct: float,
    calibration_confidence: float,
) -> tuple[str, str, str]:
    progress_pct = (pnl_pct / target_return_pct) * 100.0 if target_return_pct > 0 else 0.0

    if pnl_pct >= target_return_pct:
        if probability_positive >= 0.64 and probability_outperform >= 0.60 and expected_excess_return_pct > 0:
            return (
                "Tasi, Hedefi Guncelle",
                "hedef_asildi_guclu",
                "Hedef doldu ama olasilik yapisi guclu; hedef guncellenerek tasinabilir.",
            )
        return ("Kar Al", "hedefe_ulasti", "Pozisyon planlanan hedefe ulasti; disiplinli kar alma zamani.")

    if progress_pct >= 80:
        if probability_positive < 0.55 or expected_excess_return_pct <= 0:
            return (
                "Kademeli Kar Al",
                "hedefe_yakin_zayifliyor",
                "Hedefe yaklasildi ancak ivme zayif; parcali kar alma daha saglikli olabilir.",
            )
        return ("Hedefe Kadar Tut", "hedefe_yakin", "Hedef alani gorunuyor; skorlar bozulmadikca pozisyon korunabilir.")

    if pnl_pct <= -8 and probability_positive <= 0.42 and risk_forecast_pct >= 8:
        return ("Zarari Kes", "asagi_risk_yuksek", "Skor ve fiyat birlikte zayifliyor; zarar kes disiplini gerekli.")

    if probability_positive >= 0.62 and expected_excess_return_pct > 0:
        return ("Hedefe Kadar Tut", "konviksiyon_guclu", "Skor yapisi hedefe ilerleme olasiligini destekliyor.")

    if probability_positive >= 0.55 or calibration_confidence < 45:
        return ("Izle", "teyit_bekleniyor", "Pozisyon yasiyor ancak hedefe yuruyus icin ek teyit gerekiyor.")

    return ("Risk Azalt", "hedef_zayif", "Skor gucu hedefe tasimak icin yetersiz; agirligi azaltmak dusunulebilir.")


def _build_position_card(
    *,
    asset: dict[str, Any],
    quote: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    avg_price = _safe_float(asset.get("avg_price") or asset.get("avgPrice"))
    current_price = _safe_float((quote or {}).get("last")) or avg_price
    quantity = _safe_float(asset.get("quantity")) or 0.0
    current_value = current_price * quantity
    cost_basis = avg_price * quantity
    pnl = current_value - cost_basis
    pnl_pct = ((current_price / avg_price) - 1.0) * 100.0 if avg_price > 0 else 0.0

    snap = snapshot or {}
    snapshot_available = bool(snap)
    firsat = _safe_float(snap.get("firsat_skoru")) if snapshot_available else 50.0
    trade = _safe_float(snap.get("trade_skoru")) if snapshot_available else 50.0
    long_score = _safe_float(snap.get("uzun_vade_skoru")) if snapshot_available else 50.0
    radar = _safe_float(snap.get("radar_skoru")) if snapshot_available else 50.0
    hakiki_alfa_pct = _safe_float((snap.get("hakiki_alfa") or {}).get("hakiki_alfa_pct"))
    target_profile, target_profile_label, target_mode, manual_target_return_pct = _resolve_target_plan(asset)
    system_target_return_pct = _recommended_target_return_pct(
        profile=target_profile,
        firsat_score=firsat,
        trade_score=trade,
        long_score=long_score,
        radar_score=radar,
        hakiki_alfa_pct=hakiki_alfa_pct,
        snapshot_available=snapshot_available,
    )
    target_return_pct = manual_target_return_pct if target_mode == "manual" and manual_target_return_pct > 0 else system_target_return_pct
    target_price = avg_price * (1.0 + (target_return_pct / 100.0)) if avg_price > 0 else 0.0
    system_target_price = avg_price * (1.0 + (system_target_return_pct / 100.0)) if avg_price > 0 else 0.0
    distance_to_target_pct = target_return_pct - pnl_pct
    target_progress_pct = (pnl_pct / target_return_pct) * 100.0 if target_return_pct > 0 else 0.0
    target_warning = None
    target_source_label = "Sistem"
    if target_mode == "manual" and manual_target_return_pct > 0:
        target_source_label = "Manuel"
        target_warning = (
            f"Manuel hedef aktif; sistem bu profil icin %{system_target_return_pct:.1f} oneriyor."
        )
    conviction_score = _conviction_score(
        firsat_score=firsat,
        trade_score=trade,
        long_score=long_score,
        radar_score=radar,
        hakiki_alfa_pct=hakiki_alfa_pct,
        pnl_pct=pnl_pct,
        snapshot_available=snapshot_available,
    )
    formula_config = get_formula_config("portfolio", "conviction_score")
    signal_confidence = _portfolio_signal_confidence(
        snapshot_available=snapshot_available,
        target_mode=target_mode,
        target_profile=target_profile,
    )
    probability_fields = estimate_probability_fields(
        market="portfolio",
        signal_id="conviction_score",
        score=conviction_score,
        confidence=signal_confidence,
        horizon_days=_target_profile_horizon_days(target_profile),
        return_bias_pct=hakiki_alfa_pct,
        excess_bias_pct=hakiki_alfa_pct,
        volatility_pct=abs(_safe_float((quote or {}).get("change_percent"))) * 2.2,
    )

    holding_action, status, action_reason = _holding_action(
        pnl_pct=pnl_pct,
        trade_score=trade,
        long_score=long_score,
        hakiki_alfa_pct=hakiki_alfa_pct,
        probability_positive=_safe_float(probability_fields.get("probability_positive")),
        expected_excess_return_pct=_safe_float(probability_fields.get("expected_excess_return_pct")),
        calibration_confidence=_safe_float(probability_fields.get("calibration_confidence")),
    )
    target_action, target_status, target_action_reason = _target_action(
        pnl_pct=pnl_pct,
        target_return_pct=target_return_pct,
        conviction_score=conviction_score,
        trade_score=trade,
        long_score=long_score,
        hakiki_alfa_pct=hakiki_alfa_pct,
        probability_positive=_safe_float(probability_fields.get("probability_positive")),
        probability_outperform=_safe_float(probability_fields.get("probability_outperform")),
        expected_excess_return_pct=_safe_float(probability_fields.get("expected_excess_return_pct")),
        risk_forecast_pct=_safe_float(probability_fields.get("risk_forecast_pct")),
        calibration_confidence=_safe_float(probability_fields.get("calibration_confidence")),
    )
    probability_action = derive_probability_action(
        market="portfolio",
        signal_id="conviction_score",
        probability_positive=_safe_float(probability_fields.get("probability_positive")),
        expected_excess_return_pct=_safe_float(probability_fields.get("expected_excess_return_pct")),
        default_action=target_action,
        default_horizon=str(probability_fields.get("horizon_label") or target_profile_label),
    )
    entry_signal, entry_reason = _entry_signal(
        firsat_score=firsat,
        trade_score=trade,
        long_score=long_score,
        hakiki_alfa_pct=hakiki_alfa_pct,
        snapshot_available=snapshot_available,
    )
    if not snapshot_available:
        target_system_reason = "Skor verisi sinirli oldugu icin baz profil hedefi kullanildi."
    elif system_target_return_pct > (_safe_float(TARGET_PROFILE_PRESETS.get(target_profile, {}).get("target_return_pct")) or system_target_return_pct):
        target_system_reason = "Skor yapisi guclu oldugu icin sistem baz hedefin ustune cikti."
    elif system_target_return_pct < (_safe_float(TARGET_PROFILE_PRESETS.get(target_profile, {}).get("target_return_pct")) or system_target_return_pct):
        target_system_reason = "Skor dengesi daha temkinli oldugu icin sistem hedefi baz seviyenin altina cekti."
    else:
        target_system_reason = "Skor dengesi baz profil hedefiyle uyumlu gorunuyor."
    if _safe_float(probability_fields.get("probability_positive")) >= 0.62 and _safe_float(probability_fields.get("expected_excess_return_pct")) > 0:
        target_system_reason += " Olasilik katmani da hedefi destekliyor."
    elif _safe_float(probability_fields.get("probability_positive")) <= 0.45:
        target_system_reason += " Olasilik katmani temkinli durmayi oneriyor."

    purchase_date = _parse_iso(asset.get("purchase_date"))
    holding_days = (now - purchase_date).days if purchase_date else None

    return {
        "symbol": asset.get("symbol"),
        "name": asset.get("name") or asset.get("symbol"),
        "quantity": quantity,
        "avg_price": round(avg_price, 4),
        "current_price": round(current_price, 4),
        "current_value": round(current_value, 2),
        "cost_basis": round(cost_basis, 2),
        "pnl": round(pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "holding_days": holding_days,
        "status": status,
        "holding_action": holding_action,
        "holding_action_reason": action_reason,
        "entry_signal": entry_signal,
        "entry_signal_reason": entry_reason,
        "target_profile": target_profile,
        "target_mode": target_mode,
        "target_source_label": target_source_label,
        "target_profile_label": target_profile_label,
        "target_return_pct": round(target_return_pct, 2),
        "system_target_return_pct": round(system_target_return_pct, 2),
        "target_price": round(target_price, 4),
        "system_target_price": round(system_target_price, 4),
        "distance_to_target_pct": round(distance_to_target_pct, 2),
        "target_progress_pct": round(target_progress_pct, 2),
        "target_status": target_status,
        "target_action": target_action,
        "target_action_reason": target_action_reason,
        "target_warning": target_warning,
        "target_system_reason": target_system_reason,
        "conviction_score": round(conviction_score, 2),
        "probability_positive": probability_fields.get("probability_positive"),
        "probability_outperform": probability_fields.get("probability_outperform"),
        "expected_return_pct": probability_fields.get("expected_return_pct"),
        "expected_excess_return_pct": probability_fields.get("expected_excess_return_pct"),
        "risk_forecast_pct": probability_fields.get("risk_forecast_pct"),
        "calibration_confidence": probability_fields.get("calibration_confidence"),
        "signal_version": probability_fields.get("signal_version"),
        "calibration_version": probability_fields.get("calibration_version"),
        "decision_band": probability_action.get("decision_band"),
        "probability_horizon_label": probability_fields.get("horizon_label") or formula_config.get("horizon_label"),
        "probability_horizon_days": probability_fields.get("horizon_days") or formula_config.get("horizon_days"),
        "probability_action": probability_action.get("action"),
        "firsat_skoru": round(firsat, 2),
        "trade_skoru": round(trade, 2),
        "uzun_vade_skoru": round(long_score, 2),
        "radar_skoru": round(radar, 2),
        "hakiki_alfa_pct": round(hakiki_alfa_pct, 2),
        "quote_change_percent": _safe_float((quote or {}).get("change_percent")),
        "currency": (quote or {}).get("currency") or asset.get("currency") or "TRY",
        "captured_at": now.isoformat(),
    }


def _upsert_journal_entries(portfolio_id: str, decisions: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    memory = _load_learning_memory()
    portfolio_entries = list(memory["portfolios"].get(portfolio_id) or [])
    by_symbol: dict[str, list[dict[str, Any]]] = {}
    for entry in portfolio_entries:
        by_symbol.setdefault(str(entry.get("symbol") or "").upper(), []).append(entry)

    for decision in decisions:
        symbol = str(decision.get("symbol") or "").upper()
        existing = sorted(
            by_symbol.get(symbol) or [],
            key=lambda item: item.get("captured_at") or "",
            reverse=True,
        )
        latest = existing[0] if existing else None
        latest_at = _parse_iso((latest or {}).get("captured_at"))
        should_skip = (
            latest is not None
            and latest.get("holding_action") == decision.get("holding_action")
            and latest.get("target_action") == decision.get("target_action")
            and latest.get("entry_signal") == decision.get("entry_signal")
            and abs(_safe_float(latest.get("target_return_pct")) - _safe_float(decision.get("target_return_pct"))) <= 0.01
            and abs(_safe_float(latest.get("current_price")) - _safe_float(decision.get("current_price"))) <= 0.01
            and latest_at is not None
            and latest_at >= (now - timedelta(hours=12))
        )
        if should_skip:
            continue

        entry = {
            "symbol": decision.get("symbol"),
            "name": decision.get("name"),
            "captured_at": decision.get("captured_at"),
            "holding_action": decision.get("holding_action"),
            "target_action": decision.get("target_action"),
            "entry_signal": decision.get("entry_signal"),
            "current_price": decision.get("current_price"),
            "pnl_pct": decision.get("pnl_pct"),
            "target_profile": decision.get("target_profile"),
            "target_return_pct": decision.get("target_return_pct"),
            "probability_positive": decision.get("probability_positive"),
            "probability_outperform": decision.get("probability_outperform"),
            "expected_return_pct": decision.get("expected_return_pct"),
            "expected_excess_return_pct": decision.get("expected_excess_return_pct"),
            "risk_forecast_pct": decision.get("risk_forecast_pct"),
            "calibration_confidence": decision.get("calibration_confidence"),
            "decision_band": decision.get("decision_band"),
            "firsat_skoru": decision.get("firsat_skoru"),
            "trade_skoru": decision.get("trade_skoru"),
            "uzun_vade_skoru": decision.get("uzun_vade_skoru"),
            "hakiki_alfa_pct": decision.get("hakiki_alfa_pct"),
        }
        portfolio_entries.append(entry)
        by_symbol.setdefault(symbol, []).append(entry)

    portfolio_entries = sorted(
        portfolio_entries,
        key=lambda item: item.get("captured_at") or "",
    )[-500:]
    memory["portfolios"][portfolio_id] = portfolio_entries
    _save_learning_memory(memory)
    return portfolio_entries


def _match_followed_entries(
    *,
    journal_entries: list[dict[str, Any]],
    transactions: list[dict[str, Any]],
    position_map: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    buy_transactions = sorted(
        [
            tx for tx in transactions
            if str(tx.get("type") or "").lower() == "buy" and tx.get("symbol") and tx.get("date")
        ],
        key=lambda item: item.get("date") or "",
    )
    followed: list[dict[str, Any]] = []

    for tx in buy_transactions:
        tx_time = _parse_iso(tx.get("date"))
        if tx_time is None:
            continue
        symbol = str(tx.get("symbol") or "").upper()
        candidates = [
            entry for entry in journal_entries
            if str(entry.get("symbol") or "").upper() == symbol
            and entry.get("entry_signal") == "Sepete Eklenebilir"
            and _parse_iso(entry.get("captured_at")) is not None
        ]
        candidates.sort(key=lambda item: item.get("captured_at") or "", reverse=True)
        picked = None
        for entry in candidates:
            entry_time = _parse_iso(entry.get("captured_at"))
            if entry_time and entry_time <= tx_time and entry_time >= (tx_time - timedelta(days=FOLLOW_WINDOW_DAYS)):
                picked = entry
                break
        if not picked:
            continue

        current_position = position_map.get(symbol)
        realized_pct = _safe_float(tx.get("realized_profit_loss_pct") or tx.get("profit_loss_pct"))
        open_pct = _safe_float((current_position or {}).get("pnl_pct"))
        current_outcome_pct = open_pct if current_position else realized_pct
        followed.append(
            {
                "symbol": symbol,
                "buy_date": tx.get("date"),
                "recommendation_at": picked.get("captured_at"),
                "entry_signal": picked.get("entry_signal"),
                "quantity": _safe_float(tx.get("quantity")),
                "buy_price": _safe_float(tx.get("price")),
                "current_outcome_pct": round(current_outcome_pct, 2),
                "profitable_now": current_outcome_pct >= 0,
            }
        )

    total = len(followed)
    wins = sum(1 for item in followed if item.get("profitable_now"))
    avg_return = round(sum(_safe_float(item.get("current_outcome_pct")) for item in followed) / total, 2) if total else 0.0
    return followed, {
        "followed_recommendations": total,
        "profitable_followed_recommendations": wins,
        "losing_followed_recommendations": total - wins,
        "followed_win_rate": round((wins / total) * 100.0, 2) if total else 0.0,
        "avg_followed_return_pct": avg_return,
    }


def _build_action_learning_summary(
    journal_entries: list[dict[str, Any]],
    position_map: dict[str, dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    action_stats: dict[str, dict[str, float]] = {}
    evaluated_count = 0

    for entry in journal_entries:
        captured_at = _parse_iso(entry.get("captured_at"))
        if captured_at is None or captured_at >= (now - timedelta(hours=MIN_EVAL_HOURS)):
            continue
        symbol = str(entry.get("symbol") or "").upper()
        current_position = position_map.get(symbol)
        if not current_position:
            continue
        current_price = _safe_float(current_position.get("current_price"))
        entry_price = _safe_float(entry.get("current_price"))
        if current_price <= 0 or entry_price <= 0:
            continue
        future_return_pct = ((current_price / entry_price) - 1.0) * 100.0
        action = str(entry.get("target_action") or entry.get("holding_action") or "Tut")
        bucket = action_stats.setdefault(action, {"count": 0.0, "wins": 0.0, "return_sum": 0.0})
        bucket["count"] += 1
        bucket["return_sum"] += future_return_pct
        if (
            action in {"Tut", "Hedefe Kadar Tut", "Izle", "Tasi, Hedefi Guncelle"}
            and future_return_pct >= 0
        ) or (
            action in {"Sat", "Kesin Sat", "Kar Al", "Kademeli Kar Al", "Zarari Kes", "Risk Azalt"}
            and future_return_pct <= 0
        ):
            bucket["wins"] += 1
        evaluated_count += 1

    action_summary = {}
    for action, bucket in action_stats.items():
        count = int(bucket["count"])
        action_summary[action] = {
            "count": count,
            "win_rate": round((bucket["wins"] / count) * 100.0, 2) if count else 0.0,
            "avg_return_after_signal_pct": round(bucket["return_sum"] / count, 2) if count else 0.0,
        }

    lessons: list[str] = []
    tut = action_summary.get("Hedefe Kadar Tut") or action_summary.get("Tut")
    kar_al = action_summary.get("Kar Al")
    zarar_kes = action_summary.get("Zarari Kes")
    if tut and tut["count"] >= 3:
        lessons.append(f"Tasima sinyali {tut['count']} kayitta %{tut['win_rate']} isabet uretmis.")
    if kar_al and kar_al["count"] >= 3:
        lessons.append(f"Kar al sinyali sonraki harekette ortalama %{kar_al['avg_return_after_signal_pct']:.2f} fark yaratmis.")
    if zarar_kes and zarar_kes["count"] >= 2:
        lessons.append(f"Zarar kes uyarilari %{zarar_kes['win_rate']} isabetle calismis.")

    return {
        "evaluated_recommendations": evaluated_count,
        "actions": action_summary,
        "lessons": lessons,
    }


def _latest_entry_before(
    *,
    journal_entries: list[dict[str, Any]],
    symbol: str,
    reference_time: datetime | None,
    max_age_days: int | None = None,
) -> dict[str, Any] | None:
    if reference_time is None:
        return None

    normalized = str(symbol or "").upper().strip()
    matches = []
    for entry in journal_entries:
        if str(entry.get("symbol") or "").upper().strip() != normalized:
            continue
        captured_at = _parse_iso(entry.get("captured_at"))
        if captured_at is None or captured_at > reference_time:
            continue
        if max_age_days is not None and captured_at < (reference_time - timedelta(days=max_age_days)):
            continue
        matches.append((captured_at, entry))

    if not matches:
        return None

    matches.sort(key=lambda item: item[0], reverse=True)
    return matches[0][1]


def _is_positive_entry_signal(signal: str) -> bool:
    return signal in {"Sepete Eklenebilir"}


def _is_sell_like_action(action: str) -> bool:
    return action in {"Sat", "Kesin Sat", "Kar Al", "Kademeli Kar Al", "Zarari Kes", "Risk Azalt"}


def _is_hold_like_action(action: str) -> bool:
    return action in {"Tut", "Hedefe Kadar Tut", "Izle", "Tasi, Hedefi Guncelle"}


def _build_portfolio_report(
    *,
    portfolio_name: str,
    journal_entries: list[dict[str, Any]],
    transactions: list[dict[str, Any]],
) -> dict[str, Any]:
    closed_trades: list[dict[str, Any]] = []

    sell_transactions = sorted(
        [
            tx for tx in transactions
            if str(tx.get("type") or "").lower() == "sell" and tx.get("symbol") and (tx.get("sell_date") or tx.get("date"))
        ],
        key=lambda item: item.get("sell_date") or item.get("date") or "",
    )

    for tx in sell_transactions:
        symbol = str(tx.get("symbol") or "").upper().strip()
        buy_date = _parse_iso(tx.get("buy_date") or tx.get("date"))
        sell_date = _parse_iso(tx.get("sell_date") or tx.get("date"))
        buy_price = _safe_float(tx.get("buy_price") or tx.get("price"))
        sell_price = _safe_float(tx.get("sell_price") or tx.get("price"))
        quantity = _safe_float(tx.get("quantity"))
        if not symbol or sell_date is None or buy_price <= 0 or sell_price <= 0 or quantity <= 0:
            continue

        realized_pnl = _safe_float(tx.get("realized_profit_loss") or tx.get("profit_loss"))
        realized_pct = _safe_float(tx.get("realized_profit_loss_pct") or tx.get("profit_loss_pct"))
        if realized_pnl == 0.0 and buy_price > 0 and sell_price > 0:
            realized_pnl = (sell_price - buy_price) * quantity
        if realized_pct == 0.0 and buy_price > 0 and sell_price > 0:
            realized_pct = ((sell_price / buy_price) - 1.0) * 100.0

        holding_days = (sell_date - buy_date).days if buy_date else None

        entry_signal = _latest_entry_before(
            journal_entries=journal_entries,
            symbol=symbol,
            reference_time=buy_date or sell_date,
            max_age_days=FOLLOW_WINDOW_DAYS,
        )
        exit_signal = _latest_entry_before(
            journal_entries=journal_entries,
            symbol=symbol,
            reference_time=sell_date,
            max_age_days=30,
        )

        entry_signal_name = str((entry_signal or {}).get("entry_signal") or "")
        entry_signal_price = _safe_float((entry_signal or {}).get("current_price"))
        entry_probability_positive = _safe_float((entry_signal or {}).get("probability_positive"))
        entry_probability_outperform = _safe_float((entry_signal or {}).get("probability_outperform"))
        entry_expected_return_pct = _safe_float((entry_signal or {}).get("expected_return_pct"))
        entry_expected_excess_return_pct = _safe_float((entry_signal or {}).get("expected_excess_return_pct"))
        entry_decision_band = str((entry_signal or {}).get("decision_band") or "")
        entry_model_alignment = None
        if entry_signal_name:
            if _is_positive_entry_signal(entry_signal_name):
                entry_model_alignment = realized_pct >= 0
            else:
                entry_model_alignment = realized_pct <= 0

        exit_action_name = str((exit_signal or {}).get("target_action") or (exit_signal or {}).get("holding_action") or "")
        exit_signal_price = _safe_float((exit_signal or {}).get("current_price"))
        exit_probability_positive = _safe_float((exit_signal or {}).get("probability_positive"))
        exit_expected_return_pct = _safe_float((exit_signal or {}).get("expected_return_pct"))
        exit_move_pct = ((sell_price / exit_signal_price) - 1.0) * 100.0 if exit_signal_price > 0 else 0.0
        exit_model_alignment = None
        if exit_action_name:
            if _is_sell_like_action(exit_action_name):
                exit_model_alignment = exit_move_pct <= 0
            elif _is_hold_like_action(exit_action_name):
                exit_model_alignment = exit_move_pct >= 0

        closed_trades.append(
            {
                "symbol": symbol,
                "name": tx.get("asset_name"),
                "quantity": round(quantity, 4),
                "buy_date": buy_date.isoformat() if buy_date else None,
                "sell_date": sell_date.isoformat(),
                "buy_price": round(buy_price, 4),
                "sell_price": round(sell_price, 4),
                "holding_days": holding_days,
                "realized_pnl": round(realized_pnl, 2),
                "realized_return_pct": round(realized_pct, 2),
                "entry_signal": entry_signal_name or None,
                "entry_signal_at": (entry_signal or {}).get("captured_at"),
                "entry_signal_price": round(entry_signal_price, 4) if entry_signal_price > 0 else None,
                "entry_signal_alignment": entry_model_alignment,
                "entry_probability_positive": round(entry_probability_positive, 4) if entry_probability_positive else None,
                "entry_probability_outperform": round(entry_probability_outperform, 4) if entry_probability_outperform else None,
                "entry_expected_return_pct": round(entry_expected_return_pct, 2) if entry_expected_return_pct else None,
                "entry_expected_excess_return_pct": round(entry_expected_excess_return_pct, 2) if entry_expected_excess_return_pct else None,
                "entry_decision_band": entry_decision_band or None,
                "exit_action": exit_action_name or None,
                "exit_signal_at": (exit_signal or {}).get("captured_at"),
                "exit_signal_price": round(exit_signal_price, 4) if exit_signal_price > 0 else None,
                "exit_move_pct": round(exit_move_pct, 2) if exit_signal_price > 0 else None,
                "exit_signal_alignment": exit_model_alignment,
                "exit_probability_positive": round(exit_probability_positive, 4) if exit_probability_positive else None,
                "exit_expected_return_pct": round(exit_expected_return_pct, 2) if exit_expected_return_pct else None,
                "realized_vs_expected_return_pct": round(realized_pct - entry_expected_return_pct, 2) if entry_expected_return_pct else None,
            }
        )

    returns = [_safe_float(item.get("realized_return_pct")) for item in closed_trades]
    winners = [value for value in returns if value > 0]
    losers = [value for value in returns if value < 0]
    total = len(closed_trades)
    win_count = len(winners)
    win_rate = round((_safe_div(win_count, total)) * 100.0, 2) if total else 0.0
    gross_profit = sum(value for value in winners)
    gross_loss = abs(sum(value for value in losers))
    avg_win = round(sum(winners) / len(winners), 2) if winners else 0.0
    avg_loss = round(sum(losers) / len(losers), 2) if losers else 0.0
    expectancy_pct = round((_safe_div(win_count, total) * avg_win) + ((_safe_div(total - win_count, total)) * avg_loss), 2) if total else 0.0

    entry_evaluated = [item for item in closed_trades if item.get("entry_signal_alignment") is not None]
    entry_followed = [item for item in closed_trades if item.get("entry_signal") == "Sepete Eklenebilir"]
    entry_successes = sum(1 for item in entry_evaluated if bool(item.get("entry_signal_alignment")))

    exit_evaluated = [item for item in closed_trades if item.get("exit_signal_alignment") is not None]
    exit_successes = sum(1 for item in exit_evaluated if bool(item.get("exit_signal_alignment")))
    entry_probability_rows = [item for item in closed_trades if item.get("entry_probability_positive") is not None]
    exit_probability_rows = [item for item in closed_trades if item.get("exit_probability_positive") is not None]
    expected_return_rows = [item for item in closed_trades if item.get("entry_expected_return_pct") is not None]
    signal_bucket_summary: dict[str, dict[str, float]] = {}
    probability_brier_sum = 0.0
    for item in entry_probability_rows:
        band = str(item.get("entry_decision_band") or "notr")
        bucket = signal_bucket_summary.setdefault(band, {"count": 0.0, "wins": 0.0, "return_sum": 0.0})
        bucket["count"] += 1
        bucket["return_sum"] += _safe_float(item.get("realized_return_pct"))
        if _safe_float(item.get("realized_return_pct")) >= 0:
            bucket["wins"] += 1
        actual = 1.0 if _safe_float(item.get("realized_return_pct")) >= 0 else 0.0
        probability_brier_sum += (_safe_float(item.get("entry_probability_positive")) - actual) ** 2

    average_holding_days = round(sum((_safe_float(item.get("holding_days")) for item in closed_trades)) / total, 1) if total else 0.0
    median_holding_days = median([int(item.get("holding_days") or 0) for item in closed_trades]) if total else 0
    signal_bucket_payload = {
        bucket: {
            "count": int(values["count"]),
            "win_rate": round((_safe_div(values["wins"], values["count"])) * 100.0, 2) if values["count"] else 0.0,
            "avg_realized_return_pct": round(values["return_sum"] / values["count"], 2) if values["count"] else 0.0,
        }
        for bucket, values in signal_bucket_summary.items()
    }

    lessons: list[str] = []
    if total >= 3:
        lessons.append(f"{portfolio_name} icin kapanmis {total} islemde genel kazanma orani %{win_rate:.1f}.")
    if entry_followed:
        followed_wins = sum(1 for item in entry_followed if _safe_float(item.get("realized_return_pct")) > 0)
        followed_rate = round((_safe_div(followed_wins, len(entry_followed))) * 100.0, 2)
        lessons.append(f"Sistem onayiyla acilan {len(entry_followed)} islemde kazanma orani %{followed_rate:.1f}.")
    if exit_evaluated:
        lessons.append(f"Cikis sinyalleri {len(exit_evaluated)} kapanmis islemde %{round((_safe_div(exit_successes, len(exit_evaluated))) * 100.0, 2):.1f} uyum verdi.")
    if expected_return_rows:
        avg_gap = round(sum(_safe_float(item.get("realized_vs_expected_return_pct")) for item in expected_return_rows) / len(expected_return_rows), 2)
        lessons.append(f"Beklenen-getiriden sapma ortalamasi %{avg_gap:.2f} seviyesinde olustu.")

    return {
        "closed_trade_count": total,
        "win_count": win_count,
        "loss_count": len(losers),
        "win_rate": win_rate,
        "win_rate_confidence_interval": _wilson_interval_pct(win_count, total),
        "avg_realized_return_pct": round(sum(returns) / total, 2) if total else 0.0,
        "median_realized_return_pct": round(median(returns), 2) if returns else 0.0,
        "avg_winner_return_pct": avg_win,
        "avg_loser_return_pct": avg_loss,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else (round(gross_profit, 2) if gross_profit > 0 else 0.0),
        "expectancy_pct": expectancy_pct,
        "avg_holding_days": average_holding_days,
        "median_holding_days": median_holding_days,
        "entry_signal_evaluated_count": len(entry_evaluated),
        "entry_signal_accuracy_pct": round((_safe_div(entry_successes, len(entry_evaluated))) * 100.0, 2) if entry_evaluated else 0.0,
        "entry_signal_confidence_interval": _wilson_interval_pct(entry_successes, len(entry_evaluated)),
        "entry_followed_trade_count": len(entry_followed),
        "entry_followed_win_rate": round((_safe_div(sum(1 for item in entry_followed if _safe_float(item.get("realized_return_pct")) > 0), len(entry_followed))) * 100.0, 2) if entry_followed else 0.0,
        "entry_probability_avg": round(sum(_safe_float(item.get("entry_probability_positive")) for item in entry_probability_rows) / len(entry_probability_rows), 4) if entry_probability_rows else 0.0,
        "entry_outperform_probability_avg": round(sum(_safe_float(item.get("entry_probability_outperform")) for item in entry_probability_rows) / len(entry_probability_rows), 4) if entry_probability_rows else 0.0,
        "expected_return_avg_pct": round(sum(_safe_float(item.get("entry_expected_return_pct")) for item in expected_return_rows) / len(expected_return_rows), 2) if expected_return_rows else 0.0,
        "realized_vs_expected_return_avg_pct": round(sum(_safe_float(item.get("realized_vs_expected_return_pct")) for item in expected_return_rows) / len(expected_return_rows), 2) if expected_return_rows else 0.0,
        "exit_signal_evaluated_count": len(exit_evaluated),
        "exit_signal_accuracy_pct": round((_safe_div(exit_successes, len(exit_evaluated))) * 100.0, 2) if exit_evaluated else 0.0,
        "exit_signal_confidence_interval": _wilson_interval_pct(exit_successes, len(exit_evaluated)),
        "exit_probability_avg": round(sum(_safe_float(item.get("exit_probability_positive")) for item in exit_probability_rows) / len(exit_probability_rows), 4) if exit_probability_rows else 0.0,
        "probability_brier_score": round(probability_brier_sum / len(entry_probability_rows), 4) if entry_probability_rows else 0.0,
        "signal_bucket_summary": signal_bucket_payload,
        "recent_closed_trades": sorted(closed_trades, key=lambda item: item.get("sell_date") or "", reverse=True)[:24],
        "lessons": lessons,
    }


def build_portfolio_learning_payload(
    *,
    portfolio_id: str,
    portfolio_name: str,
    assets: list[dict[str, Any]],
    transactions: list[dict[str, Any]],
    quotes_by_symbol: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    snapshot_by_symbol = _snapshot_lookup()

    decisions = [
        _build_position_card(
            asset=asset,
            quote=quotes_by_symbol.get(str(asset.get("symbol") or "").upper()),
            snapshot=snapshot_by_symbol.get(str(asset.get("symbol") or "").upper()),
            now=now,
        )
        for asset in assets
        if asset.get("symbol")
    ]

    alerts = []
    for item in decisions:
        severity = None
        message = None
        if item.get("holding_action") == "Kesin Sat" or item.get("target_action") == "Zarari Kes":
            severity = "Kesin Sat"
            message = item.get("target_action_reason") or item.get("holding_action_reason")
        elif item.get("holding_action") == "Sat" or item.get("target_action") in {"Risk Azalt", "Kar Al", "Kademeli Kar Al"}:
            severity = "Sat"
            message = item.get("target_action_reason") or item.get("holding_action_reason")

        if severity:
            alerts.append(
                {
                    "symbol": item.get("symbol"),
                    "severity": severity,
                    "status": item.get("target_status") or item.get("status"),
                    "message": message,
                }
            )
    alerts.sort(key=lambda item: 0 if item.get("severity") == "Kesin Sat" else 1)

    journal_entries = _upsert_journal_entries(portfolio_id, decisions, now)
    position_map = {str(item.get("symbol") or "").upper(): item for item in decisions}
    followed_entries, follow_summary = _match_followed_entries(
        journal_entries=journal_entries,
        transactions=transactions,
        position_map=position_map,
    )
    action_learning = _build_action_learning_summary(journal_entries, position_map, now)
    portfolio_report = _build_portfolio_report(
        portfolio_name=portfolio_name,
        journal_entries=journal_entries,
        transactions=transactions,
    )

    return {
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio_name,
        "generated_at": now.isoformat(),
        "holding_decisions": decisions,
        "alerts": alerts[:8],
        "recommendation_memory": {
            "journal_size": len(journal_entries),
            "followed_entries": followed_entries[-20:],
            **follow_summary,
            **action_learning,
        },
        "portfolio_report": portfolio_report,
    }
