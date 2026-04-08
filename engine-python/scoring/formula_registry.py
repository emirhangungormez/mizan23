from __future__ import annotations

from typing import Any


FORMULA_REGISTRY_VERSION = "2026.04.08"

_REGISTRY: dict[tuple[str, str], dict[str, Any]] = {
    ("bist", "firsatlar"): {
        "market": "bist",
        "signal_id": "firsatlar",
        "version": "bist-firsatlar-v1",
        "horizon_days": 1,
        "horizon_label": "1 Gün",
        "inputs": [
            "trend_score",
            "liquidity_score",
            "quality_score",
            "hakiki_alfa_score",
            "value_support_score",
            "sector_context_score",
            "catalyst_score",
            "analyst_support_score",
            "fair_value_score",
            "dividend_calendar_opportunity",
            "public_float_risk_score",
        ],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "trend": 0.26,
            "liquidity": 0.14,
            "quality": 0.12,
            "hakiki": 0.14,
            "value": 0.12,
        },
        "caps_penalties": {
            "confidence_penalty": True,
            "float_risk_penalty": True,
            "negative_alpha_cap": True,
        },
        "confidence_rules": {
            "high": 85,
            "medium": 70,
            "low": 55,
        },
        "expected_output_range": [0, 100],
        "thresholds": {
            "strong_probability": 0.62,
            "watch_probability": 0.55,
            "weak_probability": 0.45,
        },
        "labels": {
            "strong_action": "1 Gün Güçlü",
            "watch_action": "1 Gün İzle",
            "weak_action": "1 Gün Zayıf",
        },
    },
    ("bist", "trade"): {
        "market": "bist",
        "signal_id": "trade",
        "version": "bist-trade-v1",
        "horizon_days": 5,
        "horizon_label": "5 Gün",
        "inputs": [
            "trend_score",
            "liquidity_score",
            "quality_score",
            "hakiki_alfa_score",
            "adx_bonus",
            "trade_entry_quality",
            "sector_context_score",
            "catalyst_score",
            "analyst_support_score",
            "fair_value_score",
            "dividend_trap_risk",
            "public_float_risk_score",
        ],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "trend": 0.24,
            "liquidity": 0.14,
            "quality": 0.10,
            "hakiki": 0.16,
            "entry_quality": 0.18,
        },
        "caps_penalties": {
            "confidence_penalty": True,
            "entry_quality_cap": True,
            "float_risk_penalty": True,
        },
        "confidence_rules": {
            "high": 85,
            "medium": 70,
            "low": 55,
        },
        "expected_output_range": [0, 100],
        "thresholds": {
            "strong_probability": 0.62,
            "watch_probability": 0.55,
            "weak_probability": 0.45,
        },
        "labels": {
            "strong_action": "5 Gün Güçlü",
            "watch_action": "5 Gün İzle",
            "weak_action": "5 Gün Zayıf",
        },
    },
    ("bist", "radar"): {
        "market": "bist",
        "signal_id": "radar",
        "version": "bist-radar-v1",
        "horizon_days": 30,
        "horizon_label": "30 Gün",
        "inputs": [
            "trend_score",
            "liquidity_score",
            "quality_score",
            "hakiki_alfa_score",
            "value_support_score",
            "sector_context_score",
            "catalyst_score",
        ],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "trend": 0.28,
            "liquidity": 0.14,
            "quality": 0.18,
            "hakiki": 0.16,
            "value": 0.10,
        },
        "caps_penalties": {
            "confidence_penalty": True,
        },
        "confidence_rules": {
            "high": 85,
            "medium": 70,
            "low": 55,
        },
        "expected_output_range": [0, 100],
        "thresholds": {
            "strong_probability": 0.60,
            "watch_probability": 0.54,
            "weak_probability": 0.45,
        },
        "labels": {
            "strong_action": "30 Gün Güçlü",
            "watch_action": "30 Gün İzle",
            "weak_action": "30 Gün Zayıf",
        },
    },
    ("bist", "uzun_vade"): {
        "market": "bist",
        "signal_id": "uzun_vade",
        "version": "bist-uzun-vade-v1",
        "horizon_days": 365,
        "horizon_label": "1 Yıl",
        "inputs": [
            "quality_score",
            "liquidity_score",
            "value_support_score",
            "hakiki_alfa_score",
            "trend_score",
            "ownership_score",
            "analyst_support_score",
            "sector_context_score",
            "financial_resilience_score",
            "capital_discipline_score",
            "fair_value_score",
        ],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "quality": 0.24,
            "value": 0.16,
            "hakiki": 0.14,
            "trend": 0.12,
            "resilience": 0.12,
            "capital": 0.10,
        },
        "caps_penalties": {
            "confidence_penalty": True,
        },
        "confidence_rules": {
            "high": 85,
            "medium": 70,
            "low": 55,
        },
        "expected_output_range": [0, 100],
        "thresholds": {
            "strong_probability": 0.62,
            "watch_probability": 0.56,
            "weak_probability": 0.45,
        },
        "labels": {
            "strong_action": "1 Yıl Güçlü",
            "watch_action": "1 Yıl İzle",
            "weak_action": "1 Yıl Zayıf",
        },
    },
    ("us", "market_signal"): {
        "market": "us",
        "signal_id": "market_signal",
        "version": "us-market-signal-v1",
        "horizon_days": 30,
        "horizon_label": "30 Gün",
        "inputs": ["momentum", "liquidity", "stability", "trend_quality", "fair_value", "hakiki_alfa"],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "momentum": 0.36,
            "liquidity": 0.16,
            "stability": 0.22,
            "trend_quality": 0.18,
            "valuation_bias": 0.08,
        },
        "caps_penalties": {"confidence_penalty": True},
        "confidence_rules": {"high": 85, "medium": 70, "low": 55},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.62, "watch_probability": 0.55, "weak_probability": 0.45},
        "labels": {"strong_action": "30 Gün Güçlü", "watch_action": "30 Gün İzle", "weak_action": "30 Gün Zayıf"},
    },
    ("crypto", "market_signal"): {
        "market": "crypto",
        "signal_id": "market_signal",
        "version": "crypto-market-signal-v1",
        "horizon_days": 5,
        "horizon_label": "5 Gün",
        "inputs": ["momentum", "liquidity", "stability", "structure", "reference_band", "hakiki_alfa"],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "momentum": 0.42,
            "liquidity": 0.22,
            "stability": 0.18,
            "structure": 0.18,
        },
        "caps_penalties": {"confidence_penalty": True},
        "confidence_rules": {"high": 80, "medium": 65, "low": 50},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.62, "watch_probability": 0.55, "weak_probability": 0.45},
        "labels": {"strong_action": "5 Gün Güçlü", "watch_action": "5 Gün İzle", "weak_action": "5 Gün Zayıf"},
    },
    ("commodities", "market_signal"): {
        "market": "commodities",
        "signal_id": "market_signal",
        "version": "commodities-market-signal-v1",
        "horizon_days": 30,
        "horizon_label": "30 Gün",
        "inputs": ["momentum", "liquidity", "stability", "macro_fit"],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "momentum": 0.40,
            "liquidity": 0.18,
            "stability": 0.22,
            "macro_fit": 0.20,
        },
        "caps_penalties": {"confidence_penalty": True},
        "confidence_rules": {"high": 85, "medium": 70, "low": 55},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.60, "watch_probability": 0.54, "weak_probability": 0.45},
        "labels": {"strong_action": "30 Gün Güçlü", "watch_action": "30 Gün İzle", "weak_action": "30 Gün Zayıf"},
    },
    ("funds", "market_signal"): {
        "market": "funds",
        "signal_id": "market_signal",
        "version": "funds-market-signal-v1",
        "horizon_days": 180,
        "horizon_label": "6 Ay",
        "inputs": ["momentum", "consistency", "profile_fit"],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "momentum": 0.42,
            "consistency": 0.32,
            "profile_fit": 0.26,
        },
        "caps_penalties": {"confidence_penalty": True},
        "confidence_rules": {"high": 85, "medium": 70, "low": 55},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.60, "watch_probability": 0.55, "weak_probability": 0.45},
        "labels": {"strong_action": "6 Ay Güçlü", "watch_action": "6 Ay İzle", "weak_action": "6 Ay Zayıf"},
    },
    ("portfolio", "conviction_score"): {
        "market": "portfolio",
        "signal_id": "conviction_score",
        "version": "portfolio-conviction-v1",
        "horizon_days": 30,
        "horizon_label": "Pozisyon",
        "inputs": ["firsat_score", "trade_score", "long_score", "radar_score", "hakiki_alfa_pct", "pnl_pct"],
        "normalization": "0-100 bounded weighted composite",
        "weights": {
            "trade": 0.31,
            "long": 0.26,
            "firsat": 0.18,
            "radar": 0.10,
            "alpha": 0.10,
            "pnl": 0.05,
        },
        "caps_penalties": {"snapshot_fallback": True},
        "confidence_rules": {"high": 80, "medium": 65, "low": 50},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.62, "watch_probability": 0.55, "weak_probability": 0.45},
        "labels": {"strong_action": "Hedefe Kadar Tut", "watch_action": "İzle", "weak_action": "Risk Azalt"},
    },
}


def get_formula_config(market: str, signal_id: str) -> dict[str, Any]:
    key = (str(market or "").lower(), str(signal_id or "").lower())
    config = _REGISTRY.get(key)
    if config:
        return dict(config)
    return {
        "market": key[0] or "unknown",
        "signal_id": key[1] or "unknown",
        "version": "generic-signal-v1",
        "horizon_days": 30,
        "horizon_label": "30 Gün",
        "inputs": [],
        "normalization": "0-100 bounded composite",
        "weights": {},
        "caps_penalties": {},
        "confidence_rules": {"high": 85, "medium": 70, "low": 55},
        "expected_output_range": [0, 100],
        "thresholds": {"strong_probability": 0.62, "watch_probability": 0.55, "weak_probability": 0.45},
        "labels": {"strong_action": "Güçlü", "watch_action": "İzle", "weak_action": "Zayıf"},
    }


def resolve_horizon_days(market: str, signal_id: str, fallback: int | None = None) -> int:
    config = get_formula_config(market, signal_id)
    horizon_days = int(config.get("horizon_days") or 0)
    if horizon_days > 0:
        return horizon_days
    return int(fallback or 30)


def list_formula_configs() -> list[dict[str, Any]]:
    return [dict(value) for value in _REGISTRY.values()]
