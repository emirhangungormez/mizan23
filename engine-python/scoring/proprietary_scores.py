from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

import yfinance as yf

from api.dashboard import _get_global_alpha_payload
from scoring.formula_registry import get_formula_config
from scoring.probability_engine import derive_probability_action, estimate_probability_fields
from storage.proprietary_outcomes import get_bist_symbol_prediction_profile


GLOBAL_ALPHA_RETURN_SYMBOLS = {
    "usd": "DX-Y.NYB",
    "sp500": "^GSPC",
    "china_eq": "000001.SS",
    "gold": "GC=F",
    "euro": "EURUSD=X",
    "bitcoin": "BTC-USD",
    "silver": "SI=F",
    "oil": "CL=F",
}

FIELD_CONFIDENCE_RULES = {
    "trend": ["change_percent", "p1w", "p1m", "p3m", "ytd", "vs_sma50", "vs_sma200", "ta_summary", "supertrend_direction"],
    "liquidity": ["volume_usd", "market_cap_usd", "foreign_ratio"],
    "quality": ["p1y", "market_cap_usd", "foreign_ratio", "vs_sma200", "adx", "rsi"],
    "value": ["pe", "pb", "upside_52w", "dividend_yield"],
    "analyst": ["analyst_recommendation", "analyst_upside", "analyst_count"],
    "catalyst": ["news", "calendar"],
    "ownership": ["foreign_ratio", "etf_holders", "float_shares"],
    "sector": ["sector_relative_strength", "sector_peer_percentile", "sector_momentum_label"],
    "float_risk": ["public_float_pct", "major_holders", "volume_usd", "foreign_ratio"],
    "resilience": ["financials", "market_cap_usd"],
    "capital": ["dividends", "dividend_consistency_score", "news"],
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(parsed):
        return default
    return parsed


def _get_number(stock: dict[str, Any], key: str) -> float | None:
    value = stock.get(key)
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _normalize_centered(value: float | None, cap: float) -> float:
    if value is None or cap <= 0:
        return 50.0
    clipped = max(-cap, min(cap, value))
    return _clamp(50.0 + (clipped / cap) * 50.0)


def _normalize_linear(value: float | None, minimum: float, maximum: float) -> float:
    if value is None:
        return 50.0
    if maximum <= minimum:
        return 50.0
    ratio = (value - minimum) / (maximum - minimum)
    return _clamp(ratio * 100.0)


def _normalize_log(value: float | None, minimum: float, maximum: float) -> float:
    if value is None or value <= 0 or maximum <= minimum:
        return 0.0
    safe_value = min(maximum, max(minimum, value))
    log_min = math.log1p(minimum)
    log_max = math.log1p(maximum)
    ratio = (math.log1p(safe_value) - log_min) / (log_max - log_min)
    return _clamp(ratio * 100.0)


def _score_ta_summary(summary: str | None) -> float:
    normalized = (summary or "").upper()
    mapping = {
        "STRONG_BUY": 100.0,
        "BUY": 75.0,
        "NEUTRAL": 50.0,
        "SELL": 25.0,
        "STRONG_SELL": 0.0,
    }
    return mapping.get(normalized, 50.0)


def _score_supertrend(direction: str | None) -> float:
    if direction in {"▲", "â–²"}:
        return 100.0
    if direction in {"▼", "â–¼"}:
        return 0.0
    return 50.0


def _score_rsi_balance(rsi: float | None) -> float:
    if rsi is None:
        return 50.0
    if 45 <= rsi <= 68:
        return 100.0
    if 38 <= rsi < 45 or 68 < rsi <= 75:
        return 72.0
    if 30 <= rsi < 38 or 75 < rsi <= 82:
        return 42.0
    return 18.0


def _field_present(stock: dict[str, Any], key: str) -> bool:
    value = stock.get(key)
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _coverage_score(stock: dict[str, Any], keys: list[str]) -> float:
    if not keys:
        return 0.0
    present = sum(1 for key in keys if _field_present(stock, key))
    return round((present / len(keys)) * 100.0, 2)


def _label_from_score(score: float) -> str:
    if score >= 90:
        return "official"
    if score >= 80:
        return "strong"
    if score >= 65:
        return "usable"
    if score >= 45:
        return "weak"
    return "fragile"


def _market_regime(trend_score: float, liquidity_score: float, quality_score: float, stock: dict[str, Any]) -> str:
    adx = _get_number(stock, "adx") or 0.0
    day = _get_number(stock, "change_percent") or 0.0
    p1m = _get_number(stock, "p1m") or 0.0

    if adx >= 28 and trend_score >= 68 and p1m > 0:
        return "trend"
    if day < -3 and quality_score < 45:
        return "stress"
    if liquidity_score < 30:
        return "thin"
    return "balanced"


def _mode_weights(mode: str, regime: str) -> dict[str, float]:
    base = {
        "firsatlar": {"trend": 0.30, "liquidity": 0.22, "quality": 0.20, "hakiki": 0.18, "value": 0.10},
        "trade": {"trend": 0.38, "liquidity": 0.20, "quality": 0.14, "hakiki": 0.18, "value": 0.10},
        "uzun_vade": {"trend": 0.10, "liquidity": 0.15, "quality": 0.45, "hakiki": 0.15, "value": 0.15},
        "radar": {"trend": 0.20, "liquidity": 0.15, "quality": 0.10, "hakiki": 0.20, "value": 0.10},
    }[mode].copy()

    if regime == "trend":
        base["trend"] += 0.05
        base["hakiki"] += 0.03
        base["value"] -= 0.03
        base["quality"] -= 0.02
    elif regime == "stress":
        base["quality"] += 0.06
        base["liquidity"] += 0.04
        base["trend"] -= 0.05
        base["value"] -= 0.05
    elif regime == "thin":
        base["liquidity"] += 0.08
        base["trend"] -= 0.04
        base["hakiki"] -= 0.02
        base["value"] -= 0.02

    total = sum(base.values())
    return {key: value / total for key, value in base.items()}


def _driver_list(
    mode: str,
    trend_score: float,
    liquidity_score: float,
    quality_score: float,
    value_support_score: float,
    hakiki_alfa_score: float,
    analyst_support_score: float,
    catalyst_score: float,
    ownership_score: float,
    sector_context_score: float,
    public_float_risk_score: float,
    financial_resilience_score: float,
    capital_discipline_score: float,
) -> list[dict[str, Any]]:
    drivers = [
        {"key": "trend", "label": "Trend", "score": round(trend_score, 2)},
        {"key": "liquidity", "label": "Likidite", "score": round(liquidity_score, 2)},
        {"key": "quality", "label": "Kalite", "score": round(quality_score, 2)},
        {"key": "value", "label": "Deger", "score": round(value_support_score, 2)},
        {"key": "hakiki", "label": "Hakiki Alfa", "score": round(hakiki_alfa_score, 2)},
        {"key": "analyst", "label": "Analist", "score": round(analyst_support_score, 2)},
        {"key": "catalyst", "label": "Haber", "score": round(catalyst_score, 2)},
        {"key": "ownership", "label": "Kurumsal", "score": round(ownership_score, 2)},
        {"key": "sector", "label": "Sektor", "score": round(sector_context_score, 2)},
        {"key": "float_risk", "label": "Halka Aciklik Risk", "score": round(public_float_risk_score, 2)},
        {"key": "resilience", "label": "Dayaniklilik", "score": round(financial_resilience_score, 2)},
        {"key": "capital", "label": "Sermaye Disiplini", "score": round(capital_discipline_score, 2)},
    ]

    if mode == "trade":
        return sorted(drivers, key=lambda item: (item["key"] not in {"trend", "hakiki", "liquidity", "sector", "catalyst", "float_risk"}, -item["score"]))[:3]
    if mode == "uzun_vade":
        return sorted(drivers, key=lambda item: (item["key"] not in {"quality", "value", "ownership", "analyst", "resilience", "capital"}, -item["score"]))[:3]
    if mode == "radar":
        return sorted(drivers, key=lambda item: (item["key"] not in {"trend", "hakiki", "value", "catalyst", "sector"}, -item["score"]))[:3]
    return sorted(drivers, key=lambda item: item["score"], reverse=True)[:3]


def _get_daily_return_pct(symbol: str) -> float:
    history = yf.Ticker(symbol).history(period="7d", interval="1d", auto_adjust=True)
    if history is None or history.empty or "Close" not in history.columns or len(history["Close"]) < 2:
        raise ValueError(f"Insufficient history for {symbol}")
    closes = history["Close"].dropna()
    if len(closes) < 2:
        raise ValueError(f"Missing close data for {symbol}")
    previous_close = float(closes.iloc[-2])
    latest_close = float(closes.iloc[-1])
    if previous_close <= 0:
        raise ValueError(f"Invalid previous close for {symbol}")
    return ((latest_close / previous_close) - 1.0) * 100.0


def get_global_reference_snapshot() -> dict[str, Any]:
    payload = _get_global_alpha_payload()
    items = payload.get("core_items") or payload.get("items", [])
    sidecar_items = payload.get("macro_sidecar_items") or []

    weighted_returns = []
    reference_items = []
    total_weight = 0.0

    for item in items:
        key = item.get("key")
        symbol = GLOBAL_ALPHA_RETURN_SYMBOLS.get(str(key))
        if not symbol:
            continue

        try:
            daily_return_pct = _get_daily_return_pct(symbol)
        except Exception:
            daily_return_pct = 0.0

        share = float(item.get("share", 0.0))
        weighted_returns.append((share / 100.0) * daily_return_pct)
        total_weight += share

        reference_items.append(
            {
                "key": key,
                "label": item.get("label"),
                "symbol": symbol,
                "weight_pct": round(share, 4),
                "estimated_value_trillion_usd": item.get("estimated_value_trillion_usd"),
                "daily_return_pct": round(daily_return_pct, 4),
                "source": item.get("source"),
            }
        )

    return {
        "as_of": _utc_now_iso(),
        "daily_return_pct": round(sum(weighted_returns), 4),
        "core_daily_return_pct": round(sum(weighted_returns), 4),
        "weight_coverage_pct": round(total_weight, 4),
        "total_trillion_usd": payload.get("total_trillion_usd"),
        "confidence_score": payload.get("confidence_score", 0.0),
        "confidence_label": _label_from_score(float(payload.get("confidence_score", 0.0))),
        "items": reference_items,
        "core_items": reference_items,
        "macro_sidecar_items": sidecar_items,
        "macro_regime_label": payload.get("macro_regime_label", "balanced"),
    }


def compute_trend_score(stock: dict[str, Any]) -> float:
    day = _normalize_centered(_get_number(stock, "change_percent"), 10.0)
    week = _normalize_centered(_get_number(stock, "p1w"), 20.0)
    month = _normalize_centered(_get_number(stock, "p1m"), 35.0)
    quarter = _normalize_centered(_get_number(stock, "p3m"), 60.0)
    ytd = _normalize_centered(_get_number(stock, "ytd"), 100.0)
    returns_component = (0.20 * day) + (0.25 * week) + (0.25 * month) + (0.20 * quarter) + (0.10 * ytd)

    sma50 = _normalize_centered(_get_number(stock, "vs_sma50"), 25.0)
    sma200 = _normalize_centered(_get_number(stock, "vs_sma200"), 40.0)
    position_component = (0.45 * sma50) + (0.55 * sma200)

    technical_component = _score_ta_summary(stock.get("ta_summary"))
    supertrend_component = _score_supertrend(stock.get("supertrend_direction"))

    score = (0.42 * returns_component) + (0.28 * position_component) + (0.20 * technical_component) + (0.10 * supertrend_component)
    return round(_clamp(score), 2)


def compute_liquidity_score(stock: dict[str, Any]) -> float:
    volume_component = _normalize_log(_get_number(stock, "volume_usd"), 0.05, 500.0)
    size_component = _normalize_log(_get_number(stock, "market_cap_usd"), 0.05, 120.0)
    foreign_component = _normalize_linear(_get_number(stock, "foreign_ratio"), 0.0, 70.0)

    score = (0.45 * volume_component) + (0.35 * size_component) + (0.20 * foreign_component)
    return round(_clamp(score), 2)


def compute_quality_score(stock: dict[str, Any]) -> float:
    carry_component = _normalize_centered(_get_number(stock, "p1y"), 150.0)
    size_component = _normalize_log(_get_number(stock, "market_cap_usd"), 0.05, 120.0)
    foreign_component = _normalize_linear(_get_number(stock, "foreign_ratio"), 0.0, 70.0)
    trend_component = _normalize_centered(_get_number(stock, "vs_sma200"), 40.0)
    adx_component = _normalize_linear(_get_number(stock, "adx"), 10.0, 45.0)
    rsi_component = _score_rsi_balance(_get_number(stock, "rsi"))

    score = (
        (0.24 * carry_component)
        + (0.18 * size_component)
        + (0.16 * foreign_component)
        + (0.20 * trend_component)
        + (0.12 * adx_component)
        + (0.10 * rsi_component)
    )
    return round(_clamp(score), 2)


def compute_value_support_score(stock: dict[str, Any]) -> float:
    pe = _get_number(stock, "pe")
    pb = _get_number(stock, "pb")
    upside_52w = _get_number(stock, "upside_52w")
    dividend_yield = _get_number(stock, "dividend_yield")

    pe_score = 50.0
    if pe is not None:
        if 0 < pe <= 12:
            pe_score = 85.0
        elif pe <= 20:
            pe_score = 68.0
        elif pe <= 30:
            pe_score = 48.0
        else:
            pe_score = 28.0

    pb_score = 50.0
    if pb is not None:
        if 0 < pb <= 1.2:
            pb_score = 88.0
        elif pb <= 2.5:
            pb_score = 70.0
        elif pb <= 5:
            pb_score = 48.0
        else:
            pb_score = 24.0

    upside_score = _normalize_centered(upside_52w, 60.0)
    dividend_score = _normalize_linear(dividend_yield, 0.0, 12.0) if dividend_yield is not None else 50.0

    score = (0.32 * pe_score) + (0.28 * pb_score) + (0.25 * upside_score) + (0.15 * dividend_score)
    return round(_clamp(score), 2)


def _normalize_text_token(value: Any) -> str:
    return (
        str(value or "")
        .lower()
        .replace("ı", "i")
        .replace("ğ", "g")
        .replace("ü", "u")
        .replace("ş", "s")
        .replace("ö", "o")
        .replace("ç", "c")
    )


def _infer_sector_family(stock: dict[str, Any]) -> str:
    sector = _normalize_text_token(stock.get("sector"))
    industry = _normalize_text_token(stock.get("industry"))
    blob = f"{sector} {industry}"

    family_keywords = {
        "bank": ("bank", "banka", "financial", "finans"),
        "insurance": ("sigorta", "insurance"),
        "holding": ("holding", "yatirim"),
        "defense": ("savunma", "defence", "defense", "havacilik", "aerospace"),
        "energy": ("enerji", "utility", "elektrik", "dogalgaz"),
        "refinery": ("rafineri", "petrol", "oil", "fuel"),
        "commodity": ("demir", "celik", "steel", "metal", "madencilik", "mining", "bakir", "aluminyum"),
        "telecom": ("telekom", "telecom", "iletisim"),
        "retail": ("perakende", "retail", "gida", "market"),
        "consumer": ("icecek", "biracilik", "bira", "food", "consumer", "tuketim"),
        "industrial": ("imalat", "sanayi", "machinery", "endustri", "otomotiv", "automotive", "cement", "cimento"),
        "technology": ("teknoloji", "technology", "software", "yazilim", "bilisim"),
        "transport": ("ulasim", "transport", "airline", "hava", "lojistik", "shipping"),
    }

    for family, keywords in family_keywords.items():
        if any(keyword in blob for keyword in keywords):
            return family
    return "general"


def compute_fair_value_snapshot(
    stock: dict[str, Any],
    quality_score: float,
    financial_resilience_score: float,
    capital_discipline_score: float,
    sector_context_score: float,
) -> dict[str, Any]:
    market_cap = _get_number(stock, "market_cap")
    last_price = _get_number(stock, "last")
    financials = stock.get("financials") or {}

    net_income = _get_number(financials, "net_income")
    total_equity = _get_number(financials, "total_equity")
    ebitda = _get_number(financials, "ebitda")
    net_debt = _get_number(financials, "net_debt")
    free_cashflow = _get_number(financials, "free_cashflow")
    roe = _get_number(financials, "roe")
    ebitda_margin = _get_number(financials, "ebitda_margin")
    net_margin = _get_number(financials, "net_margin")
    analyst_upside = _get_number(stock, "analyst_upside")
    p1y = _get_number(stock, "p1y")
    p3m = _get_number(stock, "p3m")
    trailing_pe = _get_number(stock, "pe")
    price_to_book = _get_number(stock, "pb")
    foreign_ratio = _get_number(stock, "foreign_ratio")
    public_float_risk_score = compute_public_float_risk_score(stock)
    sector_family = _infer_sector_family(stock)

    sector_presets = {
        "bank": {"earnings": 7.5, "pb": 1.20, "ev_ebitda": 0.0, "fcf": 0.0},
        "insurance": {"earnings": 8.5, "pb": 1.35, "ev_ebitda": 0.0, "fcf": 0.0},
        "holding": {"earnings": 7.0, "pb": 0.95, "ev_ebitda": 6.0, "fcf": 8.5},
        "defense": {"earnings": 13.5, "pb": 2.30, "ev_ebitda": 10.5, "fcf": 13.0},
        "energy": {"earnings": 9.5, "pb": 1.35, "ev_ebitda": 7.5, "fcf": 9.5},
        "refinery": {"earnings": 7.5, "pb": 1.10, "ev_ebitda": 5.8, "fcf": 7.2},
        "commodity": {"earnings": 6.8, "pb": 1.05, "ev_ebitda": 5.5, "fcf": 7.0},
        "telecom": {"earnings": 8.8, "pb": 1.30, "ev_ebitda": 5.7, "fcf": 8.8},
        "retail": {"earnings": 10.0, "pb": 1.85, "ev_ebitda": 8.3, "fcf": 10.0},
        "consumer": {"earnings": 10.5, "pb": 1.90, "ev_ebitda": 8.5, "fcf": 10.5},
        "industrial": {"earnings": 9.0, "pb": 1.45, "ev_ebitda": 7.2, "fcf": 9.0},
        "technology": {"earnings": 14.0, "pb": 2.60, "ev_ebitda": 11.0, "fcf": 14.0},
        "transport": {"earnings": 8.4, "pb": 1.25, "ev_ebitda": 6.6, "fcf": 8.4},
        "general": {"earnings": 8.8, "pb": 1.35, "ev_ebitda": 7.0, "fcf": 9.0},
    }
    preset = sector_presets.get(sector_family, sector_presets["general"])

    growth_inputs = []
    if analyst_upside is not None:
        growth_inputs.append(_normalize_centered(analyst_upside, 45.0))
    if p1y is not None:
        growth_inputs.append(_normalize_centered(p1y, 80.0))
    if p3m is not None:
        growth_inputs.append(_normalize_centered(p3m, 35.0))
    growth_score = sum(growth_inputs) / len(growth_inputs) if growth_inputs else 50.0
    growth_bump = (growth_score - 50.0) / 50.0
    sector_bump = (sector_context_score - 50.0) / 50.0
    resilience_bump = (financial_resilience_score - 50.0) / 50.0
    dilution_penalty = max(0.0, (public_float_risk_score - 55.0) / 45.0)

    earnings_multiple = preset["earnings"] + (quality_score - 50.0) * 0.06 + (financial_resilience_score - 50.0) * 0.04
    earnings_multiple += growth_bump * 2.2 + sector_bump * 1.0 - dilution_penalty * 1.0
    earnings_multiple = max(4.5, min(24.0, earnings_multiple))

    pb_multiple = preset["pb"] + ((quality_score - 50.0) * 0.015) + ((financial_resilience_score - 50.0) * 0.012)
    if roe is not None:
        pb_multiple += max(-0.45, min(1.5, (roe - 12.0) * 0.035))
    pb_multiple += growth_bump * 0.35 + sector_bump * 0.15 - dilution_penalty * 0.15
    pb_multiple = max(0.55, min(5.5, pb_multiple))

    ev_ebitda_multiple = preset["ev_ebitda"] + ((quality_score - 50.0) * 0.05) + ((financial_resilience_score - 50.0) * 0.05)
    if ebitda_margin is not None:
        ev_ebitda_multiple += max(-1.0, min(2.0, (ebitda_margin - 18.0) * 0.08))
    ev_ebitda_multiple += growth_bump * 1.2 + sector_bump * 0.6 - dilution_penalty * 0.5
    ev_ebitda_multiple = max(4.0, min(18.0, ev_ebitda_multiple))

    fcf_multiple = preset["fcf"] + ((capital_discipline_score - 50.0) * 0.07) + ((financial_resilience_score - 50.0) * 0.05)
    if net_margin is not None:
        fcf_multiple += max(-1.0, min(2.0, (net_margin - 10.0) * 0.08))
    fcf_multiple += growth_bump * 1.2 + resilience_bump * 0.8 - dilution_penalty * 0.7
    fcf_multiple = max(5.5, min(22.0, fcf_multiple))

    components: list[dict[str, Any]] = []

    if sector_family == "bank":
        bank_pb_target = preset["pb"] + ((quality_score - 50.0) * 0.010) + ((financial_resilience_score - 50.0) * 0.012)
        bank_pb_target += growth_bump * 0.20 + sector_bump * 0.10
        if foreign_ratio is not None:
            bank_pb_target += max(-0.10, min(0.30, (foreign_ratio - 20.0) * 0.005))
        bank_pb_target = max(0.60, min(2.40, bank_pb_target))

        if total_equity is not None and total_equity > 0:
            components.append(
                {
                    "method": "bank_book_value",
                    "weight": 0.62,
                    "target_market_cap": total_equity * bank_pb_target,
                    "multiple": round(bank_pb_target, 2),
                }
            )

        if net_income is not None and net_income > 0:
            bank_pe_target = preset["earnings"] + ((quality_score - 50.0) * 0.035) + ((financial_resilience_score - 50.0) * 0.030)
            bank_pe_target += growth_bump * 1.10 + sector_bump * 0.40
            bank_pe_target = max(4.0, min(12.0, bank_pe_target))
            components.append(
                {
                    "method": "bank_earnings",
                    "weight": 0.38,
                    "target_market_cap": net_income * bank_pe_target,
                    "multiple": round(bank_pe_target, 2),
                }
            )

        if (
            not components
            and market_cap is not None
            and market_cap > 0
            and price_to_book is not None
            and price_to_book > 0
        ):
            implied_equity = market_cap / price_to_book
            proxy_pb_target = max(0.65, min(2.20, preset["pb"] + growth_bump * 0.18 + sector_bump * 0.08))
            components.append(
                {
                    "method": "bank_pb_proxy",
                    "weight": 0.65,
                    "target_market_cap": implied_equity * proxy_pb_target,
                    "multiple": round(proxy_pb_target, 2),
                }
            )

        if (
            market_cap is not None
            and market_cap > 0
            and trailing_pe is not None
            and trailing_pe > 0
        ):
            implied_income = market_cap / trailing_pe
            proxy_pe_target = max(4.0, min(11.5, preset["earnings"] + growth_bump * 0.90 + sector_bump * 0.35))
            components.append(
                {
                    "method": "bank_pe_proxy",
                    "weight": 0.35,
                    "target_market_cap": implied_income * proxy_pe_target,
                    "multiple": round(proxy_pe_target, 2),
                }
            )

    if sector_family != "bank" and net_income is not None and net_income > 0:
        components.append(
            {
                "method": "earnings",
                "weight": 0.34,
                "target_market_cap": net_income * earnings_multiple,
                "multiple": round(earnings_multiple, 2),
            }
        )

    if sector_family != "bank" and total_equity is not None and total_equity > 0:
        components.append(
            {
                "method": "book_value",
                "weight": 0.24,
                "target_market_cap": total_equity * pb_multiple,
                "multiple": round(pb_multiple, 2),
            }
        )

    if sector_family != "bank" and ebitda is not None and ebitda > 0:
        equity_value = (ebitda * ev_ebitda_multiple) - max(net_debt or 0.0, 0.0)
        if equity_value > 0:
            components.append(
                {
                    "method": "ev_ebitda",
                    "weight": 0.24,
                    "target_market_cap": equity_value,
                    "multiple": round(ev_ebitda_multiple, 2),
                }
            )

    if sector_family != "bank" and free_cashflow is not None and free_cashflow > 0:
        components.append(
            {
                "method": "free_cashflow",
                "weight": 0.18,
                "target_market_cap": free_cashflow * fcf_multiple,
                "multiple": round(fcf_multiple, 2),
            }
        )

    if (
        sector_family != "bank"
        and market_cap is not None
        and market_cap > 0
        and trailing_pe is not None
        and trailing_pe > 0
    ):
        implied_income = market_cap / trailing_pe
        proxy_pe_target = max(4.5, min(24.0, preset["earnings"] + growth_bump * 1.25 + sector_bump * 0.55))
        components.append(
            {
                "method": "earnings_proxy",
                "weight": 0.26 if net_income is None else 0.14,
                "target_market_cap": implied_income * proxy_pe_target,
                "multiple": round(proxy_pe_target, 2),
            }
        )

    if (
        sector_family != "bank"
        and market_cap is not None
        and market_cap > 0
        and price_to_book is not None
        and price_to_book > 0
    ):
        implied_equity = market_cap / price_to_book
        proxy_pb_target = max(0.55, min(5.5, preset["pb"] + growth_bump * 0.25 + sector_bump * 0.10))
        components.append(
            {
                "method": "book_value_proxy",
                "weight": 0.22 if total_equity is None else 0.12,
                "target_market_cap": implied_equity * proxy_pb_target,
                "multiple": round(proxy_pb_target, 2),
            }
        )

    if not components or market_cap is None or market_cap <= 0:
        return {
            "fair_value_price": None,
            "fair_value_market_cap": None,
            "premium_discount_pct": None,
            "fair_value_score": 50.0,
            "fair_value_label": "yetersiz_veri",
            "confidence": round((len(components) / 4) * 100, 2),
            "fair_value_confidence_band": "yetersiz_veri",
            "fair_value_data_band": "yetersiz_veri",
            "sector_family": sector_family,
            "growth_score": round(growth_score, 2),
            "components": components,
        }

    weight_total = sum(float(item["weight"]) for item in components)
    fair_value_market_cap = sum(float(item["target_market_cap"]) * float(item["weight"]) for item in components) / weight_total
    premium_discount_pct = ((fair_value_market_cap / market_cap) - 1.0) * 100.0
    fair_value_price = (last_price * fair_value_market_cap / market_cap) if last_price is not None and last_price > 0 else None
    fair_value_score = _normalize_centered(premium_discount_pct, 60.0)

    if premium_discount_pct >= 20:
        fair_value_label = "iskontolu"
    elif premium_discount_pct <= -20:
        fair_value_label = "sismis"
    else:
        fair_value_label = "makul"

    confidence = round((len(components) / 4) * 100, 2)
    if any(str(component.get("method", "")).startswith("bank_") for component in components):
        confidence = max(confidence, 65.0 if len(components) >= 2 else 45.0)
    confidence = round(min(100.0, confidence + 10.0), 2)

    if len(components) >= 3:
        fair_value_data_band = "guclu"
    elif len(components) >= 1:
        fair_value_data_band = "tahmini"
    else:
        fair_value_data_band = "yetersiz_veri"

    if confidence >= 75:
        fair_value_confidence_band = "guclu"
    elif confidence >= 45:
        fair_value_confidence_band = "tahmini"
    else:
        fair_value_confidence_band = "yetersiz_veri"

    return {
        "fair_value_price": round(fair_value_price, 4) if fair_value_price is not None else None,
        "fair_value_market_cap": round(fair_value_market_cap, 2),
        "premium_discount_pct": round(premium_discount_pct, 2),
        "fair_value_score": round(fair_value_score, 2),
        "fair_value_label": fair_value_label,
        "confidence": confidence,
        "fair_value_confidence_band": fair_value_confidence_band,
        "fair_value_data_band": fair_value_data_band,
        "sector_family": sector_family,
        "growth_score": round(growth_score, 2),
        "components": [
            {
                **item,
                "target_market_cap": round(float(item["target_market_cap"]), 2),
            }
            for item in components
        ],
    }


def compute_analyst_support_score(stock: dict[str, Any]) -> float:
    recommendation = str(stock.get("analyst_recommendation") or "").strip().upper()
    upside = _get_number(stock, "analyst_upside")
    analyst_count = _get_number(stock, "analyst_count")

    recommendation_score = 50.0
    if recommendation in {"AL", "BUY", "STRONG BUY"}:
        recommendation_score = 84.0
    elif recommendation in {"TUT", "HOLD", "NEUTRAL"}:
        recommendation_score = 56.0
    elif recommendation in {"SAT", "SELL", "STRONG SELL"}:
        recommendation_score = 24.0

    upside_score = _normalize_centered(upside, 30.0)
    coverage_score = _normalize_linear(analyst_count, 0.0, 20.0)

    score = (0.45 * recommendation_score) + (0.35 * upside_score) + (0.20 * coverage_score)
    return round(_clamp(score), 2)


def compute_catalyst_score(stock: dict[str, Any]) -> float:
    news_items = stock.get("news") or []
    calendar = stock.get("calendar") or {}

    positive_keywords = (
        "yeni iş",
        "özel durum",
        "ozel durum",
        "kredi derecelendirmesi",
        "faaliyet raporu",
        "finansal rapor",
        "geri alım",
        "geri alim",
        "temettü",
        "temettu",
        "yatırım",
        "yatirim",
        "geleceğe dönük",
        "gelecege donuk",
        "finansal duran varlık edinimi",
        "finansal duran varlik edinimi",
        "hak kullanımı",
        "hak kullanimi",
        "geri alım",
        "geri alim",
    )
    neutral_keywords = (
        "şirket genel bilgi formu",
        "sirket genel bilgi formu",
        "bistech",
        "genel kurul",
        "pay dışında",
        "pay disinda",
        "bildirim",
    )
    negative_keywords = (
        "işlem yasağı",
        "islem yasagi",
        "devre kesici",
        "sermaye artırımı",
        "sermaye artirimi",
        "söylenti",
        "soylenti",
        "borç",
        "borc",
        "pay bazında devre kesici",
        "pay bazinda devre kesici",
        "haber ve söylentilere ilişkin açıklama",
        "haber ve soylentilere iliskin aciklama",
    )
    severe_negative_keywords = (
        "tasfiye",
        "iflas",
        "konkordato",
        "islem yasagi",
    )

    score = 50.0
    positive_count = 0
    negative_count = 0
    neutral_count = 0

    for item in news_items[:5]:
        title = str(item.get("title") or item.get("Title") or "").lower()
        if not title:
            continue
        if any(keyword in title for keyword in positive_keywords):
            score += 6.0
            positive_count += 1
        if any(keyword in title for keyword in neutral_keywords):
            neutral_count += 1
        if any(keyword in title for keyword in negative_keywords):
            score -= 6.0
            negative_count += 1
        if any(keyword in title for keyword in severe_negative_keywords):
            score -= 10.0

    if calendar.get("earnings_date"):
        score += 4.0
    if calendar.get("dividend_date") or calendar.get("ex_dividend_date"):
        score += 3.0

    return round(_clamp(score), 2)


def compute_ownership_score(stock: dict[str, Any]) -> float:
    foreign_ratio = _normalize_linear(_get_number(stock, "foreign_ratio"), 0.0, 70.0)
    etf_holders = stock.get("etf_holders") or []
    etf_count_score = _normalize_linear(float(len(etf_holders)), 0.0, 8.0)
    public_float_pct = _get_number(stock, "public_float_pct")
    float_shares_score = _normalize_linear(public_float_pct, 5.0, 55.0) if public_float_pct is not None else _normalize_linear(_get_number(stock, "float_shares"), 0.0, 60.0)

    major_holders = stock.get("major_holders") or []
    top_holder_pct = 0.0
    holder_concentration_penalty = 0.0
    if major_holders:
        percentages = [float(item.get("percentage") or 0.0) for item in major_holders if float(item.get("percentage") or 0.0) > 0]
        if percentages:
            top_holder_pct = max(percentages)
            if top_holder_pct >= 75:
                holder_concentration_penalty = 18.0
            elif top_holder_pct >= 60:
                holder_concentration_penalty = 10.0
            elif top_holder_pct >= 45:
                holder_concentration_penalty = 4.0

    dividend_consistency = _get_number(stock, "dividend_consistency_score")
    dividend_consistency_score = dividend_consistency if dividend_consistency is not None else _normalize_linear(_get_number(stock, "dividend_event_count"), 0.0, 6.0)

    score = (
        (0.34 * foreign_ratio)
        + (0.22 * etf_count_score)
        + (0.22 * float_shares_score)
        + (0.22 * (dividend_consistency_score if dividend_consistency_score is not None else 50.0))
        - holder_concentration_penalty
    )
    return round(_clamp(score), 2)


def compute_sector_context_score(stock: dict[str, Any]) -> float:
    relative_strength = _normalize_centered(_get_number(stock, "sector_relative_strength"), 12.0)
    peer_percentile = _get_number(stock, "sector_peer_percentile")
    momentum_label = str(stock.get("sector_momentum_label") or "").lower()

    momentum_score = 50.0
    if momentum_label == "leading":
        momentum_score = 76.0
    elif momentum_label == "lagging":
        momentum_score = 28.0

    peer_score = peer_percentile if peer_percentile is not None else 50.0
    score = (0.40 * relative_strength) + (0.35 * peer_score) + (0.25 * momentum_score)
    return round(_clamp(score), 2)


def compute_public_float_risk_score(stock: dict[str, Any]) -> float:
    public_float_pct = _get_number(stock, "public_float_pct")
    volume_usd = _get_number(stock, "volume_usd")
    foreign_ratio = _get_number(stock, "foreign_ratio")
    major_holders = stock.get("major_holders") or []

    float_risk = 50.0
    if public_float_pct is not None:
        if public_float_pct < 10:
            float_risk = 90.0
        elif public_float_pct < 20:
            float_risk = 72.0
        elif public_float_pct < 30:
            float_risk = 56.0
        elif public_float_pct <= 65:
            float_risk = 28.0
        else:
            float_risk = 38.0

    liquidity_risk = 100.0 - _normalize_log(volume_usd, 0.05, 250.0)
    foreign_risk = 100.0 - _normalize_linear(foreign_ratio, 0.0, 70.0)

    concentration_risk = 50.0
    percentages = [float(item.get("percentage") or 0.0) for item in major_holders if float(item.get("percentage") or 0.0) > 0]
    if percentages:
        top_holder_pct = max(percentages)
        if top_holder_pct >= 75:
            concentration_risk = 90.0
        elif top_holder_pct >= 60:
            concentration_risk = 74.0
        elif top_holder_pct >= 45:
            concentration_risk = 60.0
        else:
            concentration_risk = 38.0

    score = (0.34 * float_risk) + (0.26 * liquidity_risk) + (0.22 * concentration_risk) + (0.18 * foreign_risk)
    return round(_clamp(score), 2)


def compute_financial_resilience_score(stock: dict[str, Any]) -> float:
    financials = stock.get("financials") or {}

    debt_to_equity = _get_number(financials, "debt_to_equity")
    net_margin = _get_number(financials, "net_margin")
    ebitda_margin = _get_number(financials, "ebitda_margin")
    roe = _get_number(financials, "roe")
    roa = _get_number(financials, "roa")
    operating_cashflow = _get_number(financials, "operating_cashflow")
    free_cashflow = _get_number(financials, "free_cashflow")
    market_cap_usd = _get_number(stock, "market_cap_usd")

    leverage_score = 50.0
    if debt_to_equity is not None:
        if debt_to_equity <= 0.4:
            leverage_score = 86.0
        elif debt_to_equity <= 0.8:
            leverage_score = 72.0
        elif debt_to_equity <= 1.5:
            leverage_score = 50.0
        else:
            leverage_score = 26.0

    margin_score = 50.0
    if net_margin is not None or ebitda_margin is not None:
        margin_parts = []
        if net_margin is not None:
            margin_parts.append(_normalize_linear(net_margin, 0.0, 25.0))
        if ebitda_margin is not None:
            margin_parts.append(_normalize_linear(ebitda_margin, 0.0, 35.0))
        margin_score = sum(margin_parts) / len(margin_parts)

    returns_score = 50.0
    if roe is not None or roa is not None:
        return_parts = []
        if roe is not None:
            return_parts.append(_normalize_linear(roe, 0.0, 30.0))
        if roa is not None:
            return_parts.append(_normalize_linear(roa, 0.0, 12.0))
        returns_score = sum(return_parts) / len(return_parts)

    cashflow_score = 50.0
    if operating_cashflow is not None or free_cashflow is not None:
        positive_flags = 0
        total_flags = 0
        if operating_cashflow is not None:
            total_flags += 1
            if operating_cashflow > 0:
                positive_flags += 1
        if free_cashflow is not None:
            total_flags += 1
            if free_cashflow > 0:
                positive_flags += 1
        if total_flags > 0:
            cashflow_score = (positive_flags / total_flags) * 100.0

    size_buffer = _normalize_log(market_cap_usd, 0.05, 120.0)

    score = (0.28 * leverage_score) + (0.22 * margin_score) + (0.20 * returns_score) + (0.20 * cashflow_score) + (0.10 * size_buffer)
    return round(_clamp(score), 2)


def compute_capital_discipline_score(stock: dict[str, Any]) -> float:
    dividend_consistency = _get_number(stock, "dividend_consistency_score")
    dividend_yield = _get_number(stock, "dividend_yield")
    news_items = stock.get("news") or []
    historical_capital_actions = stock.get("historical_capital_actions") or []
    share_buyback_history = stock.get("share_buyback_history") or []

    dividend_score = 50.0
    if dividend_consistency is not None:
        dividend_score = dividend_consistency
    elif dividend_yield is not None:
        dividend_score = _normalize_linear(dividend_yield, 0.0, 10.0)

    buyback_score = 50.0
    if share_buyback_history:
        buyback_score = min(90.0, 60.0 + (len(share_buyback_history) * 6.0))

    dilution_penalty = 0.0
    positive_capital_score = 50.0
    for item in news_items[:8]:
        title = str(item.get("title") or item.get("Title") or "").lower()
        if "geri al" in title:
            positive_capital_score += 8.0
        if "temett" in title:
            positive_capital_score += 4.0
        if "sermaye artır" in title or "sermaye artir" in title:
            dilution_penalty += 14.0
        if "bedelli" in title:
            dilution_penalty += 12.0
        if "bedelsiz" in title:
            positive_capital_score += 3.0

    for action in historical_capital_actions:
        action_type = str(action.get("type") or "").lower()
        if "bedelli" in action_type or "sermaye art" in action_type:
            dilution_penalty += 10.0
        if "geri al" in action_type:
            positive_capital_score += 6.0
        if "temett" in action_type:
            positive_capital_score += 4.0

    score = (0.42 * dividend_score) + (0.23 * buyback_score) + (0.35 * _clamp(positive_capital_score)) - dilution_penalty
    return round(_clamp(score), 2)


def compute_dividend_confidence_score(stock: dict[str, Any]) -> float:
    dividend_yield = _get_number(stock, "dividend_yield")
    dividend_consistency = _get_number(stock, "dividend_consistency_score")
    resilience = compute_financial_resilience_score(stock)
    capital = compute_capital_discipline_score(stock)

    yield_score = 50.0
    if dividend_yield is not None:
        if 1.0 <= dividend_yield <= 8.0:
            yield_score = 82.0
        elif 8.0 < dividend_yield <= 12.0:
            yield_score = 68.0
        elif dividend_yield > 12.0:
            yield_score = 36.0
        else:
            yield_score = 52.0

    consistency_score = dividend_consistency if dividend_consistency is not None else _normalize_linear(_get_number(stock, "dividend_event_count"), 0.0, 6.0)
    score = (0.28 * yield_score) + (0.24 * consistency_score) + (0.26 * resilience) + (0.22 * capital)
    return round(_clamp(score), 2)


def compute_dividend_trap_risk(stock: dict[str, Any], dividend_confidence_score: float | None = None) -> float:
    dividend_yield = _get_number(stock, "dividend_yield") or 0.0
    resilience = compute_financial_resilience_score(stock)
    capital = compute_capital_discipline_score(stock)
    confidence = dividend_confidence_score if dividend_confidence_score is not None else compute_dividend_confidence_score(stock)

    risk = 24.0
    if dividend_yield >= 10:
        risk += 26.0
    elif dividend_yield >= 7:
        risk += 14.0
    elif dividend_yield >= 4:
        risk += 6.0

    risk += max(0.0, (55.0 - resilience) * 0.45)
    risk += max(0.0, (52.0 - capital) * 0.35)
    risk += max(0.0, (58.0 - confidence) * 0.30)
    return round(_clamp(risk), 2)


def compute_dividend_calendar_opportunity(stock: dict[str, Any], dividend_confidence_score: float | None = None) -> float:
    calendar = stock.get("calendar") or {}
    confidence = dividend_confidence_score if dividend_confidence_score is not None else compute_dividend_confidence_score(stock)
    catalyst_score = compute_catalyst_score(stock)

    dividend_date = calendar.get("dividend_date") or calendar.get("ex_dividend_date")
    if not dividend_date:
        return 0.0

    score = (0.58 * confidence) + (0.22 * catalyst_score) + (0.20 * _normalize_centered(_get_number(stock, "change_percent"), 6.0))
    return round(_clamp(score), 2)


def compute_sector_leadership_score(stock: dict[str, Any]) -> float:
    return compute_sector_context_score(stock)


def compute_sector_separation_score(stock: dict[str, Any]) -> float:
    relative_strength = _normalize_centered(_get_number(stock, "sector_relative_strength"), 10.0)
    peer_percentile = _get_number(stock, "sector_peer_percentile") or 50.0
    return round(_clamp((0.55 * relative_strength) + (0.45 * peer_percentile)), 2)


def compute_sector_acceleration_score(stock: dict[str, Any]) -> float:
    p1m = _normalize_centered(_get_number(stock, "p1m"), 25.0)
    p3m = _normalize_centered(_get_number(stock, "p3m"), 45.0)
    sector_momentum = _normalize_centered(_get_number(stock, "sector_momentum_score"), 12.0)
    return round(_clamp((0.30 * p1m) + (0.30 * p3m) + (0.40 * sector_momentum)), 2)


def compute_regime_label(stock: dict[str, Any], global_reference: dict[str, Any], trend_score: float, liquidity_score: float, quality_score: float) -> str:
    macro_regime = str(global_reference.get("macro_regime_label") or "").lower()
    if macro_regime in {"energy_stress", "inflation_pressure", "risk_off"}:
        return macro_regime
    if liquidity_score < 30:
        return "thin_liquidity"
    if trend_score >= 68 and quality_score >= 58 and float(global_reference.get("core_daily_return_pct") or global_reference.get("daily_return_pct") or 0.0) > 0:
        return "risk_on"
    return "balanced"


def _mode_weights_v2(mode: str, regime_label: str) -> dict[str, float]:
    mapped_regime = {
        "risk_on": "trend",
        "risk_off": "stress",
        "inflation_pressure": "stress",
        "energy_stress": "stress",
        "thin_liquidity": "thin",
        "balanced": "balanced",
    }.get(regime_label, "balanced")
    return _mode_weights(mode, mapped_regime)


def compute_portfolio_fit_baseline(
    stock: dict[str, Any],
    firsat_skoru: float,
    trade_skoru: float,
    uzun_vade_skoru: float,
    hakiki_alfa_pct: float,
    public_float_risk_score: float,
    financial_resilience_score: float,
    capital_discipline_score: float,
) -> dict[str, Any]:
    sector_score = compute_sector_context_score(stock)
    fit_score = _clamp(
        (0.24 * firsat_skoru)
        + (0.12 * trade_skoru)
        + (0.30 * uzun_vade_skoru)
        + (0.12 * _normalize_centered(hakiki_alfa_pct, 4.0))
        + (0.10 * financial_resilience_score)
        + (0.08 * capital_discipline_score)
        + (0.08 * sector_score)
        - ((public_float_risk_score - 50.0) * 0.12)
    )

    if fit_score >= 82:
        action = "Mutlaka Olmali"
        reason = "Kalite, hakiki alfa ve tasima zemini portfoyde yer acmayi hakli cikariyor."
    elif fit_score >= 70:
        action = "Tut"
        reason = "Portfoy icin saglikli bir tasima adayi; agresif ama zorunlu degil."
    elif fit_score >= 58:
        action = "Azalt"
        reason = "Tamamen cikmak gerekmiyor ama agirlik konusunda daha secici olmak gerekiyor."
    else:
        action = "Hemen Cik"
        reason = "Portfoy kalitesine kattigindan cok risk tasiyor."

    return {
        "portfolio_fit_score": round(fit_score, 2),
        "portfolio_action": action,
        "portfolio_action_reason": reason,
    }


def compute_hakiki_alfa(stock: dict[str, Any], global_reference: dict[str, Any]) -> dict[str, Any]:
    stock_daily_return_pct = _get_number(stock, "change_percent") or 0.0
    global_daily_return_pct = float(global_reference.get("core_daily_return_pct") or global_reference.get("daily_return_pct") or 0.0)
    hakiki_alfa_pct = stock_daily_return_pct - global_daily_return_pct
    hakiki_alfa_score = _normalize_centered(hakiki_alfa_pct, 5.0)

    status = "neutral"
    if hakiki_alfa_pct > 0.15:
        status = "positive"
    elif hakiki_alfa_pct < -0.15:
        status = "negative"

    return {
        "daily_return_pct": round(stock_daily_return_pct, 4),
        "global_reference_return_pct": round(global_daily_return_pct, 4),
        "hakiki_alfa_pct": round(hakiki_alfa_pct, 4),
        "hakiki_alfa_score": round(hakiki_alfa_score, 2),
        "status": status,
    }


def _risk_label(liquidity_score: float, rsi: float | None, hakiki_alfa_pct: float) -> str:
    if liquidity_score < 35:
        return "Sığ"
    if rsi is not None and rsi > 74:
        return "Asiri isinma"
    if hakiki_alfa_pct <= 0:
        return "Reel baski"
    return "Kontrollu"


def _compute_trade_entry_quality(stock: dict[str, Any], hakiki_alfa_pct: float) -> dict[str, Any]:
    day = _get_number(stock, "change_percent") or 0.0
    p1w = _get_number(stock, "p1w") or 0.0
    rsi = _get_number(stock, "rsi")
    vs_sma50 = _get_number(stock, "vs_sma50") or 0.0
    adx = _get_number(stock, "adx") or 0.0

    score = 76.0

    if day >= 5.0:
        score -= 30.0
    elif day >= 3.0:
        score -= 18.0
    elif day >= 1.8:
        score -= 8.0
    elif -2.5 <= day <= 1.5:
        score += 4.0

    if p1w >= 12.0:
        score -= 16.0
    elif p1w >= 8.0:
        score -= 10.0
    elif -4.0 <= p1w <= 6.0:
        score += 4.0

    if rsi is not None:
        if rsi >= 78:
            score -= 26.0
        elif rsi >= 72:
            score -= 16.0
        elif rsi >= 68:
            score -= 6.0
        elif 44 <= rsi <= 62:
            score += 8.0
        elif 38 <= rsi < 44:
            score += 4.0

    if vs_sma50 >= 11.0:
        score -= 14.0
    elif vs_sma50 >= 7.0:
        score -= 8.0
    elif -1.5 <= vs_sma50 <= 4.0:
        score += 5.0

    if adx >= 24 and -1.5 <= day <= 2.5:
        score += 4.0

    if hakiki_alfa_pct > 0 and day <= 2.5:
        score += 4.0

    score = round(_clamp(score), 2)

    if score >= 76:
        label = "Uygun Giris"
        note = "Hareket var ama trade girisi halen makul seviyede."
    elif score >= 58:
        label = "Temkinli Giris"
        note = "Kurulum korunuyor, ancak zamanlama dikkat istiyor."
    elif score >= 40:
        label = "Pullback Bekle"
        note = "Momentum guclu olsa da daha temiz bir geri cekilme beklenmeli."
    else:
        label = "Gec Kalinmis"
        note = "Hareketin onemli kismi fiyatlanmis olabilir; kovalamak riskli."

    return {
        "score": score,
        "label": label,
        "note": note,
    }


def _build_motor_note(mode: str, trend_score: float, liquidity_score: float, quality_score: float, hakiki_alfa_pct: float) -> str:
    if mode == "trade":
        if trend_score >= 70 and hakiki_alfa_pct > 0:
            return "Trend ve reel akış kısa vade trade için birlikte çalışıyor."
        if liquidity_score >= 55:
            return "Likidite var ama teknik teyit tam güçte değil."
        return "Hareket var, ancak trade akışı için teyit zayıf."

    if mode == "uzun_vade":
        if quality_score >= 72 and hakiki_alfa_pct > 0:
            return "Kalite izi ve reel üstünlük uzun vade taşıma fikrini destekliyor."
        if quality_score >= 60:
            return "Yapı fena değil, kademeli birikim için izlenebilir."
        return "Uzun vade taşıma kalitesi henüz ikna edici değil."

    if mode == "radar":
        if 50 <= trend_score <= 68 and hakiki_alfa_pct > 0:
            return "Erken toparlanma var; teyit gelirse hızlanabilir."
        return "Henüz radar aşamasında, erken sinyal disiplinle izlenmeli."

    if trend_score >= 68 and liquidity_score >= 45 and hakiki_alfa_pct > 0:
        return "Momentum, likidite ve reel performans birlikte pozitif."
    if quality_score >= 65:
        return "Kalite desteği var ama kısa vadeli teyit daha net olmalı."
    return "Ham veri akışı mevcut, fakat fırsat katmanı henüz tam temiz değil."


def _build_signal(
    mode: str,
    score: float,
    stock: dict[str, Any],
    trend_score: float,
    liquidity_score: float,
    quality_score: float,
    hakiki_alfa: dict[str, Any],
    drivers: list[dict[str, Any]],
    score_confidence: float,
) -> dict[str, Any]:
    day = _get_number(stock, "change_percent") or 0.0
    p1w = _get_number(stock, "p1w") or 0.0
    p1m = _get_number(stock, "p1m") or 0.0
    p1y = _get_number(stock, "p1y") or 0.0
    rsi = _get_number(stock, "rsi")
    hakiki_alfa_pct = float(hakiki_alfa["hakiki_alfa_pct"])
    entry_quality = _compute_trade_entry_quality(stock, hakiki_alfa_pct)

    if mode == "trade":
        action = "Hizli Trade Adayi" if score >= 80 else "Takibe Al" if score >= 66 else "Zayif"
        horizon = "1-10 gun"
        emphasis = p1w
        emphasis_label = "1H"
    elif mode == "uzun_vade":
        action = "Biriktir / Tut" if score >= 78 else "Izle / Kademeli" if score >= 64 else "Bekle"
        horizon = "3-12 ay"
        emphasis = p1y
        emphasis_label = "1Y"
    elif mode == "radar":
        action = "Kurulum Var" if score >= 72 else "Sessiz Toparlaniyor" if score >= 58 else "Net Degil"
        horizon = "Izleme"
        emphasis = p1m
        emphasis_label = "1A"
    else:
        action = "Bugun Alinabilir" if score >= 85 else "Bu Hafta Uygun" if score >= 75 else "Izlenmeli" if score >= 62 else "Bekle"
        horizon = "Bugun" if score >= 85 else "Bu hafta" if score >= 75 else "1-4 hafta" if score >= 62 else "Takip"
        emphasis = day
        emphasis_label = "Gun"

    if mode == "trade":
        return_bias_pct = p1w
    elif mode == "uzun_vade":
        return_bias_pct = p1y
    elif mode == "radar":
        return_bias_pct = p1m
    else:
        return_bias_pct = day

    risk_input = abs(day) + (abs(p1w) * 0.45) + (abs(p1m) * 0.20)
    probability_fields = estimate_probability_fields(
        market="bist",
        signal_id=mode,
        score=score,
        confidence=score_confidence,
        return_bias_pct=return_bias_pct,
        excess_bias_pct=hakiki_alfa_pct,
        volatility_pct=risk_input,
    )
    probability_action = derive_probability_action(
        market="bist",
        signal_id=mode,
        probability_positive=float(probability_fields.get("probability_positive") or 0.5),
        expected_excess_return_pct=float(probability_fields.get("expected_excess_return_pct") or 0.0),
        default_action=action,
        default_horizon=horizon,
    )
    formula = get_formula_config("bist", mode)

    return {
        "score": round(score),
        "action": probability_action["action"],
        "horizon": probability_action["horizon"],
        "decision_band": probability_action["decision_band"],
        "thesis": (
            f"{_build_motor_note(mode, trend_score, liquidity_score, quality_score, hakiki_alfa_pct)} {entry_quality['note']}"
            if mode == "trade"
            else _build_motor_note(mode, trend_score, liquidity_score, quality_score, hakiki_alfa_pct)
        ),
        "risk": _risk_label(liquidity_score, rsi, hakiki_alfa_pct),
        "emphasis": round(emphasis, 2),
        "emphasis_label": emphasis_label,
        "drivers": drivers,
        "entry_quality_score": entry_quality["score"] if mode == "trade" else None,
        "entry_quality_label": entry_quality["label"] if mode == "trade" else None,
        "entry_note": entry_quality["note"] if mode == "trade" else None,
        "market": "bist",
        "signal_id": mode,
        "formula_version": formula.get("version"),
        **probability_fields,
    }


def compute_proprietary_scores(stock: dict[str, Any], global_reference: dict[str, Any]) -> dict[str, Any]:
    symbol_prediction_profile = get_bist_symbol_prediction_profile(str(stock.get("symbol") or ""))
    trend_score = compute_trend_score(stock)
    liquidity_score = compute_liquidity_score(stock)
    quality_score = compute_quality_score(stock)
    value_support_score = compute_value_support_score(stock)
    analyst_support_score = compute_analyst_support_score(stock)
    catalyst_score = compute_catalyst_score(stock)
    ownership_score = compute_ownership_score(stock)
    sector_context_score = compute_sector_context_score(stock)
    sector_leadership_score = compute_sector_leadership_score(stock)
    sector_separation_score = compute_sector_separation_score(stock)
    sector_acceleration_score = compute_sector_acceleration_score(stock)
    public_float_risk_score = compute_public_float_risk_score(stock)
    financial_resilience_score = compute_financial_resilience_score(stock)
    capital_discipline_score = compute_capital_discipline_score(stock)
    fair_value_snapshot = compute_fair_value_snapshot(
        stock,
        quality_score,
        financial_resilience_score,
        capital_discipline_score,
        sector_context_score,
    )
    fair_value_score = float(fair_value_snapshot.get("fair_value_score") or 50.0)
    trend_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["trend"])
    liquidity_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["liquidity"])
    quality_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["quality"])
    value_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["value"])
    analyst_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["analyst"])
    catalyst_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["catalyst"])
    ownership_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["ownership"])
    sector_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["sector"])
    float_risk_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["float_risk"])
    resilience_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["resilience"])
    capital_input_quality = _coverage_score(stock, FIELD_CONFIDENCE_RULES["capital"])
    global_confidence_score = float(global_reference.get("confidence_score") or 0.0)
    pre_score_confidence = round(
        (0.18 * trend_input_quality)
        + (0.12 * liquidity_input_quality)
        + (0.12 * quality_input_quality)
        + (0.09 * value_input_quality)
        + (0.07 * analyst_input_quality)
        + (0.05 * catalyst_input_quality)
        + (0.05 * ownership_input_quality)
        + (0.05 * sector_input_quality)
        + (0.04 * float_risk_input_quality)
        + (0.04 * resilience_input_quality)
        + (0.04 * capital_input_quality)
        + (0.15 * global_confidence_score),
        2,
    )
    confidence_penalty = (
        1.0
        if pre_score_confidence >= 85
        else 0.94
        if pre_score_confidence >= 70
        else 0.88
        if pre_score_confidence >= 55
        else 0.78
    )
    fair_value_data_band = str(fair_value_snapshot.get("fair_value_data_band") or "yetersiz_veri")
    if fair_value_data_band == "tahmini":
        fair_value_score = 50.0 + ((fair_value_score - 50.0) * 0.75)
    elif fair_value_data_band == "yetersiz_veri":
        fair_value_score = 50.0
    dividend_confidence_score = compute_dividend_confidence_score(stock)
    dividend_trap_risk = compute_dividend_trap_risk(stock, dividend_confidence_score)
    dividend_calendar_opportunity = compute_dividend_calendar_opportunity(stock, dividend_confidence_score)
    hakiki_alfa = compute_hakiki_alfa(stock, global_reference)
    hakiki_alfa_score = float(hakiki_alfa["hakiki_alfa_score"])
    regime = _market_regime(trend_score, liquidity_score, quality_score, stock)
    regime_label = compute_regime_label(stock, global_reference, trend_score, liquidity_score, quality_score)
    firsat_weights = _mode_weights_v2("firsatlar", regime_label)
    trade_weights = _mode_weights_v2("trade", regime_label)
    uzun_weights = _mode_weights_v2("uzun_vade", regime_label)
    radar_weights = _mode_weights_v2("radar", regime_label)

    firsat_skoru = _clamp(
        (firsat_weights["trend"] * trend_score)
        + (firsat_weights["liquidity"] * liquidity_score)
        + (firsat_weights["quality"] * quality_score)
        + (firsat_weights["hakiki"] * hakiki_alfa_score)
        + (firsat_weights["value"] * value_support_score)
        + ((sector_context_score - 50.0) * 0.10)
        + ((catalyst_score - 50.0) * 0.06)
        + ((analyst_support_score - 50.0) * 0.04)
        + ((fair_value_score - 50.0) * 0.08)
        + ((dividend_calendar_opportunity - 50.0) * 0.04)
        - ((public_float_risk_score - 50.0) * 0.08)
    )

    if float(hakiki_alfa["hakiki_alfa_pct"]) <= 0 and firsat_skoru >= 85:
        firsat_skoru = 79.0

    adx_bonus = _normalize_linear(_get_number(stock, "adx"), 10.0, 45.0)
    trade_entry_quality = _compute_trade_entry_quality(stock, float(hakiki_alfa["hakiki_alfa_pct"]))
    trade_skoru = _clamp(
        (trade_weights["trend"] * trend_score)
        + (trade_weights["liquidity"] * liquidity_score)
        + (trade_weights["quality"] * quality_score)
        + (trade_weights["hakiki"] * hakiki_alfa_score)
        + (trade_weights["value"] * adx_bonus)
        + ((trade_entry_quality["score"] - 50.0) * 0.18)
        + ((sector_context_score - 50.0) * 0.10)
        + ((catalyst_score - 50.0) * 0.08)
        + ((analyst_support_score - 50.0) * 0.05)
        + ((fair_value_score - 50.0) * 0.06)
        - ((dividend_trap_risk - 50.0) * 0.08)
        - ((public_float_risk_score - 50.0) * 0.16)
    )
    if trade_entry_quality["score"] < 40 and trade_skoru > 74:
        trade_skoru = 74.0
    uzun_vade_skoru = _clamp(
        (uzun_weights["quality"] * quality_score)
        + (uzun_weights["liquidity"] * liquidity_score)
        + (uzun_weights["value"] * value_support_score)
        + (uzun_weights["hakiki"] * hakiki_alfa_score)
        + (uzun_weights["trend"] * trend_score)
        + ((ownership_score - 50.0) * 0.10)
        + ((analyst_support_score - 50.0) * 0.08)
        + ((sector_context_score - 50.0) * 0.06)
        + ((financial_resilience_score - 50.0) * 0.14)
        + ((capital_discipline_score - 50.0) * 0.10)
        + ((fair_value_score - 50.0) * 0.16)
        + ((dividend_confidence_score - 50.0) * 0.08)
        - ((public_float_risk_score - 50.0) * 0.05)
    )
    radar_anchor = 100.0 - abs(trend_score - 58.0) * 1.25
    radar_skoru = _clamp(
        (0.35 * radar_anchor)
        + (radar_weights["hakiki"] * hakiki_alfa_score)
        + (0.20 * _score_rsi_balance(_get_number(stock, "rsi")))
        + (radar_weights["liquidity"] * liquidity_score)
        + (radar_weights["value"] * value_support_score)
        + ((catalyst_score - 50.0) * 0.12)
        + ((sector_context_score - 50.0) * 0.08)
        + ((fair_value_score - 50.0) * 0.05)
        + ((dividend_calendar_opportunity - 50.0) * 0.05)
        - ((public_float_risk_score - 50.0) * 0.08)
    )

    firsat_skoru = _clamp(50.0 + ((firsat_skoru - 50.0) * confidence_penalty))
    trade_skoru = _clamp(50.0 + ((trade_skoru - 50.0) * confidence_penalty))
    uzun_vade_skoru = _clamp(50.0 + ((uzun_vade_skoru - 50.0) * confidence_penalty))
    radar_skoru = _clamp(50.0 + ((radar_skoru - 50.0) * confidence_penalty))

    overall_learning_effect = _safe_float((symbol_prediction_profile or {}).get("overall_score_effect"))
    short_term_learning_effect = _safe_float((symbol_prediction_profile or {}).get("short_term_effect"))
    medium_term_learning_effect = _safe_float((symbol_prediction_profile or {}).get("medium_term_effect"))
    long_term_learning_effect = _safe_float((symbol_prediction_profile or {}).get("long_term_effect"))

    firsat_skoru = _clamp(
        firsat_skoru
        + (0.55 * overall_learning_effect)
        + (0.25 * medium_term_learning_effect)
    )
    trade_skoru = _clamp(
        trade_skoru
        + (0.90 * short_term_learning_effect)
        + (0.15 * overall_learning_effect)
    )
    uzun_vade_skoru = _clamp(
        uzun_vade_skoru
        + (0.95 * long_term_learning_effect)
        + (0.20 * overall_learning_effect)
    )
    radar_skoru = _clamp(
        radar_skoru
        + (0.35 * short_term_learning_effect)
        + (0.25 * medium_term_learning_effect)
    )

    if pre_score_confidence < 55:
        if firsat_skoru > 76:
            firsat_skoru = 76.0
        if trade_skoru > 72:
            trade_skoru = 72.0
        if uzun_vade_skoru > 74:
            uzun_vade_skoru = 74.0

    firsat_drivers = _driver_list("firsatlar", trend_score, liquidity_score, quality_score, value_support_score, hakiki_alfa_score, analyst_support_score, catalyst_score, ownership_score, sector_context_score, public_float_risk_score, financial_resilience_score, capital_discipline_score)
    trade_drivers = _driver_list("trade", trend_score, liquidity_score, quality_score, value_support_score, hakiki_alfa_score, analyst_support_score, catalyst_score, ownership_score, sector_context_score, public_float_risk_score, financial_resilience_score, capital_discipline_score)
    uzun_drivers = _driver_list("uzun_vade", trend_score, liquidity_score, quality_score, value_support_score, hakiki_alfa_score, analyst_support_score, catalyst_score, ownership_score, sector_context_score, public_float_risk_score, financial_resilience_score, capital_discipline_score)
    radar_drivers = _driver_list("radar", trend_score, liquidity_score, quality_score, value_support_score, hakiki_alfa_score, analyst_support_score, catalyst_score, ownership_score, sector_context_score, public_float_risk_score, financial_resilience_score, capital_discipline_score)
    portfolio_fit = compute_portfolio_fit_baseline(
        stock,
        firsat_skoru,
        trade_skoru,
        uzun_vade_skoru,
        float(hakiki_alfa["hakiki_alfa_pct"]),
        public_float_risk_score,
        financial_resilience_score,
        capital_discipline_score,
    )

    signals = {
        "firsatlar": _build_signal("firsatlar", firsat_skoru, stock, trend_score, liquidity_score, quality_score, hakiki_alfa, firsat_drivers, pre_score_confidence),
        "trade": _build_signal("trade", trade_skoru, stock, trend_score, liquidity_score, quality_score, hakiki_alfa, trade_drivers, pre_score_confidence),
        "uzun_vade": _build_signal("uzun_vade", uzun_vade_skoru, stock, trend_score, liquidity_score, quality_score, hakiki_alfa, uzun_drivers, pre_score_confidence),
        "radar": _build_signal("radar", radar_skoru, stock, trend_score, liquidity_score, quality_score, hakiki_alfa, radar_drivers, pre_score_confidence),
    }

    score_confidence = round(
        (0.18 * trend_input_quality)
        + (0.12 * liquidity_input_quality)
        + (0.12 * quality_input_quality)
        + (0.09 * value_input_quality)
        + (0.07 * analyst_input_quality)
        + (0.05 * catalyst_input_quality)
        + (0.05 * ownership_input_quality)
        + (0.05 * sector_input_quality)
        + (0.04 * float_risk_input_quality)
        + (0.04 * resilience_input_quality)
        + (0.04 * capital_input_quality)
        + (0.15 * global_confidence_score),
        2,
    )

    return {
        "trend_score": round(trend_score, 2),
        "liquidity_score": round(liquidity_score, 2),
        "quality_score": round(quality_score, 2),
        "value_support_score": round(value_support_score, 2),
        "analyst_support_score": round(analyst_support_score, 2),
        "catalyst_score": round(catalyst_score, 2),
        "kap_etki_skoru": round(catalyst_score, 2),
        "ownership_score": round(ownership_score, 2),
        "sahiplik_kalitesi_skoru": round(ownership_score, 2),
        "sector_context_score": round(sector_context_score, 2),
        "halka_aciklik_risk_skoru": round(public_float_risk_score, 2),
        "finansal_dayaniklilik_skoru": round(financial_resilience_score, 2),
        "sermaye_disiplini_skoru": round(capital_discipline_score, 2),
        "adil_deger": fair_value_snapshot,
        "adil_deger_skoru": round(fair_value_score, 2),
        "fair_value_confidence_band": fair_value_snapshot.get("fair_value_confidence_band"),
        "fair_value_data_band": fair_value_snapshot.get("fair_value_data_band"),
        "hakiki_alfa": hakiki_alfa,
        "firsat_skoru": round(firsat_skoru, 2),
        "trade_skoru": round(trade_skoru, 2),
        "uzun_vade_skoru": round(uzun_vade_skoru, 2),
        "radar_skoru": round(radar_skoru, 2),
        "prediction_memory": symbol_prediction_profile,
        "signals": signals,
        "market_regime": regime,
        "regime_label": regime_label,
        "temettu_guven_skoru": round(dividend_confidence_score, 2),
        "temettu_tuzagi_riski": round(dividend_trap_risk, 2),
        "temettu_takvim_firsati": round(dividend_calendar_opportunity, 2),
        "sektor_liderlik_skoru": round(sector_leadership_score, 2),
        "sektor_ayrisma_skoru": round(sector_separation_score, 2),
        "sektor_ivmelenme_skoru": round(sector_acceleration_score, 2),
        **portfolio_fit,
        "score_drivers": {
            "firsatlar": firsat_drivers,
            "trade": trade_drivers,
            "uzun_vade": uzun_drivers,
            "radar": radar_drivers,
        },
        "mode_weights": {
            "firsatlar": {key: round(value, 4) for key, value in firsat_weights.items()},
            "trade": {key: round(value, 4) for key, value in trade_weights.items()},
            "uzun_vade": {key: round(value, 4) for key, value in uzun_weights.items()},
            "radar": {key: round(value, 4) for key, value in radar_weights.items()},
        },
        "global_reference": {
            "as_of": global_reference.get("as_of"),
            "daily_return_pct": global_reference.get("daily_return_pct"),
            "core_daily_return_pct": global_reference.get("core_daily_return_pct", global_reference.get("daily_return_pct")),
            "total_trillion_usd": global_reference.get("total_trillion_usd"),
            "confidence_score": global_confidence_score,
            "confidence_label": global_reference.get("confidence_label"),
            "macro_regime_label": global_reference.get("macro_regime_label"),
            "macro_sidecar_items": global_reference.get("macro_sidecar_items", []),
        },
        "data_quality": {
            "score_confidence": score_confidence,
            "score_confidence_label": _label_from_score(score_confidence),
            "trend_input_quality": trend_input_quality,
            "liquidity_input_quality": liquidity_input_quality,
            "quality_input_quality": quality_input_quality,
            "value_input_quality": value_input_quality,
            "analyst_input_quality": analyst_input_quality,
            "catalyst_input_quality": catalyst_input_quality,
            "ownership_input_quality": ownership_input_quality,
            "sector_input_quality": sector_input_quality,
            "float_risk_input_quality": float_risk_input_quality,
            "resilience_input_quality": resilience_input_quality,
            "capital_input_quality": capital_input_quality,
            "global_reference_confidence": global_confidence_score,
        },
    }
