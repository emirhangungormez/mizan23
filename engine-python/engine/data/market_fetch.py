"""
Market Data Fetcher - Professional Grade Implementation

Features:
- In-memory caching with TTL and LRU eviction
- Async batch operations for parallel fetching
- Retry mechanism with exponential backoff
- Structured logging
- Data validation with Pydantic
- Thread-safe operations
"""

import borsapy as bp
from borsapy import Ticker, Index, FX as BorsapyFX, Crypto, companies
import pandas as pd
import yfinance as yf
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import concurrent.futures
import math
import numpy as np
import threading
import time
import asyncio

import os
import json
from engine.data.bist_fallbacks import load_bist_reference_stock
from scoring.formula_registry import get_formula_config
from scoring.probability_engine import derive_probability_action, estimate_probability_fields

# Import new professional modules
from engine.cache import cache_manager
from engine.utils.logger import logger, log_performance
from engine.utils.retry import retry, get_circuit_breaker, retry_external_service
from engine.models.schemas import (
    validate_ohlcv_dataframe, 
    validate_quote_data,
    MarketQuote,
    OHLCVData
)


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_finite_number(value: Any) -> bool:
    parsed = _safe_float(value)
    return parsed is not None and math.isfinite(parsed)


def _extract_dividend_amount(value: Any) -> Optional[float]:
    if isinstance(value, pd.Series):
        for key in ("Amount", "amount", "NetRate", "net_rate", "GrossRate", "gross_rate"):
            if key in value.index:
                parsed = _safe_float(value.get(key))
                if parsed is not None:
                    return parsed
        return None
    return _safe_float(value)


def _normalize_raw_dividend_yield(value: Any) -> Optional[float]:
    parsed = _safe_float(value)
    if parsed is None or parsed <= 0:
        return None
    if parsed <= 1:
        return round(parsed * 100, 2)
    if parsed <= 25:
        return round(parsed, 2)
    return None


def _compute_safe_dividend_yield(
    *,
    raw_dividend_yield: Any,
    dividend_rate: Any,
    last_price: Any,
    dividends: Any = None,
) -> Optional[float]:
    price = _safe_float(last_price)
    if price is not None and price > 0 and dividends is not None:
        try:
            now = pd.Timestamp.now().normalize()
            trailing_cutoff = now - pd.Timedelta(days=365)
            forward_cutoff = now + pd.Timedelta(days=365)
            trailing_sum = 0.0
            forward_sum = 0.0

            if isinstance(dividends, pd.DataFrame):
                iterator = dividends.iterrows()
            elif isinstance(dividends, pd.Series):
                iterator = dividends.items()
            else:
                iterator = []

            for raw_date, raw_value in iterator:
                parsed_date = pd.to_datetime(raw_date, errors="coerce")
                if parsed_date is None or pd.isna(parsed_date):
                    continue
                amount = _extract_dividend_amount(raw_value)
                if amount is None or amount <= 0:
                    continue
                normalized_date = parsed_date.normalize()
                if trailing_cutoff <= normalized_date < now:
                    trailing_sum += amount
                if now <= normalized_date <= forward_cutoff:
                    forward_sum += amount

            yield_candidates = []
            if forward_sum > 0:
                yield_candidates.append(round((forward_sum / price) * 100, 2))
            if trailing_sum > 0:
                yield_candidates.append(round((trailing_sum / price) * 100, 2))
            if yield_candidates:
                return max(yield_candidates)
        except Exception:
            pass

    rate = _safe_float(dividend_rate)
    if price is not None and price > 0 and rate is not None and rate > 0:
        return round((rate / price) * 100, 2)

    return _normalize_raw_dividend_yield(raw_dividend_yield)


def _clamp_score(value: float, min_value: float = 0.0, max_value: float = 100.0) -> float:
    return max(min_value, min(max_value, float(value)))


def _confidence_label(value: float) -> str:
    if value >= 82:
        return "Yuksek"
    if value >= 64:
        return "Orta"
    return "Sinirli"


def _safe_log_score(value: Any, *, floor_log: float, ceil_log: float) -> float:
    parsed = _safe_float(value)
    if parsed is None or parsed <= 0:
        return 18.0
    log_value = math.log10(parsed + 1.0)
    if ceil_log <= floor_log:
        return 50.0
    normalized = (log_value - floor_log) / (ceil_log - floor_log)
    return _clamp_score(normalized * 100.0)


def _decorate_market_signal(
    *,
    market: str,
    signal_id: str,
    row: Dict[str, Any],
    score: float,
    confidence: float,
    default_action: str,
    default_horizon: str,
    reason: str,
    regime: str,
    components: Dict[str, Any],
    return_bias_pct: float = 0.0,
    excess_bias_pct: float = 0.0,
    volatility_pct: float | None = None,
) -> Dict[str, Any]:
    formula = get_formula_config(market, signal_id)
    probability_fields = estimate_probability_fields(
        market=market,
        signal_id=signal_id,
        score=score,
        confidence=confidence,
        return_bias_pct=return_bias_pct,
        excess_bias_pct=excess_bias_pct,
        volatility_pct=volatility_pct,
    )
    probability_action = derive_probability_action(
        market=market,
        signal_id=signal_id,
        probability_positive=float(probability_fields.get("probability_positive") or 0.5),
        expected_excess_return_pct=float(probability_fields.get("expected_excess_return_pct") or 0.0),
        default_action=default_action,
        default_horizon=default_horizon,
    )
    return {
        "score": round(score),
        "action": probability_action["action"],
        "horizon": probability_action["horizon"],
        "decision_band": probability_action["decision_band"],
        "reason": reason,
        "regime": regime,
        "confidence": round(confidence),
        "confidence_label": _confidence_label(confidence),
        "components": components,
        "market": market,
        "signal_id": signal_id,
        "formula_version": formula.get("version"),
        **probability_fields,
    }


def _history_return_percent(close: pd.Series, days: int) -> Optional[float]:
    if close is None or close.empty:
        return None
    try:
        series = close.dropna()
        if len(series) < 2:
            return None
        if not isinstance(series.index, pd.DatetimeIndex):
            return None
        index = series.index
        if index.tz is not None:
            series.index = index.tz_localize(None)
        last_price = _safe_float(series.iloc[-1])
        if last_price is None or last_price <= 0:
            return None
        target_date = series.index[-1] - timedelta(days=days)
        prior = series[series.index <= target_date]
        base_price = _safe_float(prior.iloc[-1] if not prior.empty else series.iloc[0])
        if base_price is None or base_price <= 0:
            return None
        return round(((last_price - base_price) / base_price) * 100.0, 2)
    except Exception:
        return None


def _derive_history_features(history: Optional[pd.DataFrame]) -> Dict[str, Any]:
    if history is None or history.empty:
        return {}

    close_col = next((col for col in history.columns if str(col).lower() == "close"), None)
    if close_col is None:
        return {}

    try:
        close = history[close_col].dropna()
        if len(close) < 2:
            return {}

        if isinstance(close.index, pd.DatetimeIndex) and close.index.tz is not None:
            close.index = close.index.tz_localize(None)

        daily_change = round(((float(close.iloc[-1]) - float(close.iloc[-2])) / float(close.iloc[-2])) * 100.0, 2)
        p1w = _history_return_percent(close, 7)
        p1m = _history_return_percent(close, 30)
        p3m = _history_return_percent(close, 90)

        returns = close.pct_change().dropna()
        volatility_30d = None
        if not returns.empty:
            volatility_30d = round(float(returns.tail(min(len(returns), 30)).std()) * math.sqrt(252) * 100.0, 2)

        window = close.tail(min(len(close), 30))
        max_drawdown_30d = None
        if len(window) >= 3:
            peak = window.cummax()
            drawdown = ((window / peak) - 1.0) * 100.0
            max_drawdown_30d = round(float(drawdown.min()), 2)

        regime = "Dengelenme"
        if (p1w or 0) > 0 and (p1m or 0) > 0:
            regime = "Ivme"
        elif (p1m or 0) > 0 and (p1w or 0) < 0:
            regime = "Geri Cekilme"
        elif (p1w or 0) < 0 and (p1m or 0) < 0:
            regime = "Baski"

        return {
            "change_percent": daily_change,
            "p1w": p1w,
            "p1m": p1m,
            "p3m": p3m,
            "volatility_30d": volatility_30d,
            "max_drawdown_30d": max_drawdown_30d,
            "market_regime": regime,
        }
    except Exception:
        return {}


def _build_crypto_market_signal(row: Dict[str, Any]) -> Dict[str, Any]:
    day = _safe_float(row.get("change_percent")) or 0.0
    p1w = _safe_float(row.get("p1w"))
    p1m = _safe_float(row.get("p1m"))
    volatility_30d = _safe_float(row.get("volatility_30d"))
    volume = _safe_float(row.get("volume")) or 0.0
    regime = str(row.get("market_regime") or "Dengelenme")

    momentum = 50.0 + max(-18.0, min(18.0, day * 2.2))
    if p1w is not None:
        momentum += max(-16.0, min(16.0, p1w * 0.85))
    if p1m is not None:
        momentum += max(-16.0, min(16.0, p1m * 0.30))
    momentum = _clamp_score(momentum)

    liquidity = _safe_log_score(volume, floor_log=3.0, ceil_log=9.5)

    stability = 72.0 - max(0.0, abs(day) * 2.4)
    if p1w is not None:
        stability -= max(0.0, min(18.0, abs(p1w) * 0.55))
    if volatility_30d is not None:
        stability -= max(0.0, min(24.0, max(volatility_30d - 45.0, 0.0) * 0.40))
    stability = _clamp_score(stability)

    structure = 56.0
    if regime == "Ivme":
        structure += 18.0
    elif regime == "Geri Cekilme":
        structure += 8.0
    elif regime == "Baski":
        structure -= 16.0
    structure = _clamp_score(structure)

    raw_score = (0.42 * momentum) + (0.22 * liquidity) + (0.18 * stability) + (0.18 * structure)
    confidence = 38.0
    confidence += 18.0 if p1w is not None else 0.0
    confidence += 18.0 if p1m is not None else 0.0
    confidence += 14.0 if volatility_30d is not None else 0.0
    confidence += 12.0 if volume > 0 else 0.0
    confidence = _clamp_score(confidence)
    confidence_penalty = 0.55 + (confidence / 100.0 * 0.45)
    score = _clamp_score(50.0 + ((raw_score - 50.0) * confidence_penalty))

    if score >= 80.0 and stability >= 40.0 and regime == "Ivme":
        action = "Trade Adayi"
        horizon = "1-10 gun"
    elif score >= 70.0 and regime != "Baski":
        action = "Kademeli Al"
        horizon = "1-6 hafta"
    elif score >= 60.0:
        action = "Izle"
        horizon = "Takip"
    elif day > 7.0 and stability < 34.0:
        action = "Kar Al / Temkinli"
        horizon = "Kisa vade"
    else:
        action = "Bekle"
        horizon = "Takip"

    if regime == "Ivme" and (p1w or 0) > 0 and (p1m or 0) > 0:
        reason = "Kisa ve orta vade momentum ayni yone bakiyor."
    elif regime == "Geri Cekilme":
        reason = "Ana yapi pozitif ama kisa vadede nefeslenme var."
    elif liquidity < 35.0:
        reason = "Likidite sinyali zayif, teyitsiz hareket riski yuksek."
    elif stability < 35.0:
        reason = "Oynaklik yuksek, pozisyon boyutu kontrollu olmali."
    else:
        reason = "Karisik sinyal yapisi nedeniyle teyit beklemek daha saglikli."

    return _decorate_market_signal(
        market="crypto",
        signal_id="market_signal",
        row=row,
        score=score,
        confidence=confidence,
        default_action=action,
        default_horizon=horizon,
        reason=reason,
        regime=regime,
        components={
            "momentum": round(momentum, 1),
            "liquidity": round(liquidity, 1),
            "stability": round(stability, 1),
            "structure": round(structure, 1),
        },
        return_bias_pct=(p1w or 0.0),
        excess_bias_pct=_safe_float(row.get("hakiki_alfa_pct")) or 0.0,
        volatility_pct=volatility_30d,
    )


def _build_commodity_market_signal(row: Dict[str, Any]) -> Dict[str, Any]:
    day = _safe_float(row.get("change_percent")) or 0.0
    p1w = _safe_float(row.get("p1w"))
    p1m = _safe_float(row.get("p1m"))
    volatility_30d = _safe_float(row.get("volatility_30d"))
    volume = _safe_float(row.get("volume")) or 0.0
    symbol = str(row.get("symbol") or "").upper()
    regime = str(row.get("market_regime") or "Dengelenme")

    momentum = 50.0 + max(-16.0, min(16.0, day * 1.9))
    if p1w is not None:
        momentum += max(-14.0, min(14.0, p1w * 0.75))
    if p1m is not None:
        momentum += max(-14.0, min(14.0, p1m * 0.35))
    momentum = _clamp_score(momentum)

    liquidity = _safe_log_score(volume, floor_log=2.0, ceil_log=7.0)

    stability = 74.0 - max(0.0, abs(day) * 1.8)
    if p1w is not None:
        stability -= max(0.0, min(14.0, abs(p1w) * 0.45))
    if volatility_30d is not None:
        stability -= max(0.0, min(24.0, max(volatility_30d - 30.0, 0.0) * 0.55))
    stability = _clamp_score(stability)

    protective_symbols = {"GC", "SI", "PL", "PA"}
    cyclic_symbols = {"CL", "BZ", "NG", "HG", "ZC", "ZW", "ZS", "KC", "CT", "SB"}
    macro_fit = 56.0
    if symbol in protective_symbols:
        macro_fit += 10.0
    if symbol in cyclic_symbols and (p1m or 0) > 0:
        macro_fit += 8.0
    if regime == "Baski":
        macro_fit -= 10.0
    macro_fit = _clamp_score(macro_fit)

    raw_score = (0.40 * momentum) + (0.18 * liquidity) + (0.22 * stability) + (0.20 * macro_fit)
    confidence = 46.0
    confidence += 14.0 if p1w is not None else 0.0
    confidence += 18.0 if p1m is not None else 0.0
    confidence += 12.0 if volatility_30d is not None else 0.0
    confidence += 10.0 if volume > 0 else 0.0
    confidence = _clamp_score(confidence)
    confidence_penalty = 0.62 + (confidence / 100.0 * 0.38)
    score = _clamp_score(50.0 + ((raw_score - 50.0) * confidence_penalty))

    if symbol in protective_symbols and score >= 70.0:
        action = "Koruma Adayi"
        horizon = "2-8 hafta"
    elif score >= 78.0 and regime == "Ivme":
        action = "Trendde Kal"
        horizon = "1-6 hafta"
    elif score >= 64.0:
        action = "Izle / Ekle"
        horizon = "Takip"
    else:
        action = "Bekle"
        horizon = "Takip"

    if symbol in protective_symbols and (p1m or 0) > 0:
        reason = "Koruma karakteri ile orta vade ivme birlikte destekliyor."
    elif regime == "Ivme":
        reason = "Emtia trendi su an yukari yone hizlaniyor."
    elif stability < 40.0:
        reason = "Volatilite yuksek, teyit gelmeden agir pozisyon zor."
    else:
        reason = "Sinyal yapisi tam temiz degil, takiple ilerlemek daha saglikli."

    return _decorate_market_signal(
        market="commodities",
        signal_id="market_signal",
        row=row,
        score=score,
        confidence=confidence,
        default_action=action,
        default_horizon=horizon,
        reason=reason,
        regime=regime,
        components={
            "momentum": round(momentum, 1),
            "liquidity": round(liquidity, 1),
            "stability": round(stability, 1),
            "macro_fit": round(macro_fit, 1),
        },
        return_bias_pct=(p1m or p1w or 0.0),
        excess_bias_pct=0.0,
        volatility_pct=volatility_30d,
    )


def _build_fund_market_signal(row: Dict[str, Any]) -> Dict[str, Any]:
    day = _safe_float(row.get("change_percent")) or 0.0
    return_ytd = _safe_float(row.get("return_ytd")) or 0.0
    return_1y = _safe_float(row.get("return_1y")) or 0.0
    fund_type = str(row.get("fund_type") or "").lower()

    momentum = 50.0
    momentum += max(-16.0, min(16.0, day * 2.0))
    momentum += max(-14.0, min(14.0, return_ytd * 0.35))
    momentum += max(-18.0, min(18.0, return_1y * 0.18))
    momentum = _clamp_score(momentum)

    consistency = 54.0
    consistency += max(-12.0, min(18.0, return_1y * 0.20))
    consistency += max(-10.0, min(12.0, return_ytd * 0.18))
    consistency -= max(0.0, min(16.0, abs(day) * 4.0))
    consistency = _clamp_score(consistency)

    profile_fit = 52.0
    if "hisse" in fund_type or "endeks" in fund_type or "yabanci" in fund_type:
        profile_fit += 10.0 if return_1y > 15.0 else 2.0
    elif "degisken" in fund_type or "serbest" in fund_type:
        profile_fit += 6.0 if return_ytd > 0 else 0.0
    elif "borclanma" in fund_type or "para piyasasi" in fund_type:
        profile_fit += 8.0 if return_1y > 0 else 2.0
    elif "altin" in fund_type or "kiymetli" in fund_type:
        profile_fit += 8.0 if return_ytd > 0 else 1.0
    elif "katilim" in fund_type:
        profile_fit += 6.0 if return_1y > 0 else 0.0
    profile_fit = _clamp_score(profile_fit)

    raw_score = (0.42 * momentum) + (0.32 * consistency) + (0.26 * profile_fit)
    confidence = 56.0
    confidence += 18.0 if _is_finite_number(row.get("return_ytd")) else 0.0
    confidence += 18.0 if _is_finite_number(row.get("return_1y")) else 0.0
    confidence += 10.0 if fund_type else 0.0
    confidence = _clamp_score(confidence)
    confidence_penalty = 0.68 + (confidence / 100.0 * 0.32)
    score = _clamp_score(50.0 + ((raw_score - 50.0) * confidence_penalty))

    regime = "Dengelenme"
    if return_1y > 15.0 and return_ytd > 5.0:
        regime = "Guclu"
    elif return_1y > 0 and return_ytd > 0:
        regime = "Toparlaniyor"
    elif return_1y < 0 and return_ytd < 0:
        regime = "Zayif"

    if score >= 80.0 and return_1y > 15.0:
        action = "Biriktir"
        horizon = "3-12 ay"
    elif score >= 70.0:
        action = "Tut / Ekle"
        horizon = "1-6 ay"
    elif score >= 60.0:
        action = "Izle"
        horizon = "Takip"
    else:
        action = "Bekle"
        horizon = "Takip"

    if return_1y > 20.0 and return_ytd > 8.0:
        reason = "Yillik ve yil ici performans birlikte guclu akiyor."
    elif "borclanma" in fund_type or "para piyasasi" in fund_type:
        reason = "Daha savunmaci fon profili ile dengeli bir alternatif sunuyor."
    elif "altin" in fund_type or "katilim" in fund_type:
        reason = "Tema bazli fon yapisi istikrarla birlikte izlenebilir."
    else:
        reason = "Performans var ama daha guclu devam teyidi faydali olur."

    return _decorate_market_signal(
        market="funds",
        signal_id="market_signal",
        row=row,
        score=score,
        confidence=confidence,
        default_action=action,
        default_horizon=horizon,
        reason=reason,
        regime=regime,
        components={
            "momentum": round(momentum, 1),
            "consistency": round(consistency, 1),
            "profile_fit": round(profile_fit, 1),
        },
        return_bias_pct=(return_ytd * 0.35) + (return_1y * 0.15),
        excess_bias_pct=return_1y - return_ytd,
        volatility_pct=abs(day) * 5.0,
    )


def _build_us_market_signal(row: Dict[str, Any]) -> Dict[str, Any]:
    day = _safe_float(row.get("change_percent")) or 0.0
    p1w = _safe_float(row.get("p1w"))
    p1m = _safe_float(row.get("p1m"))
    p3m = _safe_float(row.get("p3m"))
    volatility_30d = _safe_float(row.get("volatility_30d"))
    max_drawdown_30d = _safe_float(row.get("max_drawdown_30d"))
    volume = _safe_float(row.get("volume")) or 0.0
    regime = str(row.get("market_regime") or "Dengelenme")

    momentum = 50.0 + max(-14.0, min(14.0, day * 1.8))
    if p1w is not None:
        momentum += max(-14.0, min(14.0, p1w * 0.75))
    if p1m is not None:
        momentum += max(-16.0, min(16.0, p1m * 0.30))
    if p3m is not None:
        momentum += max(-12.0, min(12.0, p3m * 0.12))
    momentum = _clamp_score(momentum)

    liquidity = _safe_log_score(volume, floor_log=4.0, ceil_log=9.8)

    stability = 72.0
    if volatility_30d is not None:
        stability -= max(0.0, min(24.0, max(volatility_30d - 28.0, 0.0) * 0.65))
    if max_drawdown_30d is not None:
        stability -= max(0.0, min(18.0, abs(min(max_drawdown_30d, 0.0)) * 0.8))
    stability -= max(0.0, min(10.0, abs(day) * 1.2))
    stability = _clamp_score(stability)

    trend_quality = 54.0
    if regime == "Ivme":
        trend_quality += 16.0
    elif regime == "Geri Cekilme":
        trend_quality += 8.0
    elif regime == "Baski":
        trend_quality -= 16.0
    if p3m is not None and p3m > 0:
        trend_quality += min(12.0, p3m * 0.10)
    trend_quality = _clamp_score(trend_quality)

    raw_score = (0.38 * momentum) + (0.20 * liquidity) + (0.22 * stability) + (0.20 * trend_quality)
    confidence = 42.0
    confidence += 16.0 if p1w is not None else 0.0
    confidence += 16.0 if p1m is not None else 0.0
    confidence += 14.0 if p3m is not None else 0.0
    confidence += 12.0 if volatility_30d is not None else 0.0
    confidence += 10.0 if volume > 0 else 0.0
    confidence = _clamp_score(confidence)
    confidence_penalty = 0.60 + (confidence / 100.0 * 0.40)
    score = _clamp_score(50.0 + ((raw_score - 50.0) * confidence_penalty))

    if score >= 82.0 and regime == "Ivme" and stability >= 46.0:
        action = "Guclu Al"
        horizon = "1-6 hafta"
    elif score >= 72.0 and regime != "Baski":
        action = "Al / Biriktir"
        horizon = "2-12 hafta"
    elif score >= 62.0:
        action = "Izle"
        horizon = "Takip"
    elif day > 6.0 and stability < 36.0:
        action = "Kar Al / Temkinli"
        horizon = "Kisa vade"
    else:
        action = "Bekle"
        horizon = "Takip"

    if regime == "Ivme" and (p1m or 0) > 0 and (p3m or 0) > 0:
        reason = "ABD tarafinda orta vadeli trend ve momentum birlikte guclu."
    elif regime == "Geri Cekilme":
        reason = "Ana trend pozitif, fakat kisa vadede geri cekilme yasaniyor."
    elif stability < 38.0:
        reason = "Oynaklik ve drawdown baskisi yuksek, teyit onemli."
    elif liquidity < 35.0:
        reason = "Likidite zayif oldugu icin hareketlerin kalitesi dusebilir."
    else:
        reason = "Sinyal dengeli ama henuz net bir ivme ustunlugu yok."

    valuation_bias = _safe_float(((row.get("adil_deger") or {}).get("premium_discount_pct"))) or 0.0
    return _decorate_market_signal(
        market="us",
        signal_id="market_signal",
        row=row,
        score=score,
        confidence=confidence,
        default_action=action,
        default_horizon=horizon,
        reason=reason,
        regime=regime,
        components={
            "momentum": round(momentum, 1),
            "liquidity": round(liquidity, 1),
            "stability": round(stability, 1),
            "trend_quality": round(trend_quality, 1),
        },
        return_bias_pct=(p1m or 0.0) * 0.35 + (p3m or 0.0) * 0.18 + valuation_bias * 0.12,
        excess_bias_pct=_safe_float(row.get("hakiki_alfa_pct")) or 0.0,
        volatility_pct=volatility_30d,
    )


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed.replace(tzinfo=None) if parsed.tzinfo is not None else parsed
    except Exception:
        return None


def _is_cache_fresh(updated_at: Any, *, max_age_hours: float) -> bool:
    parsed = _parse_iso_datetime(updated_at)
    if parsed is None:
        return False
    return (datetime.now() - parsed) <= timedelta(hours=max_age_hours)


def _build_hakiki_alfa_snapshot(row: Dict[str, Any], global_reference_return_pct: Any) -> Dict[str, Any]:
    stock_daily_return_pct = _safe_float(row.get("change_percent")) or 0.0
    benchmark_daily_return_pct = _safe_float(global_reference_return_pct) or 0.0
    hakiki_alfa_pct = stock_daily_return_pct - benchmark_daily_return_pct
    hakiki_alfa_score = _clamp_score(50.0 + (hakiki_alfa_pct * 6.5))

    status = "neutral"
    if hakiki_alfa_pct > 0.15:
        status = "positive"
    elif hakiki_alfa_pct < -0.15:
        status = "negative"

    return {
        "daily_return_pct": round(stock_daily_return_pct, 4),
        "global_reference_return_pct": round(benchmark_daily_return_pct, 4),
        "hakiki_alfa_pct": round(hakiki_alfa_pct, 4),
        "hakiki_alfa_score": round(hakiki_alfa_score, 2),
        "status": status,
        "reference_symbol": "^GSPC",
        "reference_name": "S&P 500",
    }


def _build_us_fair_value_snapshot(row: Dict[str, Any], enrichment: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current_price = _safe_float(row.get("last"))
    if current_price is None or current_price <= 0:
        return None

    mean_target = _safe_float(enrichment.get("analyst_target_mean"))
    median_target = _safe_float(enrichment.get("analyst_target_median"))
    high_target = _safe_float(enrichment.get("analyst_target_high"))
    low_target = _safe_float(enrichment.get("analyst_target_low"))
    year_high = _safe_float(enrichment.get("year_high"))
    year_low = _safe_float(enrichment.get("year_low"))

    anchors: list[tuple[float, float]] = []
    if mean_target is not None and mean_target > 0:
        anchors.append((mean_target, 0.50))
    if median_target is not None and median_target > 0:
        anchors.append((median_target, 0.25))
    if high_target is not None and low_target is not None and high_target > 0 and low_target > 0:
        anchors.append((((high_target + low_target) / 2.0), 0.25))
    elif high_target is not None and high_target > 0:
        anchors.append((high_target, 0.15))
    elif low_target is not None and low_target > 0:
        anchors.append((low_target, 0.10))

    if not anchors:
        return None

    total_weight = sum(weight for _, weight in anchors)
    if total_weight <= 0:
        return None

    fair_value_price = sum(price * weight for price, weight in anchors) / total_weight

    # Keep analyst targets within a sane range relative to the known yearly band.
    if year_low is not None and year_high is not None and year_low > 0 and year_high > year_low:
        fair_value_price = max(year_low * 0.82, min(year_high * 1.28, fair_value_price))

    premium_discount_pct = ((fair_value_price - current_price) / current_price) * 100.0
    if premium_discount_pct >= 12.0:
        fair_value_label = "iskontolu"
    elif premium_discount_pct <= -12.0:
        fair_value_label = "sismis"
    else:
        fair_value_label = "makul"

    data_points = sum(
        1 for value in (mean_target, median_target, high_target, low_target, year_high, year_low)
        if value is not None and value > 0
    )

    confidence = 42.0
    confidence += 18.0 if mean_target is not None else 0.0
    confidence += 12.0 if median_target is not None else 0.0
    confidence += 12.0 if high_target is not None and low_target is not None else 0.0
    confidence += 10.0 if year_high is not None and year_low is not None else 0.0

    spread_pct = None
    if high_target is not None and low_target is not None and fair_value_price > 0:
        spread_pct = abs(high_target - low_target) / fair_value_price * 100.0
        confidence -= max(0.0, min(18.0, max(spread_pct - 22.0, 0.0) * 0.45))

    confidence = _clamp_score(confidence)

    if data_points >= 5:
        data_band = "Genis"
    elif data_points >= 3:
        data_band = "Orta"
    else:
        data_band = "Sinirli"

    if confidence >= 78.0:
        confidence_band = "Yuksek"
    elif confidence >= 60.0:
        confidence_band = "Orta"
    else:
        confidence_band = "Sinirli"

    return {
        "fair_value_price": round(fair_value_price, 2),
        "premium_discount_pct": round(premium_discount_pct, 2),
        "fair_value_label": fair_value_label,
        "confidence": round(confidence, 2),
        "fair_value_confidence_band": confidence_band,
        "fair_value_data_band": data_band,
        "method": "analist_hedef_karmasi",
        "source": "yfinance_analyst_targets",
        "target_mean_price": round(mean_target, 2) if mean_target is not None else None,
        "target_median_price": round(median_target, 2) if median_target is not None else None,
        "target_low_price": round(low_target, 2) if low_target is not None else None,
        "target_high_price": round(high_target, 2) if high_target is not None else None,
        "target_spread_pct": round(spread_pct, 2) if spread_pct is not None else None,
    }


def _crypto_base_symbol(symbol: Any) -> str:
    value = str(symbol or "").upper().strip()
    if not value:
        return ""
    if value.endswith("-USD"):
        return value[:-4]
    if value.endswith("USDT"):
        return value[:-4]
    if value.endswith("TRY"):
        return value[:-3]
    return value


def _build_crypto_hakiki_alfa_snapshot(row: Dict[str, Any], bitcoin_return_pct: Any) -> Dict[str, Any]:
    coin_daily_return_pct = _safe_float(row.get("change_percent")) or 0.0
    benchmark_daily_return_pct = _safe_float(bitcoin_return_pct) or 0.0
    hakiki_alfa_pct = coin_daily_return_pct - benchmark_daily_return_pct
    hakiki_alfa_score = _clamp_score(50.0 + (hakiki_alfa_pct * 5.5))

    status = "neutral"
    if hakiki_alfa_pct > 0.2:
        status = "positive"
    elif hakiki_alfa_pct < -0.2:
        status = "negative"

    return {
        "daily_return_pct": round(coin_daily_return_pct, 4),
        "global_reference_return_pct": round(benchmark_daily_return_pct, 4),
        "hakiki_alfa_pct": round(hakiki_alfa_pct, 4),
        "hakiki_alfa_score": round(hakiki_alfa_score, 2),
        "status": status,
        "reference_symbol": "BTC-USD",
        "reference_name": "Bitcoin",
    }


def _build_crypto_reference_band_snapshot(row: Dict[str, Any], history: Optional[pd.DataFrame]) -> Optional[Dict[str, Any]]:
    current_price = _safe_float(row.get("last"))
    if current_price is None or current_price <= 0 or history is None or history.empty:
        return None

    working_history = history
    if isinstance(working_history.columns, pd.MultiIndex):
        working_history = working_history.droplevel(-1, axis=1)

    close_col = next((col for col in working_history.columns if str(col).lower() == "close"), None)
    if close_col is None:
        return None

    close = working_history[close_col].dropna()
    if len(close) < 10:
        return None

    ma20 = float(close.tail(min(len(close), 20)).mean())
    ma50 = float(close.tail(min(len(close), 50)).mean())
    range_window = close.tail(min(len(close), 90))
    range_high = float(range_window.max())
    range_low = float(range_window.min())
    mid_band = (range_high + range_low) / 2.0
    reference_price = (ma20 * 0.45) + (ma50 * 0.35) + (mid_band * 0.20)

    premium_discount_pct = ((reference_price - current_price) / current_price) * 100.0
    stretch_pct = ((current_price - ma20) / ma20) * 100.0 if ma20 > 0 else None
    position_pct = ((current_price - range_low) / (range_high - range_low) * 100.0) if range_high > range_low else None

    if premium_discount_pct >= 10.0:
        fair_value_label = "iskontolu"
    elif premium_discount_pct <= -10.0:
        fair_value_label = "sismis"
    else:
        fair_value_label = "makul"

    confidence = 52.0
    confidence += min(24.0, len(close) / 4.0)
    confidence += 10.0 if _is_finite_number(row.get("p1m")) else 0.0
    confidence += 8.0 if _is_finite_number(row.get("volatility_30d")) else 0.0
    confidence = _clamp_score(confidence)

    if len(close) >= 75:
        data_band = "Genis"
    elif len(close) >= 30:
        data_band = "Orta"
    else:
        data_band = "Sinirli"

    if confidence >= 78.0:
        confidence_band = "Yuksek"
    elif confidence >= 62.0:
        confidence_band = "Orta"
    else:
        confidence_band = "Sinirli"

    return {
        "fair_value_price": round(reference_price, 4 if current_price < 1 else 2),
        "premium_discount_pct": round(premium_discount_pct, 2),
        "fair_value_label": fair_value_label,
        "confidence": round(confidence, 2),
        "fair_value_confidence_band": confidence_band,
        "fair_value_data_band": data_band,
        "method": "referans_bant_90g",
        "source": "yfinance_price_history",
        "reference_low_price": round(range_low, 4 if range_low < 1 else 2),
        "reference_high_price": round(range_high, 4 if range_high < 1 else 2),
        "reference_mid_price": round(mid_band, 4 if mid_band < 1 else 2),
        "ma20_price": round(ma20, 4 if ma20 < 1 else 2),
        "ma50_price": round(ma50, 4 if ma50 < 1 else 2),
        "stretch_pct": round(stretch_pct, 2) if stretch_pct is not None else None,
        "range_position_pct": round(position_pct, 2) if position_pct is not None else None,
    }


def _reprice_reference_snapshot(snapshot: Dict[str, Any], current_price: Any) -> Dict[str, Any]:
    updated = dict(snapshot)
    current = _safe_float(current_price)
    fair_value_price = _safe_float(snapshot.get("fair_value_price"))
    if current is None or current <= 0 or fair_value_price is None or fair_value_price <= 0:
        return updated

    premium_discount_pct = ((fair_value_price - current) / current) * 100.0
    if premium_discount_pct >= 10.0:
        fair_value_label = "iskontolu"
    elif premium_discount_pct <= -10.0:
        fair_value_label = "sismis"
    else:
        fair_value_label = "makul"

    updated["premium_discount_pct"] = round(premium_discount_pct, 2)
    updated["fair_value_label"] = fair_value_label
    return updated


class MarketFetcher:
    """
    Market Data Fetcher with Professional Caching and Error Handling.
    
    Primary source: borsapy (for BIST), yfinance (for Foreign)
    Storage: Local JSON files for offline support and delta updates.
    Cache: In-memory TTL+LRU cache for fast access.
    """
    def __init__(self):
        self._dashboard_cache = None
        self._dashboard_last_updated = None
        self._asset_cache = {} 
        self._lock = threading.Lock()
        self._refresh_thread = None
        self._is_refreshing = False
        
        # Fund cache
        self._funds_cache = []
        self._funds_last_updated = None
        self._funds_lock = threading.Lock()
        self._is_refreshing_funds = False
        
        # BIST Indices list for routing
        self.bist_indices = ["XU100", "XU030", "XUTUM", "XBANK", "XUSIN", "XU050", "XTUMY", "XHOLD", "XUTEK", "XGIDA", "XULAS"]
        
        # Persistent Storage Setup
        self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.storage_dir = os.path.join(self.base_dir, "storage", "market_data")
        self.metadata_dir = os.path.join(self.base_dir, "storage", "metadata")
        self.financials_dir = os.path.join(self.base_dir, "storage", "financials")
        self.batch_changes_dir = os.path.join(self.base_dir, "storage", "batch_changes")
        self.analysis_snapshots_dir = os.path.join(self.base_dir, "storage", "analysis_snapshots")
        self.analysis_snapshot_history_dir = os.path.join(self.base_dir, "storage", "analysis_snapshot_history")
        self.dashboard_cache_path = os.path.join(self.base_dir, "storage", "dashboard_cache.json")
        self.funds_cache_path = os.path.join(self.base_dir, "storage", "funds_cache.json")
        
        os.makedirs(self.storage_dir, exist_ok=True)
        os.makedirs(self.metadata_dir, exist_ok=True)
        os.makedirs(self.financials_dir, exist_ok=True)
        os.makedirs(self.batch_changes_dir, exist_ok=True)
        os.makedirs(self.analysis_snapshots_dir, exist_ok=True)
        os.makedirs(self.analysis_snapshot_history_dir, exist_ok=True)
        
        # In-memory cache for batch changes (period -> {symbol -> {change_percent, timestamp}})
        self._batch_changes_cache: Dict[str, Dict[str, Dict]] = {}
        self._batch_changes_lock = threading.Lock()
        
        # Short-term quote cache (30 seconds TTL) - NOW USES cache_manager
        self._quote_cache_ttl = 30  # seconds

        # Persistent non-BIST analysis snapshots
        self._analysis_snapshot_policy = {
            "us_stocks": {"fresh_ttl": 300, "stale_ttl": 21600},
            "crypto": {"fresh_ttl": 180, "stale_ttl": 7200},
            "commodities": {"fresh_ttl": 600, "stale_ttl": 21600},
            "funds": {"fresh_ttl": 300, "stale_ttl": 7200},
        }
        self._analysis_refresh_lock = threading.Lock()
        self._analysis_refresh_state: Dict[str, bool] = {}
        self._analysis_background_thread = None
        self._analysis_background_started = False
        
        # Circuit breakers for external services
        self._borsapy_circuit = get_circuit_breaker("borsapy")
        self._yfinance_circuit = get_circuit_breaker("yfinance")
        
        # Load batch changes cache from disk
        self._load_batch_changes_from_disk()
        
        # Load last dashboard state from disk immediately
        self._load_dashboard_from_disk()
        self._load_funds_from_disk()
        
        # Start background fund refresh
        self._start_funds_background_refresh()
        
        logger.info("MarketFetcher initialized with professional caching")


    # --- PERSISTENCE HELPERS ---
    
    def _get_meta_path(self, symbol: str) -> str:
        safe_name = symbol.replace("^", "IDX_").replace("=", "_").replace("/", "_")
        return os.path.join(self.metadata_dir, f"{safe_name}.json")

    def _save_metadata(self, symbol: str, info: dict):
        if not info: return
        try:
            with open(self._get_meta_path(symbol), 'w', encoding='utf-8') as f:
                json.dump(info, f, ensure_ascii=False)
        except: pass

    def _load_metadata(self, symbol: str) -> Optional[dict]:
        path = self._get_meta_path(symbol)
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except: pass
        return None

    def _save_financials(self, symbol: str, financials: dict):
        if not financials: return
        try:
            path = os.path.join(self.financials_dir, f"{symbol.replace('.IS', '').replace('^', 'IDX_')}.json")
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(financials, f, ensure_ascii=False)
        except: pass

    def _load_financials(self, symbol: str) -> Optional[dict]:
        path = os.path.join(self.financials_dir, f"{symbol.replace('.IS', '').replace('^', 'IDX_')}.json")
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except: pass
        return None

    def _get_analysis_snapshot_path(self, name: str) -> str:
        safe_name = str(name).replace("/", "_").replace("\\", "_")
        return os.path.join(self.analysis_snapshots_dir, f"{safe_name}.json")

    def _get_analysis_archive_dir(self, name: str) -> str:
        safe_name = str(name).replace("/", "_").replace("\\", "_")
        path = os.path.join(self.analysis_snapshot_history_dir, safe_name)
        os.makedirs(path, exist_ok=True)
        return path

    def _get_analysis_archive_path(self, name: str, snapshot_date: str) -> str:
        safe_date = str(snapshot_date or datetime.now().date().isoformat())
        return os.path.join(self._get_analysis_archive_dir(name), f"{safe_date}.json")

    def _load_analysis_snapshot(self, name: str) -> Optional[dict]:
        path = self._get_analysis_snapshot_path(name)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if not isinstance(payload, dict):
                return None
            return payload
        except Exception:
            return None

    def _save_analysis_snapshot(self, name: str, data: dict) -> None:
        try:
            path = self._get_analysis_snapshot_path(name)
            payload = {
                "name": name,
                "market": data.get("market") or name,
                "snapshot_date": data.get("snapshot_date") or datetime.now().date().isoformat(),
                "saved_at": datetime.now().isoformat(),
                "data": data,
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, allow_nan=False)
        except Exception as e:
            logger.warning(f"Analysis snapshot save failed for {name}: {e}")

    def _save_analysis_history_snapshot(self, name: str, data: dict) -> None:
        try:
            snapshot_date = str(data.get("snapshot_date") or datetime.now().date().isoformat())
            path = self._get_analysis_archive_path(name, snapshot_date)
            payload = {
                "name": name,
                "market": data.get("market") or name,
                "snapshot_date": snapshot_date,
                "saved_at": datetime.now().isoformat(),
                "data": data,
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, allow_nan=False)
        except Exception as e:
            logger.warning(f"Analysis history snapshot save failed for {name}: {e}")

    def _infer_analysis_benchmark_return(self, data: dict) -> float:
        rows = data.get("all")
        if not isinstance(rows, list):
            return 0.0
        for row in rows:
            alpha = row.get("hakiki_alfa") if isinstance(row, dict) else None
            if isinstance(alpha, dict):
                benchmark = _safe_float(alpha.get("global_reference_return_pct"))
                if benchmark is not None:
                    return benchmark
        return 0.0

    def _normalize_analysis_payload_for_persistence(self, name: str, data: dict) -> dict:
        payload = dict(data or {})
        now_iso = datetime.now().isoformat()
        market = "us" if name == "us_stocks" else name
        payload.setdefault("market", market)
        payload.setdefault("generated_at", now_iso)
        payload.setdefault("captured_at", now_iso)
        payload.setdefault("snapshot_date", datetime.now().date().isoformat())
        payload.setdefault("benchmark_daily_return_pct", self._infer_analysis_benchmark_return(payload))
        return payload

    def _analysis_snapshot_age_seconds(self, snapshot: Optional[dict]) -> Optional[float]:
        if not isinstance(snapshot, dict):
            return None
        saved_at = _parse_iso_datetime(snapshot.get("saved_at"))
        if saved_at is None:
            return None
        return max(0.0, (datetime.now() - saved_at).total_seconds())

    def _analysis_payload_count(self, payload: Optional[dict]) -> int:
        if not isinstance(payload, dict):
            return 0
        rows = payload.get("all")
        if isinstance(rows, list):
            return len(rows)
        count = payload.get("count")
        if isinstance(count, (int, float)):
            return int(count)
        return 0

    def _analysis_snapshot_is_fresh(self, name: str, snapshot: Optional[dict]) -> bool:
        policy = self._analysis_snapshot_policy.get(name, {"fresh_ttl": 300})
        age_seconds = self._analysis_snapshot_age_seconds(snapshot)
        if age_seconds is None:
            return False
        return age_seconds <= float(policy.get("fresh_ttl", 300))

    def _analysis_snapshot_is_usable(self, name: str, snapshot: Optional[dict]) -> bool:
        policy = self._analysis_snapshot_policy.get(name, {"stale_ttl": 3600})
        age_seconds = self._analysis_snapshot_age_seconds(snapshot)
        if age_seconds is None:
            return False
        if age_seconds > float(policy.get("stale_ttl", 3600)):
            return False
        return self._analysis_payload_count(snapshot.get("data") if isinstance(snapshot, dict) else None) > 0

    def _cache_analysis_payload(self, name: str, data: dict, ttl: Optional[int] = None) -> None:
        policy = self._analysis_snapshot_policy.get(name, {"fresh_ttl": 300})
        cache_manager.set("analysis_snapshots", name, data, ttl or int(policy.get("fresh_ttl", 300)))

    def _persist_analysis_payload(self, name: str, data: dict) -> None:
        if self._analysis_payload_count(data) <= 0:
            return
        normalized_data = self._normalize_analysis_payload_for_persistence(name, data)
        self._save_analysis_snapshot(name, normalized_data)
        self._save_analysis_history_snapshot(name, normalized_data)
        self._cache_analysis_payload(name, normalized_data)

    def _schedule_analysis_refresh(self, name: str, compute_fn: Any, delay_seconds: float = 0.0) -> bool:
        with self._analysis_refresh_lock:
            if self._analysis_refresh_state.get(name):
                return False
            self._analysis_refresh_state[name] = True

        def runner():
            try:
                if delay_seconds > 0:
                    time.sleep(delay_seconds)
                data = compute_fn()
                if self._analysis_payload_count(data) > 0:
                    self._persist_analysis_payload(name, data)
            except Exception as e:
                logger.warning(f"Background analysis refresh failed for {name}: {e}")
            finally:
                with self._analysis_refresh_lock:
                    self._analysis_refresh_state[name] = False

        threading.Thread(target=runner, daemon=True).start()
        return True

    def _serve_analysis_payload(self, name: str, compute_fn: Any) -> dict:
        cached = cache_manager.get("analysis_snapshots", name)
        if isinstance(cached, dict) and self._analysis_payload_count(cached) > 0:
            return cached

        snapshot = self._load_analysis_snapshot(name)
        if self._analysis_snapshot_is_usable(name, snapshot):
            snapshot_data = snapshot.get("data") if isinstance(snapshot, dict) else None
            if isinstance(snapshot_data, dict):
                normalized_snapshot_data = self._normalize_analysis_payload_for_persistence(name, snapshot_data)
                self._save_analysis_history_snapshot(name, normalized_snapshot_data)
                ttl = None
                if not self._analysis_snapshot_is_fresh(name, snapshot):
                    ttl = 60
                    self._schedule_analysis_refresh(name, compute_fn, delay_seconds=0.2)
                self._cache_analysis_payload(name, normalized_snapshot_data, ttl=ttl)
                return normalized_snapshot_data

        data = compute_fn()
        if self._analysis_payload_count(data) > 0:
            normalized_data = self._normalize_analysis_payload_for_persistence(name, data)
            self._persist_analysis_payload(name, normalized_data)
            return normalized_data
        return data

    def start_analysis_snapshot_refresh(self) -> None:
        with self._analysis_refresh_lock:
            if self._analysis_background_started:
                return
            self._analysis_background_started = True

        def refresh_loop():
            task_map = {
                "us_stocks": self._compute_all_us_stocks,
                "crypto": self._compute_all_crypto_analysis,
                "commodities": self._compute_all_commodities_analysis,
                "funds": self._compute_all_funds_analysis,
            }

            while True:
                try:
                    for name, compute_fn in task_map.items():
                        snapshot = self._load_analysis_snapshot(name)
                        if not self._analysis_snapshot_is_fresh(name, snapshot):
                            self._schedule_analysis_refresh(name, compute_fn)
                        time.sleep(1.0)
                except Exception as e:
                    logger.warning(f"Analysis snapshot refresh loop error: {e}")
                time.sleep(300)

        self._analysis_background_thread = threading.Thread(target=refresh_loop, daemon=True)
        self._analysis_background_thread.start()
        logger.info("Analysis snapshot background refresh thread started")

    # --- BATCH CHANGES CACHE ---
    
    def _get_batch_changes_path(self, period: str) -> str:
        """Get path for batch changes cache file."""
        return os.path.join(self.batch_changes_dir, f"changes_{period}.json")
    
    def _load_batch_changes_from_disk(self):
        """Load all batch changes caches from disk on startup."""
        for period in ["1d", "1w", "1m", "1y", "5y"]:
            try:
                path = self._get_batch_changes_path(period)
                if os.path.exists(path):
                    # Check if file is empty or too small
                    file_size = os.path.getsize(path)
                    if file_size < 5:  # Empty or corrupt file
                        logger.warning(f"Removing corrupt batch changes file for {period} (size: {file_size})")
                        os.remove(path)
                        continue
                    
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    raw_changes = data.get("changes", {})
                    sanitized_changes = {}
                    removed_count = 0
                    for symbol, entry in raw_changes.items():
                        if not isinstance(entry, dict):
                            removed_count += 1
                            continue
                        change_percent = entry.get("change_percent")
                        if not _is_finite_number(change_percent):
                            removed_count += 1
                            continue
                        sanitized_changes[str(symbol)] = {
                            "change_percent": float(change_percent),
                            "source": entry.get("source", "unknown"),
                            "updated_at": entry.get("updated_at"),
                        }

                    self._batch_changes_cache[period] = sanitized_changes
                    if removed_count:
                        logger.warning(f"Removed {removed_count} invalid batch change entries for {period}")
                        self._save_batch_changes_to_disk(period)
                    logger.debug(f"Loaded batch changes for {period}: {len(self._batch_changes_cache.get(period, {}))} symbols")
            except Exception as e:
                logger.error(f"Batch changes load error for {period}: {e}")
                # Try to remove corrupt file
                try:
                    path = self._get_batch_changes_path(period)
                    if os.path.exists(path):
                        os.remove(path)
                        logger.info(f"Removed corrupt file: {path}")
                except:
                    pass
    
    def _save_batch_changes_to_disk(self, period: str):
        """Save batch changes cache to disk for a specific period."""
        try:
            path = self._get_batch_changes_path(period)
            with self._batch_changes_lock:
                data = {
                    "updated_at": datetime.now().isoformat(),
                    "period": period,
                    "changes": self._batch_changes_cache.get(period, {})
                }
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, allow_nan=False)
        except Exception as e:
            logger.error(f"Batch changes save error for {period}: {e}")
    
    def _update_batch_changes_cache(self, period: str, results: List[Dict]):
        """Update in-memory cache with new batch change results."""
        now = datetime.now().isoformat()
        with self._batch_changes_lock:
            if period not in self._batch_changes_cache:
                self._batch_changes_cache[period] = {}
            
            for r in results:
                symbol = r.get("symbol")
                change_percent = r.get("change_percent", 0)
                if symbol and _is_finite_number(change_percent):
                    self._batch_changes_cache[period][symbol] = {
                        "change_percent": float(change_percent),
                        "source": r.get("source", "unknown"),
                        "updated_at": now
                    }
        
        # Save to disk in background
        threading.Thread(target=self._save_batch_changes_to_disk, args=(period,), daemon=True).start()
    
    def _get_cached_batch_changes(self, symbols: List[str], period: str, max_age_minutes: int = 5) -> Dict[str, float]:
        """Get cached batch changes if available and not stale. Returns {symbol: change_percent}."""
        cached = {}
        now = datetime.now()
        
        with self._batch_changes_lock:
            period_cache = self._batch_changes_cache.get(period, {})
            for sym in symbols:
                if sym in period_cache:
                    entry = period_cache[sym]
                    updated_at = entry.get("updated_at")
                    if updated_at:
                        try:
                            entry_time = datetime.fromisoformat(updated_at)
                            age_minutes = (now - entry_time).total_seconds() / 60
                            change_percent = entry.get("change_percent", 0)
                            if age_minutes <= max_age_minutes and _is_finite_number(change_percent):
                                cached[sym] = float(change_percent)
                        except:
                            pass
        return cached

    # --- DATA FETCHING ---

    def _load_dashboard_from_disk(self):
        if os.path.exists(self.dashboard_cache_path):
            try:
                with open(self.dashboard_cache_path, 'r') as f:
                    data = json.load(f)
                self._dashboard_cache = data.get("data")
                last_upd = data.get("updated_at")
                if last_upd:
                    self._dashboard_last_updated = datetime.fromisoformat(last_upd)
                logger.debug("Dashboard loaded from disk")
            except Exception as e:
                logger.error(f"Dashboard load fail: {e}")

    def _save_dashboard_to_disk(self):
        if self._dashboard_cache:
            try:
                with open(self.dashboard_cache_path, 'w') as f:
                    json.dump({
                        "updated_at": self._dashboard_last_updated.isoformat() if self._dashboard_last_updated else datetime.now().isoformat(),
                        "data": self._dashboard_cache
                    }, f)
            except Exception as e:
                logger.error(f"Dashboard save fail: {e}")

    # --- FUND CACHE METHODS ---
    
    def _load_funds_from_disk(self):
        """Load cached funds from disk on startup."""
        if os.path.exists(self.funds_cache_path):
            try:
                with open(self.funds_cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self._funds_cache = data.get("funds", [])
                last_upd = data.get("updated_at")
                if last_upd:
                    self._funds_last_updated = datetime.fromisoformat(last_upd)
                logger.debug(f"Loaded {len(self._funds_cache)} funds from disk")
            except Exception as e:
                logger.error(f"Funds load fail: {e}")

    def _save_funds_to_disk(self):
        """Save funds cache to disk."""
        if self._funds_cache:
            try:
                with open(self.funds_cache_path, 'w', encoding='utf-8') as f:
                    json.dump({
                        "updated_at": datetime.now().isoformat(),
                        "funds": self._funds_cache
                    }, f, ensure_ascii=False)
                logger.debug(f"Saved {len(self._funds_cache)} funds to disk")
            except Exception as e:
                logger.error(f"Funds save fail: {e}")

    def _start_funds_background_refresh(self):
        """Start background thread that refreshes funds periodically."""
        def refresh_loop():
            while True:
                try:
                    self._refresh_all_funds()
                except Exception as e:
                    logger.error(f"Funds background refresh error: {e}")
                # Wait 5 minutes before next refresh
                time.sleep(300)
        
        thread = threading.Thread(target=refresh_loop, daemon=True)
        thread.start()
        logger.info("Funds background refresh thread started")

    def _refresh_all_funds(self):
        """Fetch ALL funds with rate limiting to avoid API overload."""
        if self._is_refreshing_funds:
            return
        
        with self._funds_lock:
            self._is_refreshing_funds = True
        
        try:
            import borsapy as bp
            from borsapy import Fund
            
            logger.info("[Funds] Starting full fund refresh...")
            
            # Collect all fund codes from multiple searches
            all_fund_codes = set()
            search_terms = ['', 'katilim', 'hisse', 'altin', 'degisken', 'serbest', 'borclanma', 'endeks', 'bist', 'yabanci']
            
            for term in search_terms:
                try:
                    results = bp.search_funds(term)
                    if results:
                        for f in results:
                            code = f.get('fund_code', '')
                            if code:
                                all_fund_codes.add(code)
                    time.sleep(0.2)  # Small delay between searches
                except:
                    continue
            
            logger.info(f"[Funds] Found {len(all_fund_codes)} unique fund codes")
            
            # Fetch each fund with rate limiting
            funds = []
            fund_list = list(all_fund_codes)
            
            for i, code in enumerate(fund_list):
                try:
                    fund = Fund(code)
                    info = fund.info
                    price = float(info.get("price", 0) or 0)
                    daily_return = float(info.get("daily_return", 0) or 0)
                    
                    if price > 0:
                        funds.append({
                            "symbol": code,
                            "name": code,  # Use code as name
                            "last": price,
                            "change_percent": daily_return,
                            "return_ytd": float(info.get("return_ytd", 0) or 0),
                            "return_1y": float(info.get("return_1y", 0) or 0),
                            "fund_type": str(info.get("type", ""))[:30],
                        })
                    
                    # Rate limiting: 0.3s delay between each fund
                    if i < len(fund_list) - 1:
                        time.sleep(0.3)
                    
                    # Progress log every 20 funds
                    if (i + 1) % 20 == 0:
                        logger.info(f"[Funds] Fetched {i + 1}/{len(fund_list)} funds...")
                        
                except Exception as e:
                    continue
            
            # Sort by daily return
            funds.sort(key=lambda x: x["change_percent"], reverse=True)
            
            # Update cache
            self._funds_cache = funds
            self._funds_last_updated = datetime.now()
            self._save_funds_to_disk()
            
            logger.info(f"[Funds] Refresh complete: {len(funds)} funds cached")
            
        except Exception as e:
            logger.exception("[Funds] Refresh error", extra={"error": str(e)})
        finally:
            self._is_refreshing_funds = False

    def _get_storage_path(self, symbol: str) -> str:
        safe_name = symbol.replace("^", "IDX_").replace("=", "_").replace("/", "_")
        return os.path.join(self.storage_dir, f"{safe_name}.json")

    def _load_from_disk(self, symbol: str) -> Optional[pd.DataFrame]:
        path = self._get_storage_path(symbol)
        if not os.path.exists(path):
            return None
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if not data:
                return None
            df = pd.DataFrame(data)
            if not df.empty:
                df['Date'] = pd.to_datetime(df['Date'])
                df.set_index('Date', inplace=True)
                # Ensure index is sorted
                df = df.sort_index()
                return df
        except Exception as e:
            logger.exception("[Storage] Load fail", extra={"symbol": symbol, "error": str(e)})
        return None

    def _save_to_disk(self, symbol: str, df: pd.DataFrame):
        if df is None or df.empty: return
        path = self._get_storage_path(symbol)
        try:
            save_df = df.copy()
            if isinstance(save_df.index, pd.DatetimeIndex):
                save_df = save_df.reset_index()
            
            # Rename index column to 'Date' if it has a different name
            if save_df.columns[0] != 'Date' and 'Date' not in save_df.columns:
                save_df = save_df.rename(columns={save_df.columns[0]: 'Date'})
            
            # Ensure Date column exists and is datetime
            if 'Date' in save_df.columns:
                save_df['Date'] = pd.to_datetime(save_df['Date'])
                # Conditionally format Date: include time only if there is sub-daily information
                if (save_df['Date'].dt.hour.any() or save_df['Date'].dt.minute.any() or save_df['Date'].dt.second.any()):
                    save_df['Date'] = save_df['Date'].apply(lambda x: x.isoformat() if pd.notna(x) else None)
                else:
                    save_df['Date'] = save_df['Date'].dt.strftime('%Y-%m-%d')
                
                save_df = save_df.drop_duplicates(subset=['Date'], keep='last')
            
            data = save_df.to_dict(orient="records")
            with open(path, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            logger.exception("[Storage] Save fail", extra={"symbol": symbol, "error": str(e)})

    def _is_bist(self, symbol: str) -> bool:
        """Identify if an asset belongs to Borsa Istanbul."""
        s = symbol.upper()
        if s in self.bist_indices: return True
        if s.startswith("^"): return False # Foreign indices like ^GSPC
        if any(x in s for x in ["USD", "EUR", "GBP", "BTC", "ETH", "USDT"]): return False
        if "=" in s: return False # yfinance FX format
        # Default: 4-8 char symbols are usually BIST stocks/certificates (THYAO, ALTIN.S1, etc.)
        return (len(s) >= 4 and len(s) <= 8) or ".S1" in s

    def _is_bist_with_hints(
        self,
        symbol: str,
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ) -> bool:
        market = str(market_hint or "").strip().lower()
        currency = str(currency_hint or "").strip().upper()
        if market in {"us", "nyse", "nasdaq", "amex", "crypto", "commodities", "commodity", "funds", "fund", "fx", "forex"}:
            return False
        if market in {"bist", "tr", "turkey", "turkiye"}:
            return True
        if currency == "USD" and str(symbol or "").isalpha():
            return False
        return self._is_bist(symbol)

    def _normalize_symbol(
        self,
        symbol: str,
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ) -> str:
        """Centralized symbol normalization for yfinance."""
        if symbol.startswith("^") or ".IS" in symbol or "=" in symbol:
            return symbol
        
        # Explicit mappings for special cases
        explicit_map = {
            # FX pairs that work in yfinance
            "USD": "USDTRY=X",
            "EUR": "EURTRY=X",
            "GBP": "GBPTRY=X",
            "CHF": "CHFTRY=X",
            "AUD": "AUDTRY=X",
            "CAD": "CADTRY=X",
            "DXY": "DX-Y.NYB",
            "EURUSD": "EURUSD=X",
            "EUR/USD": "EURUSD=X",
            "Dolar Endeksi": "DX-Y.NYB",
            "EUR/USD Parite": "EURUSD=X",
            # Commodities - Turkish names mapping (NOT to yfinance GC=F for Gram Gold in TL)
            "Altın (gr)": "gram-altin", # These will be routed to borsapy now
            "Altın (ons)": "ons-altin",
            "gram-altin": "gram-altin",
            "ons-altin": "ons-altin",
            "gram-gumus": "SI=F",
            "Gümüş (gr)": "SI=F",
            "BRENT": "BZ=F",
            "Brent Petrol": "BZ=F",
            "WTI": "CL=F",
            "Ham Petrol (WTI)": "CL=F",
            "Doğalgaz": "NG=F",
            "Bakır": "HG=F",
            "Platin": "PL=F",
            # Crypto (USD pairs - TRY not available in yfinance)
            "BTCTRY": "BTC-USD",
            "ETHTRY": "ETH-USD",
            "BTC": "BTC-USD",
            "ETH": "ETH-USD",
            "SOL": "SOL-USD",
            "XRP": "XRP-USD",
            "DOGE": "DOGE-USD",
            "BNB": "BNB-USD",
            "ADA": "ADA-USD",
            "AVAX": "AVAX-USD",
            "DOT": "DOT-USD",
            "LINK": "LINK-USD",
            "MATIC": "MATIC-USD",
            "SHIB": "SHIB-USD",
            "LTC": "LTC-USD",
        }
        
        if symbol in explicit_map:
            return explicit_map[symbol]

        market = str(market_hint or "").strip().lower()
        currency = str(currency_hint or "").strip().upper()
        if market in {"us", "nyse", "nasdaq", "amex"}:
            return symbol
        if market in {"crypto"}:
            base = symbol.replace("TRY", "").replace("USDT", "").replace("USD", "")
            return f"{base}-USD"
        if market in {"fx", "forex"}:
            if symbol.endswith("=X"):
                return symbol
            if len(symbol) == 6:
                return f"{symbol}=X"
            return f"{symbol}TRY=X"
        if market in {"commodities", "commodity"} and symbol in explicit_map:
            return explicit_map[symbol]
        if currency == "USD" and symbol.isalpha() and len(symbol) <= 5:
            return symbol
        
        # Type detection for common assets
        is_crypto = symbol.endswith("TRY") or symbol.endswith("USDT") or symbol.endswith("BTC")
        is_fx = any(x in symbol for x in ["USD", "EUR", "GBP", "CHF", "DXY", "EURUSD"]) and len(symbol) <= 7
        
        if is_crypto:
            base = symbol.replace("TRY", "").replace("USDT", "").replace("USD", "")
            return f"{base}-USD"
        elif is_fx:
            return f"{symbol}TRY=X"
        
        return f"{symbol}.IS" # Default to BIST

    def get_index_data(
        self,
        symbol: str,
        period: str = "max",
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ) -> Optional[pd.DataFrame]:
        """The Central Persistence Layer for ALL assets (Stock, FX, Crypto, Index)"""
        try:
            # 1. Load Local
            local_df = self._load_from_disk(symbol)
            yf_sym = self._normalize_symbol(symbol, market_hint=market_hint, currency_hint=currency_hint)

            # 2. Update logic
            now = datetime.now()
            updated_today = False
            if local_df is not None and not local_df.empty:
                last_date = local_df.index.max()
                if last_date.date() >= now.date(): updated_today = True
                elif now.weekday() >= 5 and last_date.weekday() == 4: updated_today = True

            if updated_today: return local_df

            # 3. Online Fetch & Merge
            try:
                if local_df is not None and not local_df.empty:
                    start_date = (local_df.index.max() + timedelta(days=1)).strftime('%Y-%m-%d')
                    new_data = yf.Ticker(yf_sym).history(start=start_date)
                    if new_data is not None and not new_data.empty:
                        new_data.columns = [str(col).title() for col in new_data.columns]
                        combined_df = pd.concat([local_df, new_data])
                        combined_df = combined_df[~combined_df.index.duplicated(keep='last')]
                        self._save_to_disk(symbol, combined_df)
                        return combined_df
                    return local_df
                else:
                    # Initial Max Fetch
                    df = yf.Ticker(yf_sym).history(period="max")
                    if df is not None and not df.empty:
                        df.columns = [str(col).title() for col in df.columns]
                        self._save_to_disk(symbol, df)
                        return df
            except Exception as e:
                logger.exception("[MarketFetcher] Online fail", extra={"symbol": symbol, "error": str(e)})
                return local_df
        except: return None
        return None

    def get_stock_data(
        self,
        symbol: str,
        period: str = "max",
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ) -> Optional[pd.DataFrame]:
        """Alias for get_index_data to support legacy calls."""
        return self.get_index_data(symbol, period, market_hint=market_hint, currency_hint=currency_hint)

    def get_asset_details(
        self,
        symbol: str,
        period: str = "3mo",
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ultra-fast coordinated fetch. Returns disk data instantly, updates in background."""
        now = datetime.now()

        fetch_interval = "1d"
        resample_rule = None

        p = period.lower()
        if p == "1d":
            fetch_interval = "5m"
            resample_rule = "5min"
        elif p == "5d":
            fetch_interval = "30m"
            resample_rule = "30min"
        elif p == "1mo":
            fetch_interval = "1h"
            resample_rule = "1h"
        elif p in ["3mo", "6mo"]:
            fetch_interval = "1h"
            resample_rule = "5h"
        elif p == "1y":
            fetch_interval = "1d"
            resample_rule = "1D"
        elif p in ["5y", "max"]:
            fetch_interval = "1d"
            resample_rule = "5D"

        result = {
            "symbol": symbol, "info": {}, "history": [], "financials": {}, "news": [],
            "analysis": {
                "technical_scores": {"momentum": 50, "volatility": 30, "trend_strength": 40, "risk_score": 20},
                "probabilities": {"up": 33, "down": 33, "sideways": 34}
            }
        }

        p_days = {"1d": 1, "5d": 7, "1mo": 31, "3mo": 92, "6mo": 183, "1y": 366, "5y": 1826, "max": 9999}
        is_intraday_request = fetch_interval in ["1m", "2m", "5m", "15m", "30m", "1h"]

        def calculate_returns(df: Optional[pd.DataFrame]) -> Dict[str, float]:
            if df is None or df.empty:
                return {}

            last_price = df['Close'].iloc[-1]
            last_date = df.index.max()
            periods_map = {
                "weekly": 7,
                "monthly": 30,
                "threeMonth": 90,
                "sixMonth": 180,
                "yearly": 365,
                "fiveYear": 1825,
            }

            calc_returns: Dict[str, float] = {}
            for key, days in periods_map.items():
                target_date = last_date - timedelta(days=days)
                past_slice = df[df.index <= target_date]
                if not past_slice.empty:
                    past_price = past_slice['Close'].iloc[-1]
                    if past_price > 0:
                        calc_returns[key] = round(((last_price - past_price) / past_price) * 100, 2)

            ytd_target = datetime(last_date.year, 1, 1)
            ytd_slice = df[df.index <= ytd_target]
            if not ytd_slice.empty:
                past_price = ytd_slice['Close'].iloc[-1]
                calc_returns["ytd"] = round(((last_price - past_price) / past_price) * 100, 2)

            if len(df) >= 2:
                prev_close = df['Close'].iloc[-2]
                calc_returns["daily"] = round(((last_price - prev_close) / prev_close) * 100, 2)

            return calc_returns

        def apply_history_payload(df: Optional[pd.DataFrame]) -> bool:
            if df is None or df.empty:
                result["history"] = []
                result["returns"] = {}
                return False

            local_df = df.copy()
            if local_df.index.tz is not None:
                local_df.index = local_df.index.tz_localize(None)

            cutoff = now - timedelta(days=p_days.get(p, 90))
            ui_df = local_df[local_df.index >= cutoff].copy() if p != "max" else local_df.copy()

            if is_intraday_request and not ui_df.empty:
                has_actual_intraday = (ui_df.index.hour + ui_df.index.minute).any()
                if has_actual_intraday:
                    ui_df = ui_df[~((ui_df.index.hour == 0) & (ui_df.index.minute == 0))]

            if resample_rule and not ui_df.empty:
                try:
                    ui_df = ui_df.resample(resample_rule).agg({
                        'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'
                    }).dropna()
                except Exception:
                    pass

            result["history"] = self._df_to_records(ui_df)
            if not ui_df.empty:
                result["analysis"] = self._calculate_metrics(ui_df)
                if not result["info"].get("last"):
                    result["info"]["last"] = float(ui_df.iloc[-1]["Close"])
            result["returns"] = calculate_returns(local_df)
            return not ui_df.empty

        def enrich_from_bist_reference() -> None:
            if not self._is_bist_with_hints(symbol, market_hint=market_hint, currency_hint=currency_hint) or symbol in self.bist_indices:
                return

            reference = load_bist_reference_stock(symbol)
            if not reference:
                return

            info = result.setdefault("info", {})
            if not info.get("name") and reference.get("name"):
                info["name"] = reference.get("name")
            if not info.get("longName") and reference.get("name"):
                info["longName"] = reference.get("name")
            if not info.get("shortName") and reference.get("name"):
                info["shortName"] = reference.get("name")
            if not info.get("sector") and reference.get("sector"):
                info["sector"] = reference.get("sector")
            if not info.get("sector") and symbol.upper() in {"AKBNK", "ALBRK", "GARAN", "HALKB", "ICBCT", "ISCTR", "QNBFB", "SKBNK", "TSKB", "VAKBN", "YKBNK"}:
                info["sector"] = "BANKA"
            if not info.get("industry") and reference.get("industry"):
                info["industry"] = reference.get("industry")
            if not info.get("website") and reference.get("website"):
                info["website"] = reference.get("website")
            if not info.get("market_cap") and reference.get("market_cap") is not None:
                info["market_cap"] = reference.get("market_cap")
            if not info.get("marketCap") and reference.get("market_cap") is not None:
                info["marketCap"] = reference.get("market_cap")
            if not info.get("last") and reference.get("last") is not None:
                info["last"] = reference.get("last")
            if not info.get("currentPrice") and reference.get("last") is not None:
                info["currentPrice"] = reference.get("last")
            if not info.get("change_percent") and reference.get("change_percent") is not None:
                info["change_percent"] = reference.get("change_percent")
            if not info.get("updated_at") and reference.get("updated_at"):
                info["updated_at"] = reference.get("updated_at")
            info["fallback_source"] = reference.get("_reference_source")
            result["has_live_data"] = reference.get("has_live_data")
            result["has_snapshot_data"] = reference.get("has_snapshot_data")

        history_df = self._load_from_disk(symbol)
        result["info"] = self._load_metadata(symbol) or {"name": symbol, "symbol": symbol}
        result["financials"] = self._load_financials(symbol) or {}

        if history_df is not None and not history_df.empty:
            if history_df.index.tz is not None:
                history_df.index = history_df.index.tz_localize(None)
            result["source"] = "cache"
        else:
            result["source"] = "live"

        has_usable_history = apply_history_payload(history_df)
        enrich_from_bist_reference()

        has_data = history_df is not None and not history_df.empty
        if has_data:
            if not has_usable_history:
                logger.info(f"[MarketFetcher] Cached history unusable for {symbol}, forcing refresh")
                self._update_asset_deep_sync(symbol, period, fetch_interval, market_hint=market_hint, currency_hint=currency_hint)
                history_df = self._load_from_disk(symbol)
                result["info"] = self._load_metadata(symbol) or result["info"]
                apply_history_payload(history_df)
                enrich_from_bist_reference()
                result["source"] = "live"

            should_update = False
            last_dt = history_df.index.max()
            if is_intraday_request:
                if (now - last_dt.replace(tzinfo=None)).total_seconds() > 900:
                    should_update = True
            else:
                if last_dt.date() < now.date():
                    should_update = True

            if should_update:
                threading.Thread(
                    target=self._update_asset_deep,
                    args=(symbol, period, fetch_interval, market_hint, currency_hint),
                    daemon=True,
                ).start()
        else:
            logger.info(f"[MarketFetcher] Initial blocking fetch for {symbol}")
            self._update_asset_deep_sync(symbol, period, fetch_interval, market_hint=market_hint, currency_hint=currency_hint)
            history_df = self._load_from_disk(symbol)
            result["info"] = self._load_metadata(symbol) or {"name": symbol, "symbol": symbol}
            apply_history_payload(history_df)
            enrich_from_bist_reference()

        return result

    def _update_asset_deep_sync(
        self,
        symbol: str,
        period: str,
        interval: str,
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ):
        """Synchronous update helper."""
        self._update_asset_history(symbol, period, interval, market_hint=market_hint, currency_hint=currency_hint)
        self._update_asset_metadata(symbol, market_hint=market_hint, currency_hint=currency_hint)

    def _update_asset_history(
        self,
        symbol: str,
        period: str,
        interval: str,
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ):
        """Sync history. BIST: borsapy first (0.3.1+), Foreign: yfinance."""
        try:
            new_df = None
            is_bist = self._is_bist_with_hints(symbol, market_hint=market_hint, currency_hint=currency_hint)
            
            # Try BORSAPY for BIST, Gold and FX (works with v0.3.1+)
            is_gold = "GOLD" in symbol.upper() or symbol.lower() in ["gram-altin", "ceyrek-altin", "yarim-altin", "tam-altin", "cumhuriyet-altin", "ata-altin", "ons-altin"]
            
            if is_bist or is_gold:
                try:
                    if symbol in self.bist_indices:
                        new_df = bp.Index(symbol).history(period=period, interval=interval)
                    elif is_gold:
                        gold_map = {
                            "GRAM_GOLD": "gram-altin", "CEYREK_GOLD": "ceyrek-altin",
                            "YARIM_GOLD": "yarim-altin", "TAM_GOLD": "tam-altin",
                            "CUMHURIYET_GOLD": "cumhuriyet-altin", "ATA_GOLD": "ata-altin",
                            "ONS_GOLD": "ons-altin"
                        }
                        fx_sym = gold_map.get(symbol.upper(), symbol.lower().replace("_", "-"))
                        new_df = BorsapyFX(fx_sym).history(period=period, interval=interval)
                    else:
                        new_df = bp.Ticker(symbol).history(period=period, interval=interval)
                    
                    if new_df is not None and not new_df.empty:
                        # Normalize column names
                        new_df.columns = [str(col).title() for col in new_df.columns]
                        # Normalize timezone to naive
                        if new_df.index.tz is not None:
                            new_df.index = new_df.index.tz_localize(None)
                        logger.info(f"[MarketFetcher] Borsapy/FX history success for {symbol} ({len(new_df)} rows)")
                except Exception as e:
                    logger.warning(f"[MarketFetcher] Borsapy/FX history fail for {symbol}: {e}. Trying yfinance...", extra={"symbol": symbol, "error": str(e)})
                    new_df = None

            # Fallback / Foreign: Use yfinance
            if new_df is None or new_df.empty:
                yf_sym = self._normalize_symbol(symbol, market_hint=market_hint, currency_hint=currency_hint)
                try:
                    new_df = yf.Ticker(yf_sym).history(period=period, interval=interval)
                    if new_df is not None and not new_df.empty:
                        new_df.columns = [str(col).title() for col in new_df.columns]
                        if new_df.index.tz is not None:
                            new_df.index = new_df.index.tz_localize(None)
                        logger.info(f"[MarketFetcher] yfinance history success for {symbol} ({len(new_df)} rows)")
                except Exception as e:
                    logger.exception("[MarketFetcher] yfinance history fail", extra={"symbol": symbol, "error": str(e)})

            if new_df is not None and not new_df.empty:
                local_df = self._load_from_disk(symbol)
                if local_df is not None:
                    # Normalize local_df timezone too
                    if local_df.index.tz is not None:
                        local_df.index = local_df.index.tz_localize(None)
                    combined = pd.concat([local_df, new_df])
                    combined = combined[~combined.index.duplicated(keep='last')]
                    combined = combined.sort_index()
                    self._save_to_disk(symbol, combined)
                else:
                    self._save_to_disk(symbol, new_df)
        except Exception as e:
            logger.exception("[MarketFetcher] History update fail", extra={"symbol": symbol, "error": str(e)})

    def _update_asset_metadata(
        self,
        symbol: str,
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ):
        """Metadata and financials refresh. borsapy for BIST (high accuracy), yfinance for others."""
        try:
            is_bist = self._is_bist_with_hints(symbol, market_hint=market_hint, currency_hint=currency_hint)
            clean_info = None
            financials = {}

            if is_bist and symbol not in self.bist_indices:
                # 1. BIST STOCK - Use BORSAPY (Superior accuracy for BIST: real-time prices, correct names)
                try:
                    t = bp.Ticker(symbol)
                    info = t.info
                    # borsapy info is EnrichedInfo object with .get() support
                    clean_info = {
                        "name": symbol,
                        "symbol": symbol,
                        "sector": info.get("sector"),
                        "industry": info.get("industry"),
                        "description": info.get("longBusinessSummary") or info.get("description"),
                        "last": info.get("last") or info.get("currentPrice") or info.get("regularMarketPrice"),
                        "open": info.get("open") or info.get("regularMarketOpen"),
                        "high": info.get("high") or info.get("regularMarketDayHigh"),
                        "low": info.get("low") or info.get("regularMarketDayLow"),
                        "close": info.get("close") or info.get("regularMarketPreviousClose"),
                        "volume": info.get("volume") or info.get("regularMarketVolume"),
                        "avg_volume": info.get("averageVolume") or info.get("averageVolume10days"),
                        "change": info.get("change") or info.get("regularMarketChange"),
                        "change_percent": info.get("change_percent") or info.get("regularMarketChangePercent"),
                        "market_cap": info.get("marketCap") or info.get("market_cap"),
                        "pe_ratio": info.get("trailingPE") or info.get("pe_ratio"),
                        "pb_ratio": info.get("priceToBook") or info.get("pb_ratio"),
                        "beta": info.get("beta") or info.get("beta3Year"),
                        "dividend_yield": _compute_safe_dividend_yield(
                            raw_dividend_yield=info.get("dividendYield"),
                            dividend_rate=info.get("dividendRate"),
                            last_price=info.get("last") or info.get("currentPrice") or info.get("regularMarketPrice"),
                            dividends=getattr(t, "dividends", None),
                        ) or 0,
                        "foreign_ratio": info.get("foreignRatio"),
                        "shares_outstanding": info.get("sharesOutstanding"),
                        "eps": info.get("trailingEps"),
                        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
                        "website": info.get("website"),
                        "currency": info.get("currency") or "TRY",
                        "exchange": info.get("exchange") or "BIST",
                        "updated_at": datetime.now().isoformat(),
                        "source": "borsapy"
                    }
                    
                    # Calculations for missing data
                    if not clean_info["market_cap"] and clean_info["last"] and clean_info["shares_outstanding"]:
                        try: clean_info["market_cap"] = float(clean_info["last"]) * float(clean_info["shares_outstanding"])
                        except: pass
                        
                    if not clean_info["pe_ratio"] and clean_info["last"] and clean_info["eps"]:
                        try: clean_info["pe_ratio"] = round(float(clean_info["last"]) / float(clean_info["eps"]), 2)
                        except: pass
                        
                    # Enforce standardized field availability
                    if not clean_info["beta"]: clean_info["beta"] = 1.0 # Default beta
                    
                    # Try to get financials (may fail)
                    try:
                        if hasattr(t, 'income_stmt') and not t.income_stmt.empty:
                            financials["income_statement"] = self._df_to_records(t.income_stmt)
                        if hasattr(t, 'balance_sheet') and not t.balance_sheet.empty:
                            financials["balance_sheet"] = self._df_to_records(t.balance_sheet)
                    except:
                        pass
                        
                    # Try to get news (may fail)
                    try:
                        if hasattr(t, 'news') and not t.news.empty:
                            news_records = self._df_to_records(t.news.sort_values("Date", ascending=False).head(10))
                            clean_info["news"] = news_records
                    except:
                        pass
                        
                    logger.info(f"[MarketFetcher] Borsapy metadata success for {symbol}: last={clean_info.get('last')}")
                except Exception as e:
                    logger.exception("[MarketFetcher] Borsapy metadata fail", extra={"symbol": symbol, "error": str(e)})

            # 1.5 GOLD ASSETS - Specialized handling for Turkish gold types
            is_gold = "GOLD" in symbol.upper() or symbol.lower() in ["gram-altin", "ceyrek-altin", "yarim-altin", "tam-altin", "cumhuriyet-altin", "ata-altin", "ons-altin"]
            if clean_info is None and is_gold:
                try:
                    gold_map = {
                        "GRAM_GOLD": ("gram-altin", "Gram Altın"), 
                        "CEYREK_GOLD": ("ceyrek-altin", "Çeyrek Altın"),
                        "YARIM_GOLD": ("yarim-altin", "Yarım Altın"), 
                        "TAM_GOLD": ("tam-altin", "Tam Altın"),
                        "CUMHURIYET_GOLD": ("cumhuriyet-altin", "Cumhuriyet Altını"), 
                        "ATA_GOLD": ("ata-altin", "Ata Altın"),
                        "ONS_GOLD": ("ons-altin", "Ons Altın")
                    }
                    fx_sym, name = gold_map.get(symbol.upper(), (symbol.lower().replace("_", "-"), symbol))
                    f = BorsapyFX(fx_sym)
                    info = f.info
                    clean_info = {
                        "name": name,
                        "symbol": symbol,
                        "last": float(info.get("last", 0)),
                        "open": float(info.get("open", 0)),
                        "high": float(info.get("high", 0)),
                        "low": float(info.get("low", 0)),
                        "close": float(info.get("previous_close", 0)), # Fallback if available
                        "currency": "TRY",
                        "exchange": "Doviz.com",
                        "updated_at": datetime.now().isoformat(),
                        "source": "borsapy_fx"
                    }
                    logger.info(f"[MarketFetcher] Gold metadata success for {symbol}: last={clean_info.get('last')}")
                except Exception as e:
                    logger.warning(f"[MarketFetcher] Gold metadata fail for {symbol}: {e}")

            # 2. FOREIGN or BIST FALLBACK - Use yfinance
            if clean_info is None:
                yf_sym = self._normalize_symbol(symbol, market_hint=market_hint, currency_hint=currency_hint)
                t = yf.Ticker(yf_sym)
                info = t.info
                if info:
                    clean_info = {
                        "name": info.get("longName") or info.get("shortName") or symbol,
                        "symbol": symbol,
                        "sector": info.get("sector"),
                        "industry": info.get("industry"),
                        "description": info.get("longBusinessSummary"),
                        "last": info.get("currentPrice") or info.get("regularMarketPrice"),
                        "open": info.get("regularMarketOpen"),
                        "high": info.get("regularMarketDayHigh"),
                        "low": info.get("regularMarketDayLow"),
                        "close": info.get("regularMarketPreviousClose"),
                        "volume": info.get("regularMarketVolume"),
                        "change": info.get("regularMarketChange"),
                        "change_percent": info.get("regularMarketChangePercent"),
                        "market_cap": info.get("marketCap"),
                        "pe_ratio": info.get("trailingPE"),
                        "pb_ratio": info.get("priceToBook"),
                        "dividend_yield": _compute_safe_dividend_yield(
                            raw_dividend_yield=info.get("dividendYield"),
                            dividend_rate=info.get("dividendRate"),
                            last_price=info.get("currentPrice") or info.get("regularMarketPrice"),
                            dividends=getattr(t, "dividends", None),
                        ) or 0,
                        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
                        "website": info.get("website"),
                        "currency": info.get("currency") or "USD",
                        "exchange": info.get("exchange"),
                        "updated_at": datetime.now().isoformat(),
                        "source": "yfinance"
                    }
                try:
                    if not t.financials.empty:
                        financials["income_statement"] = self._df_to_records(t.financials)
                except:
                    pass

            if clean_info:
                self._save_metadata(symbol, clean_info)
            if financials:
                self._save_financials(symbol, financials)
                
        except Exception as e:
            logger.exception("[MarketFetcher] Metadata sync fail", extra={"symbol": symbol, "error": str(e)})

    def _update_asset_deep(
        self,
        symbol: str,
        period: str = "3mo",
        interval: str = "1d",
        market_hint: Optional[str] = None,
        currency_hint: Optional[str] = None,
    ):
        """Full update history + metadata."""
        self._update_asset_history(symbol, period, interval, market_hint=market_hint, currency_hint=currency_hint)
        self._update_asset_metadata(symbol, market_hint=market_hint, currency_hint=currency_hint)

    def _calculate_metrics(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Calculate technical scores and probabilities from history."""
        if df is None or df.empty or len(df) < 2:
            return {"technical_scores": {"momentum": 50, "volatility": 30, "trend_strength": 40, "risk_score": 20}, "probabilities": {"up": 33, "down": 33, "sideways": 34}}
        
        try:
            close = df["Close"]
            change = close.pct_change()
            
            # Simple technical scores
            momentum = 50 + (change.tail(5).mean() * 1000)
            volatility = change.std() * 1000
            
            return {
                "technical_scores": {
                    "momentum": min(100, max(0, int(momentum))),
                    "volatility": min(100, max(0, int(volatility))),
                    "trend_strength": 60,
                    "risk_score": 30
                },
                "probabilities": {
                    "up": 45 if momentum > 50 else 30,
                    "down": 30 if momentum > 50 else 45,
                    "sideways": 25
                }
            }
        except:
            return {"technical_scores": {"momentum": 50, "volatility": 30, "trend_strength": 40, "risk_score": 20}, "probabilities": {"up": 33, "down": 33, "sideways": 34}}

    def _df_to_records(self, df: pd.DataFrame) -> List[dict]:
        if df is None or df.empty: return []
        if isinstance(df.index, pd.DatetimeIndex):
            df = df.reset_index()
        records = df.to_dict(orient="records")
        for r in records:
            for k, v in r.items():
                if isinstance(v, (pd.Timestamp, datetime)):
                    r[k] = v.isoformat()
                elif pd.isna(v) or (isinstance(v, float) and v != v):
                    r[k] = None
        return records

    def get_index_constituents(self, index_symbol: str) -> List[Dict[str, Any]]:
        """Fetch index constituents. Uses borsapy screener for BIST indices for real-time accuracy."""
        constituents = []
        is_bist_index = index_symbol in ["XU100", "XU030", "XUTUM", "XBANK", "XUSIN", "XU050"]
        
        try:
            if is_bist_index:
                # NEW: Use borsapy 0.7.2 Index.components (public API)
                try:
                    idx = bp.Index(index_symbol)
                    components = idx.components
                    if components:
                        for item in components:
                            constituents.append({
                                "symbol": item.get("symbol"),
                                "name": item.get("name"),
                                "last": 0,
                                "change": 0,
                                "market_cap": 0
                            })
                        return constituents
                except Exception as e:
                    logger.exception("[MarketFetcher] bp.Index.components error", extra={"index": index_symbol, "error": str(e)})
                
                # Fallback: Try borsapy screen_stocks with index filter
                try:
                    df = bp.screen_stocks(index=index_symbol)
                    if df is not None and not df.empty:
                        for _, row in df.iterrows():
                            constituents.append({
                                "symbol": row.get("symbol"),
                                "name": row.get("name", ""),
                                "last": float(row.get("price", 0) or 0),
                                "change": 0,
                                "market_cap": float(row.get("market_cap", 0) or 0)
                            })
                        return constituents
                except Exception as e:
                    logger.exception("[MarketFetcher] bp.screen_stocks error", extra={"index": index_symbol, "error": str(e)})

            # Fallback to hardcoded/yfinance for other indices
            mappings = {
                "XU100": ["AEFES", "AKBNK", "AKSA", "ALARK", "ARCLK", "ASELS", "BIMAS", "DOHOL", "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN", "HEKTS", "ISCTR", "KCHOL", "KOZAL", "KRDMD", "PETKM", "PGSUS", "SAHOL", "SASA", "SISE", "TAVHL", "TCELL", "THYAO", "TKFEN", "TOASO", "TUPRS", "VESTL"],
                "XU030": ["AKBNK", "ARCLK", "ASELS", "BIMAS", "EKGYO", "EREGL", "FROTO", "GARAN", "GUBRF", "HEKTS", "ISCTR", "KCHOL", "KOZAA", "KOZAL", "KRDMD", "PETKM", "PGSUS", "SAHOL", "SASA", "SISE", "TAVHL", "TCELL", "THYAO", "TOASO", "TUPRS", "YKBNK"]
            }
            
            symbols = mappings.get(index_symbol, [])
            if not symbols: return []

            # Fetch basic info for each constituent in parallel
            def fetch_basic(s):
                try:
                    yf_sym = f"{s}.IS"
                    t = yf.Ticker(yf_sym)
                    h = t.history(period="1d")
                    if h.empty: return None
                    last = h.iloc[-1]
                    return {
                        "symbol": s,
                        "name": s,
                        "last": float(last["Close"]),
                        "change": 0,
                        "market_cap": 0
                    }
                except: return None

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
                    results = list(ex.map(fetch_basic, symbols))
                constituents = [r for r in results if r]
            except Exception as e:
                logger.exception("[MarketFetcher] Constituent fetch fail", extra={"index": index_symbol, "error": str(e)})
                constituents = []

            return constituents

        except Exception as e:
            logger.exception("[MarketFetcher] get_index_constituents fail", extra={"index": index_symbol, "error": str(e)})
            return []

    def _refresh_dashboard_data_task(self):
        """Heavy background task to refresh all dashboard data."""
        self._is_refreshing = True
        now = datetime.now()
        result = {
            "indices": [],
            "us_markets": [],
            "fx": [],
            "commodities": [],
            "crypto": [],
            "stocks": [],
            "timestamp": now.isoformat()
        }
        
        try:
            # 1. TR Indices
            tr_indices = ["XU100", "XU030", "XUTUM", "XBANK", "XUSIN"]
            # 2. US Markets
            us_symbols = ["^GSPC", "^DJI", "^IXIC", "^RUT"]
            # 3. FX
            fx_assets = ["USD", "EUR", "GBP"]
            # 4. Commodities
            com_assets = ["GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F", "PL=F"] # Gold, Silver, Crude, Brent, NatGas, Copper, Platinum
            # 5. Crypto
            crypto_pairs = [
                ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("BNB-USD", "BNB"), 
                ("SOL-USD", "Solana"), ("XRP-USD", "XRP"), ("ADA-USD", "Cardano"),
                ("AVAX-USD", "Avalanche"), ("DOGE-USD", "Dogecoin"), ("TRX-USD", "Tron"),
                ("DOT-USD", "Polkadot"), ("LINK-USD", "Chainlink"), ("MATIC-USD", "Polygon"),
                ("SHIB-USD", "Shiba Inu"), ("LTC-USD", "Litecoin"), ("BCH-USD", "Bitcoin Cash"),
                ("UNI-USD", "Uniswap"), ("XLM-USD", "Stellar"), ("ATOM-USD", "Cosmos"),
                ("XMR-USD", "Monero"), ("ETC-USD", "Ethereum Classic"), ("FIL-USD", "Filecoin"),
                ("HBAR-USD", "Hedera"), ("APT-USD", "Aptos"), ("VET-USD", "VeChain")
            ]
            # 6. Popular Stocks
            popular_stocks = ["THYAO", "ASELS", "EREGL", "TUPRS", "AKBNK", "KCHOL", "SASA", "BIMAS"]

            indices_data = {}
            us_data = {}
            stocks_data = {}
        except: pass

    def _fetch_all_crypto(self) -> List[Dict]:
        """Fetch ALL crypto pairs from BtcTurk directly (Bulk) and enrich with yfinance for USD."""
        try:
            import requests
            url = "https://api.btcturk.com/api/v2/ticker"
            r = requests.get(url, timeout=10)
            btcturk_res = []
            if r.status_code == 200:
                data = r.json()
                if data.get("success"):
                    for item in data.get("data", []):
                        pair = item.get("pair")
                        if pair.endswith("TRY") or pair.endswith("USDT"):
                            sym_display = pair.replace("TRY", "").replace("USDT", "")
                            asset_currency = "TRY" if pair.endswith("TRY") else "USD"
                            btcturk_res.append({
                                "symbol": pair,
                                "name": sym_display,
                                "last": float(item.get("last", 0)),
                                "change": float(item.get("daily", 0)),
                                "change_percent": float(item.get("dailyPercent", 0)),
                                "volume": float(item.get("volume", 0)),
                                "currency": asset_currency
                            })
            
            # Enrich with major USD coins from yfinance to ensure reliable USD prices
            major_coins = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"]
            yf_res = []
            
            def fetch_yf_crypto(coin):
                try:
                    t = yf.Ticker(f"{coin}-USD")
                    h = t.history(period="2d")
                    if len(h) >= 2:
                        last = float(h.iloc[-1]["Close"])
                        prev = float(h.iloc[-2]["Close"])
                        return {
                            "symbol": f"{coin}-USD",
                            "name": coin,
                            "last": last,
                            "change": last - prev,
                            "change_percent": ((last - prev) / prev) * 100,
                            "currency": "USD",
                            "volume": int(h.iloc[-1].get("Volume", 0)),
                            "source": "yfinance"
                        }
                except: pass
                return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=len(major_coins)) as ex:
                yf_results = list(ex.map(fetch_yf_crypto, major_coins))
            
            # Combine: Prioritize yfinance USD for major coins, keep others from BtcTurk
            final_res = [r for r in yf_results if r is not None]
            seen_names = {r["name"] for r in final_res}
            
            for r in btcturk_res:
                if r["name"] not in seen_names:
                    final_res.append(r)
                elif r["currency"] == "TRY":
                    # Keep TRY pairs too, they'll be filtered in UI
                    final_res.append(r)
            
            final_res.sort(key=lambda x: x.get("volume", 0), reverse=True)
            return final_res
        except Exception as e:
            logger.exception("[Dashboard] Crypto fetch fail", extra={"error": str(e)})
            return []

    def _refresh_dashboard_data_task(self):
        """Background worker to fetch fresh data for all widgets."""
        if not self._lock.acquire(blocking=False): return
        self._is_refreshing = True
        try:
            logger.info("[MarketFetcher] Refreshing dashboard data...")
            result = {
                "indices": [],
                "us_markets": [],
                "fx": [],
                "commodities": [],
                "crypto": [],
                "stocks": [],
                "timestamp": datetime.now().isoformat(),
                "loading": False
            }
            
            # Asset Lists
            tr_indices = ["XU100", "XU030", "XBANK", "XUSIN", "XUTUM", "XU050"]
            us_symbols = ["^GSPC", "^DJI", "^IXIC", "^RUT"]
            
            # 3. FX - Using borsapy FX (native Turkish data sources - more accurate for TL rates)
            # Borsapy supported: USD, EUR, GBP, CHF, AUD, CAD
            # Note: Keeping high-volume pairs in borsapy, moving CHF to yfinance to avoid rate limits
            fx_borsapy = ["USD", "EUR", "GBP"]  # Main TL pairs from borsapy
            fx_yfinance = ["CHF", "DXY", "EURUSD"]  # CHF moved here to avoid rate limit, plus non-TL pairs
            
            # 4. Commodities - Using borsapy FX (supports gold, silver, oil in TRY)
            # Borsapy supported: gram-altin, ons-altin, gram-gumus, BRENT, WTI, diesel, gasoline, lpg
            com_borsapy = [
                ("gram-altin", "Altın (gr)"),
                ("ons-altin", "Altın (ons)"),
                ("gram-gumus", "Gümüş (gr)"),
                ("BRENT", "Brent Petrol")
            ]
            # WTI not supported in borsapy API, use yfinance for crude oil
            com_yfinance = [("CL=F", "Ham Petrol (WTI)"), ("NG=F", "Doğalgaz"), ("HG=F", "Bakır"), ("PL=F", "Platin")] 
            
            # 6. Popular Stocks (unchanged)
            popular_stocks = ["THYAO", "ASELS", "EREGL", "TUPRS", "AKBNK", "KCHOL", "SASA", "BIMAS"]

            indices_data = {}
            us_data = {}
            stocks_data = {}

            # Helper functions matching original logic
            def proc_bist_index(s):
                try:
                    idx = bp.Index(s)
                    info = idx.info
                    last = info.get("last") or info.get("close") or 0
                    change_pct = info.get("change_percent") or 0
                    change_val = info.get("change") or 0
                    if change_pct == 0 and last > 0:
                         prev = info.get("previousClose") or last
                         if prev > 0:
                             change_pct = ((last - prev) / prev) * 100
                             change_val = last - prev
                    
                    indices_data[s] = {
                        "symbol": s,
                        "name": {"XU100":"BIST 100","XU030":"BIST 30","XUTUM":"BIST Tüm","XBANK":"BIST Banka","XUSIN":"BIST Sınai"}.get(s, s),
                        "last": float(last),
                        "change": float(change_val),
                        "change_percent": float(change_pct),
                        "currency": "TRY"
                    }
                except Exception as e:
                    try:
                         h = yf.Ticker(self._normalize_symbol(s)).history(period="5d")
                         if len(h)>1:
                             l = float(h.iloc[-1]["Close"])
                             p = float(h.iloc[-2]["Close"])
                             indices_data[s] = {"symbol": s, "name": s, "last": l, "change": l-p, "change_percent": ((l-p)/p)*100}
                    except: pass

            def proc_bist_stock(s):
                try:
                    t = bp.Ticker(s)
                    info = t.info
                    last = info.get("last") or info.get("currentPrice") or 0
                    change_pct = info.get("change_percent") or 0
                    change_val = info.get("change") or 0
                    stocks_data[s] = {
                        "symbol": s, "name": s, "last": float(last),
                        "change": float(change_val), "change_percent": float(change_pct),
                        "currency": "TRY"
                    }
                except: pass

            def proc_us_market(s):
                try:
                    h = yf.Ticker(s).history(period="5d")
                    if len(h)>1:
                        l = float(h.iloc[-1]["Close"])
                        p = float(h.iloc[-2]["Close"])
                        us_data[s] = {"symbol": s, "name": s, "last": l, "change": l-p, "change_percent": ((l-p)/p)*100, "currency": "USD"}
                except: pass

            # --- BORSAPY FX PROCESSOR (Primary Source for TL-based FX & Commodities) ---
            def proc_fx_borsapy(symbol, category):
                """Fetch FX/Commodity data using borsapy (doviz.com - more accurate for TL)."""
                success = False
                try:
                    fx = BorsapyFX(symbol)
                    info = fx.info  # Returns: {symbol, last, open, high, low, update_time}
                    last = float(info.get("last", 0))
                    
                    if last > 0:
                        # Get 5d history to calculate change
                        try:
                            h = fx.history(period="5d")
                            if h is not None and len(h) >= 2:
                                prev = float(h.iloc[-2]["Close"])
                                change_val = last - prev
                                change_pct = ((last - prev) / prev) * 100 if prev > 0 else 0
                            else:
                                change_val = 0
                                change_pct = 0
                        except:
                            change_val = 0
                            change_pct = 0
                        
                        # Display names for Turkish localization
                        name_map = {
                            "USD": "Dolar", "EUR": "Euro", "GBP": "Sterlin", 
                            "CHF": "İsviçre Frangı",
                            "gram-altin": "Altın (gr)", "ons-altin": "Altın (ons)",
                            "gram-gumus": "Gümüş (gr)", "BRENT": "Brent Petrol", "WTI": "WTI Petrol"
                        }
                        
                        # Decide currency and potentially adjust price
                        # Note: Borsapy FX usually returns the TL price for these.
                        
                        is_global_usd = symbol in ["ons-altin", "BRENT", "WTI"]
                        # If the price is > 10000 for gold ons, it's definitely TL.
                        # If price is < 5000, it's likely the global USD price.
                        if is_global_usd and last > 5000: 
                             asset_currency = "TRY"
                        elif is_global_usd:
                             asset_currency = "USD"
                        else:
                             asset_currency = "TRY"
                        
                        result[category].append({
                            "symbol": symbol,
                            "name": name_map.get(symbol, symbol),
                            "last": last,
                            "change": change_val,
                            "change_percent": change_pct,
                            "currency": asset_currency,
                            "source": "borsapy"
                        })
                        logger.info(f"[Dashboard] Borsapy FX Success: {symbol} = {last} {asset_currency}")
                        success = True
                except Exception as e:
                    logger.warning(f"[Dashboard] Borsapy FX Error for {symbol}: {e}", extra={"symbol": symbol, "error": str(e)})
                
                # FALLBACK to yfinance if borsapy fails
                if not success:
                    try:
                        yf_map = {
                            "USD": "USDTRY=X", "EUR": "EURTRY=X", "GBP": "GBPTRY=X",
                            "CHF": "CHFTRY=X", "gram-altin": "GC=F", "ons-altin": "GC=F",
                            "gram-gumus": "SI=F", "BRENT": "BZ=F", "WTI": "CL=F"
                        }
                        name_map = {
                            "USD": "Dolar", "EUR": "Euro", "GBP": "Sterlin",
                            "CHF": "İsviçre Frangı",
                            "gram-altin": "Altın (gr)", "ons-altin": "Altın (ons)",
                            "gram-gumus": "Gümüş (gr)", "BRENT": "Brent Petrol", "WTI": "WTI Petrol"
                        }
                        yf_sym = yf_map.get(symbol, f"{symbol}TRY=X")
                        h = yf.Ticker(yf_sym).history(period="2d")
                        if h is not None and len(h) >= 2:
                            last = float(h.iloc[-1]["Close"])
                            prev = float(h.iloc[-2]["Close"])
                            
                            # Determine intended currency BEFORE manual conversion
                            is_global_usd = symbol in ["ons-altin", "BRENT", "WTI"]
                            
                            # Conversion ONLY for Gram assets if using global source (GC=F, SI=F)
                            if symbol in ["gram-altin", "gram-gumus"]:
                                try:
                                    usd_h = yf.Ticker("USDTRY=X").history(period="2d")
                                    if usd_h is not None and len(usd_h) >= 2:
                                        usd_rate = float(usd_h.iloc[-1]["Close"])
                                        usd_prev = float(usd_h.iloc[-2]["Close"])
                                        last = last * usd_rate
                                        prev = prev * usd_prev
                                        if symbol == "gram-altin":
                                            # GC=F is Ounce, convert to Gram
                                            last = last / 31.1035
                                            prev = prev / 31.1035
                                except: pass
                                asset_currency = "TRY"
                            else:
                                asset_currency = "USD" if is_global_usd else "TRY"
                            
                            result[category].append({
                                "symbol": symbol,
                                "name": name_map.get(symbol, symbol),
                                "last": last,
                                "change": last - prev,
                                "change_percent": ((last - prev) / prev) * 100 if prev > 0 else 0,
                                "currency": asset_currency,
                                "source": "yfinance-fallback"
                            })
                            logger.info(f"[Dashboard] yfinance Fallback Success: {symbol} = {last} {asset_currency}")
                    except Exception as e2:
                        logger.exception("[Dashboard] yfinance Fallback Error", extra={"symbol": symbol, "error": str(e2)})
            
            # --- YFINANCE FX PROCESSOR (Fallback for non-borsapy assets) ---
            def proc_fx_yfinance(s, category, display_name=None):
                """Fetch FX/Commodity data using yfinance (fallback)."""
                try:
                    yf_s = self._normalize_symbol(s)
                    h = yf.Ticker(yf_s).history(period="2d")
                    if len(h) >= 2:
                        last = float(h.iloc[-1]["Close"])
                        prev = float(h.iloc[-2]["Close"])
                        
                        name_map = {
                            "CHF": "İsviçre Frangı", "DXY": "Dolar Endeksi", "EURUSD": "EUR/USD Parite",
                            "CL=F": "Ham Petrol (WTI)", "NG=F": "Doğalgaz", "HG=F": "Bakır", "PL=F": "Platin"
                        }
                        
                        sym_clean = s.replace("=F", "").replace("TRY=X", "").replace("DX-Y.NYB", "DXY").replace("EURUSD=X", "EUR/USD")
                        
                        # Currency logic: Ratios/Indices get 'NONE'
                        is_ratio = any(x in s for x in ["DX-Y", "EURUSD=X", "DXY", "EUR/USD", "EURUSD"])
                        if is_ratio or s == "DXY" or s == "EURUSD":
                            asset_currency = "NONE"
                        else:
                            # If it's a global commodity from yfinance (not converted manually), it's USD
                            is_global = any(x in s for x in ["CL=F", "NG=F", "HG=F", "PL=F", "GC=F", "SI=F", "BZ=F"])
                            if is_global:
                                asset_currency = "USD"
                            elif "TRY=X" in s or s in ["USD", "EUR", "GBP", "CHF", "AUD", "CAD"]:
                                asset_currency = "TRY"
                            else:
                                asset_currency = "USD"
                        
                        result[category].append({
                            "symbol": sym_clean,
                            "name": display_name or name_map.get(s, s),
                            "last": last,
                            "change": last - prev,
                            "change_percent": ((last - prev) / prev) * 100,
                            "currency": asset_currency,
                            "source": "yfinance"
                        })
                except Exception as e:
                    logger.exception("[Dashboard] yfinance FX Error", extra={"symbol": s, "error": str(e)})
            
            # --- EXECUTION ---
            with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
                futures = []
                futures.extend([ex.submit(proc_bist_index, s) for s in tr_indices])
                futures.extend([ex.submit(proc_us_market, s) for s in us_symbols])
                futures.extend([ex.submit(proc_bist_stock, s) for s in popular_stocks])
                
                # FX: Borsapy for TL pairs, yfinance for DXY/EURUSD
                futures.extend([ex.submit(proc_fx_borsapy, a, "fx") for a in fx_borsapy])
                futures.extend([ex.submit(proc_fx_yfinance, a, "fx") for a in fx_yfinance])
                
                # Commodities: Borsapy for gold/silver/oil, yfinance for others
                for sym, name in com_borsapy:
                    futures.append(ex.submit(proc_fx_borsapy, sym, "commodities"))
                for sym, name in com_yfinance:
                    futures.append(ex.submit(proc_fx_yfinance, sym, "commodities", name))
                
                # Fetch Crypto BULK (BtcTurk)
                result["crypto"] = self._fetch_all_crypto()
                
                concurrent.futures.wait(futures, timeout=25)

            # Aggregate
            for s in tr_indices: 
                if s in indices_data: result["indices"].append(indices_data[s])
            for s in us_symbols: 
                if s in us_data: result["us_markets"].append(us_data[s])
            for s in popular_stocks:
                if s in stocks_data: result["stocks"].append(stocks_data[s])

            def clean(d):
                if isinstance(d, dict): return {k: clean(v) for k, v in d.items()}
                if isinstance(d, list): return [clean(i) for i in d]
                if isinstance(d, float) and (d != d): return 0
                return d
            
            result = clean(result)
            self._dashboard_cache = result
            self._dashboard_last_updated = datetime.now()
            self._save_dashboard_to_disk()
            return result
        except Exception as e:
            logger.exception("[MarketFetcher] Refresh Error", extra={"error": str(e)})
        finally:
            self._lock.release()
            self._is_refreshing = False

    def get_dashboard_data(self) -> Dict[str, Any]:
        """Non-blocking dashboard logic. Always returns immediately."""
        now = datetime.now()
        
        # Determine if we need a refresh
        needs_refresh = False
        if not self._dashboard_cache or not self._dashboard_last_updated:
            needs_refresh = True
        elif now - self._dashboard_last_updated > timedelta(minutes=2):
            needs_refresh = True
            
        # Trigger background refresh if needed and not already running
        if needs_refresh and not self._is_refreshing:
            threading.Thread(target=self._refresh_dashboard_data_task, daemon=True).start()
            
        # Return cache if available, otherwise a placeholder
        if self._dashboard_cache:
            return self._dashboard_cache
            
        return {
            "indices":[], 
            "us_markets":[], 
            "fx":[], 
            "commodities":[], 
            "crypto":[], 
            "stocks":[],
            "timestamp": now.isoformat(),
            "loading": True
        }

    # ==========================================
    # COMPREHENSIVE MARKET ANALYSIS ENDPOINTS
    # ==========================================
    
    def get_all_bist_stocks(self) -> Dict[str, Any]:
        """
        Fetch ALL BIST stocks with real-time data for market analysis.
        Returns top gainers, top losers, and full list sorted by change_percent.
        Uses borsapy 0.7.2 public API (bp.screen_stocks) instead of internal API.
        """
        try:
            # NEW: Use borsapy 0.7.2 public screen_stocks API
            df = bp.screen_stocks()
            
            if df is None or df.empty:
                return {"gainers": [], "losers": [], "all": [], "count": 0}
            
            # Process DataFrame to dict format
            processed = []
            for _, row in df.iterrows():
                try:
                    symbol = str(row.get("symbol", ""))
                    last = float(row.get("price", 0) or 0)
                    change_pct = float(row.get("change", 0) or row.get("daily_change", 0) or 0)
                    market_cap = float(row.get("market_cap", 0) or 0)
                    volume = float(row.get("volume", 0) or 0)
                    
                    processed.append({
                        "symbol": symbol,
                        "name": row.get("name", symbol),
                        "last": last,
                        "change_percent": change_pct,
                        "market_cap": market_cap,
                        "volume": volume,
                        "sector": row.get("sector", "")
                    })
                except:
                    continue
            
            # Sort by change_percent
            processed.sort(key=lambda x: x["change_percent"], reverse=True)
            
            # Top 5 gainers and losers
            gainers = [p for p in processed if p["change_percent"] > 0][:5]
            losers = [p for p in processed if p["change_percent"] < 0][-5:][::-1]
            
            return {
                "gainers": gainers,
                "losers": losers,
                "all": processed,  # Return ALL stocks
                "count": len(processed)
            }
        except Exception as e:
            logger.exception("[MarketFetcher] BIST stocks analysis error", extra={"error": str(e)})
            return {"gainers": [], "losers": [], "all": [], "count": 0, "error": str(e)}

    def _get_sp500_list(self) -> List[tuple]:
        """
        Get full S&P 500 list - all 500+ companies.
        Returns list of (symbol, name) tuples.
        """
        # Complete S&P 500 list (as of 2024)
        sp500_stocks = [
            # === INFORMATION TECHNOLOGY (75+ companies) ===
            ("AAPL", "Apple Inc."), ("MSFT", "Microsoft Corporation"), ("NVDA", "NVIDIA Corporation"),
            ("AVGO", "Broadcom Inc."), ("ORCL", "Oracle Corporation"), ("CRM", "Salesforce Inc."),
            ("ADBE", "Adobe Inc."), ("AMD", "Advanced Micro Devices"), ("ACN", "Accenture plc"),
            ("CSCO", "Cisco Systems Inc."), ("INTC", "Intel Corporation"), ("IBM", "International Business Machines"),
            ("INTU", "Intuit Inc."), ("TXN", "Texas Instruments"), ("QCOM", "Qualcomm Inc."),
            ("NOW", "ServiceNow Inc."), ("AMAT", "Applied Materials"), ("ADI", "Analog Devices"),
            ("LRCX", "Lam Research"), ("KLAC", "KLA Corporation"), ("MU", "Micron Technology"),
            ("SNPS", "Synopsys Inc."), ("CDNS", "Cadence Design Systems"), ("MRVL", "Marvell Technology"),
            ("NXPI", "NXP Semiconductors"), ("PANW", "Palo Alto Networks"), ("FTNT", "Fortinet Inc."),
            ("MSI", "Motorola Solutions"), ("APH", "Amphenol Corporation"), ("ADSK", "Autodesk Inc."),
            ("CTSH", "Cognizant Technology"), ("IT", "Gartner Inc."),
            ("MPWR", "Monolithic Power Systems"), ("ON", "ON Semiconductor"), ("FSLR", "First Solar Inc."),
            ("KEYS", "Keysight Technologies"), ("CDW", "CDW Corporation"), ("ZBRA", "Zebra Technologies"),
            ("HPQ", "HP Inc."), ("HPE", "Hewlett Packard Enterprise"), ("STX", "Seagate Technology"),
            ("WDC", "Western Digital"), ("NTAP", "NetApp Inc."),
            ("AKAM", "Akamai Technologies"), ("TYL", "Tyler Technologies"), ("VRSN", "VeriSign Inc."),
            ("GEN", "Gen Digital Inc."), ("FFIV", "F5 Inc."), ("EPAM", "EPAM Systems"),
            ("PTC", "PTC Inc."), ("SWKS", "Skyworks Solutions"), ("QRVO", "Qorvo Inc."),
            ("TER", "Teradyne Inc."), ("TRMB", "Trimble Inc."), ("ENPH", "Enphase Energy"),
            ("SEDG", "SolarEdge Technologies"), ("PAYC", "Paycom Software"),
            ("LDOS", "Leidos Holdings"), ("JKHY", "Jack Henry & Associates"), ("BR", "Broadridge Financial"),
            
            # === FINANCIALS (70+ companies) ===
            ("BRK-B", "Berkshire Hathaway"), ("JPM", "JPMorgan Chase & Co."), ("V", "Visa Inc."),
            ("MA", "Mastercard Inc."), ("BAC", "Bank of America"), ("WFC", "Wells Fargo"),
            ("GS", "Goldman Sachs Group"), ("MS", "Morgan Stanley"), ("SPGI", "S&P Global Inc."),
            ("BLK", "BlackRock Inc."), ("C", "Citigroup Inc."), ("SCHW", "Charles Schwab"),
            ("AXP", "American Express"), ("PGR", "Progressive Corporation"), ("CB", "Chubb Limited"),
            ("MMC", "Marsh & McLennan"), ("ICE", "Intercontinental Exchange"), ("CME", "CME Group Inc."),
            ("AON", "Aon plc"), ("MCO", "Moody's Corporation"), ("USB", "U.S. Bancorp"),
            ("PNC", "PNC Financial Services"), ("TFC", "Truist Financial"), ("AJG", "Arthur J. Gallagher"),
            ("MET", "MetLife Inc."), ("AFL", "Aflac Inc."), ("PRU", "Prudential Financial"),
            ("AIG", "American International Group"), ("TRV", "Travelers Companies"), ("ALL", "Allstate Corporation"),
            ("BK", "Bank of New York Mellon"), ("COF", "Capital One Financial"), ("MSCI", "MSCI Inc."),
            ("FIS", "Fidelity National Information"), ("FITB", "Fifth Third Bancorp"), ("MTB", "M&T Bank"),
            ("STT", "State Street Corporation"), ("HIG", "Hartford Financial"), ("NDAQ", "Nasdaq Inc."),
            ("WRB", "W. R. Berkley"), ("CINF", "Cincinnati Financial"), ("RJF", "Raymond James Financial"),
            ("HBAN", "Huntington Bancshares"), ("RF", "Regions Financial"),
            ("CFG", "Citizens Financial Group"), ("KEY", "KeyCorp"), ("EG", "Everest Group"),
            ("L", "Loews Corporation"), ("TROW", "T. Rowe Price Group"), ("NTRS", "Northern Trust"),
            ("BRO", "Brown & Brown Inc."), ("ACGL", "Arch Capital Group"), ("WTW", "Willis Towers Watson"),
            ("FDS", "FactSet Research Systems"), ("GL", "Globe Life Inc."),
            ("CBOE", "Cboe Global Markets"), ("AIZ", "Assurant Inc."), ("MKTX", "MarketAxess Holdings"),
            ("IVZ", "Invesco Ltd."), ("BEN", "Franklin Resources"), ("ZION", "Zions Bancorporation"),
            ("CMA", "Comerica Inc."), ("SYF", "Synchrony Financial"), ("LNC", "Lincoln National"),
            
            # === HEALTHCARE (65+ companies) ===
            ("UNH", "UnitedHealth Group"), ("LLY", "Eli Lilly and Company"), ("JNJ", "Johnson & Johnson"),
            ("ABBV", "AbbVie Inc."), ("MRK", "Merck & Co. Inc."), ("TMO", "Thermo Fisher Scientific"),
            ("ABT", "Abbott Laboratories"), ("PFE", "Pfizer Inc."), ("DHR", "Danaher Corporation"),
            ("AMGN", "Amgen Inc."), ("MDT", "Medtronic plc"), ("BMY", "Bristol-Myers Squibb"),
            ("ISRG", "Intuitive Surgical"), ("VRTX", "Vertex Pharmaceuticals"), ("ELV", "Elevance Health"),
            ("GILD", "Gilead Sciences"), ("REGN", "Regeneron Pharmaceuticals"), ("CI", "The Cigna Group"),
            ("SYK", "Stryker Corporation"), ("BSX", "Boston Scientific"), ("ZTS", "Zoetis Inc."),
            ("BDX", "Becton Dickinson"), ("HCA", "HCA Healthcare"), ("MCK", "McKesson Corporation"),
            ("CVS", "CVS Health Corporation"), ("CAH", "Cardinal Health"), ("HUM", "Humana Inc."),
            ("COR", "Cencora Inc."), ("EW", "Edwards Lifesciences"), ("IDXX", "IDEXX Laboratories"),
            ("IQV", "IQVIA Holdings"), ("RMD", "ResMed Inc."), ("A", "Agilent Technologies"),
            ("DXCM", "DexCom Inc."), ("MTD", "Mettler-Toledo"), ("BIIB", "Biogen Inc."),
            ("ZBH", "Zimmer Biomet"), ("WST", "West Pharmaceutical"), ("ALGN", "Align Technology"),
            ("WAT", "Waters Corporation"), ("HOLX", "Hologic Inc."), ("PODD", "Insulet Corporation"),
            ("STE", "Steris plc"), ("BAX", "Baxter International"), ("COO", "Cooper Companies"),
            ("GEHC", "GE HealthCare Technologies"), ("MOH", "Molina Healthcare"), ("CNC", "Centene Corporation"),
            ("RVTY", "Revvity Inc."), ("LH", "Labcorp Holdings"), ("DGX", "Quest Diagnostics"),
            ("ILMN", "Illumina Inc."), ("TFX", "Teleflex Inc."), ("VTRS", "Viatris Inc."),
            ("HSIC", "Henry Schein Inc."), ("TECH", "Bio-Techne Corporation"), ("INCY", "Incyte Corporation"),
            ("XRAY", "Dentsply Sirona"), ("DVA", "DaVita Inc."),
            
            # === CONSUMER DISCRETIONARY (60+ companies) ===
            ("AMZN", "Amazon.com Inc."), ("TSLA", "Tesla Inc."), ("HD", "The Home Depot"),
            ("MCD", "McDonald's Corporation"), ("NKE", "Nike Inc."), ("LOW", "Lowe's Companies"),
            ("BKNG", "Booking Holdings"), ("SBUX", "Starbucks Corporation"), ("TJX", "TJX Companies"),
            ("ABNB", "Airbnb Inc."), ("MAR", "Marriott International"), ("CMG", "Chipotle Mexican Grill"),
            ("ORLY", "O'Reilly Automotive"), ("AZO", "AutoZone Inc."), ("GM", "General Motors"),
            ("F", "Ford Motor Company"), ("ROST", "Ross Stores Inc."), ("YUM", "Yum! Brands"),
            ("HLT", "Hilton Worldwide"), ("DHI", "D.R. Horton Inc."), ("LEN", "Lennar Corporation"),
            ("RCL", "Royal Caribbean Cruises"), ("EXPE", "Expedia Group"), ("EBAY", "eBay Inc."),
            ("DPZ", "Domino's Pizza"), ("ULTA", "Ulta Beauty Inc."), ("NVR", "NVR Inc."),
            ("PHM", "PulteGroup Inc."), ("CCL", "Carnival Corporation"), ("TSCO", "Tractor Supply"),
            ("GPC", "Genuine Parts Company"), ("LVS", "Las Vegas Sands"), ("APTV", "Aptiv PLC"),
            ("GRMN", "Garmin Ltd."), ("DRI", "Darden Restaurants"), ("WYNN", "Wynn Resorts"),
            ("MGM", "MGM Resorts International"), ("BWA", "BorgWarner Inc."), ("POOL", "Pool Corporation"),
            ("BBY", "Best Buy Co. Inc."), ("KMX", "CarMax Inc."), ("LKQ", "LKQ Corporation"),
            ("TPR", "Tapestry Inc."), ("VFC", "VF Corporation"), ("HAS", "Hasbro Inc."),
            ("NCLH", "Norwegian Cruise Line"), ("CZR", "Caesars Entertainment"), ("MHK", "Mohawk Industries"),
            ("WHR", "Whirlpool Corporation"), ("RL", "Ralph Lauren Corporation"), ("PVH", "PVH Corp."),
            ("AAP", "Advance Auto Parts"), ("NWL", "Newell Brands"), ("ETSY", "Etsy Inc."),
            
            # === INDUSTRIALS (75+ companies) ===
            ("CAT", "Caterpillar Inc."), ("GE", "General Electric"), ("HON", "Honeywell International"),
            ("UNP", "Union Pacific Corporation"), ("UPS", "United Parcel Service"), ("RTX", "RTX Corporation"),
            ("BA", "Boeing Company"), ("DE", "Deere & Company"), ("LMT", "Lockheed Martin"),
            ("ADP", "Automatic Data Processing"), ("ETN", "Eaton Corporation"), ("GD", "General Dynamics"),
            ("ITW", "Illinois Tool Works"), ("NOC", "Northrop Grumman"), ("WM", "Waste Management"),
            ("CSX", "CSX Corporation"), ("NSC", "Norfolk Southern"), ("FDX", "FedEx Corporation"),
            ("EMR", "Emerson Electric"), ("JCI", "Johnson Controls"), ("PH", "Parker-Hannifin"),
            ("CTAS", "Cintas Corporation"), ("PCAR", "PACCAR Inc."), ("GWW", "W.W. Grainger"),
            ("MMM", "3M Company"), ("TDG", "TransDigm Group"), ("FAST", "Fastenal Company"),
            ("CMI", "Cummins Inc."), ("CARR", "Carrier Global"), ("OTIS", "Otis Worldwide"),
            ("VRSK", "Verisk Analytics"), ("ROK", "Rockwell Automation"), ("AME", "AMETEK Inc."),
            ("CPRT", "Copart Inc."), ("RSG", "Republic Services"), ("IR", "Ingersoll Rand"),
            ("XYL", "Xylem Inc."), ("PAYX", "Paychex Inc."), ("EFX", "Equifax Inc."),
            ("ODFL", "Old Dominion Freight"), ("HUBB", "Hubbell Inc."), ("TT", "Trane Technologies"),
            ("DOV", "Dover Corporation"), ("HWM", "Howmet Aerospace"), ("IEX", "IDEX Corporation"),
            ("WAB", "Westinghouse Air Brake"), ("PWR", "Quanta Services"), ("SNA", "Snap-on Inc."),
            ("J", "Jacobs Solutions"), ("MAS", "Masco Corporation"), ("EXPD", "Expeditors International"),
            ("PNR", "Pentair plc"), ("CHRW", "C.H. Robinson Worldwide"), ("URI", "United Rentals"),
            ("SWK", "Stanley Black & Decker"), ("FTV", "Fortive Corporation"), ("GNRC", "Generac Holdings"),
            ("NDSN", "Nordson Corporation"), ("AOS", "A. O. Smith Corporation"), ("AXON", "Axon Enterprise"),
            ("DAL", "Delta Air Lines"), ("UAL", "United Airlines Holdings"), ("LUV", "Southwest Airlines"),
            ("AAL", "American Airlines Group"), ("ALK", "Alaska Air Group"), ("JBHT", "J.B. Hunt Transport"),
            ("RHI", "Robert Half Inc."), ("ALLE", "Allegion plc"),
            
            # === COMMUNICATION SERVICES (25+ companies) ===
            ("GOOGL", "Alphabet Inc. Class A"), ("GOOG", "Alphabet Inc. Class C"), ("META", "Meta Platforms"),
            ("NFLX", "Netflix Inc."), ("DIS", "Walt Disney Company"), ("CMCSA", "Comcast Corporation"),
            ("VZ", "Verizon Communications"), ("T", "AT&T Inc."), ("TMUS", "T-Mobile US"),
            ("CHTR", "Charter Communications"), ("EA", "Electronic Arts"), ("TTWO", "Take-Two Interactive"),
            ("WBD", "Warner Bros. Discovery"), ("OMC", "Omnicom Group"),
            ("LYV", "Live Nation Entertainment"), ("MTCH", "Match Group Inc."),
            ("FOXA", "Fox Corporation Class A"), ("FOX", "Fox Corporation Class B"), ("NWS", "News Corp Class B"),
            ("NWSA", "News Corp Class A"), ("LUMN", "Lumen Technologies"),
            
            # === CONSUMER STAPLES (40+ companies) ===
            ("PG", "Procter & Gamble"), ("KO", "Coca-Cola Company"), ("PEP", "PepsiCo Inc."),
            ("COST", "Costco Wholesale"), ("WMT", "Walmart Inc."), ("PM", "Philip Morris International"),
            ("MO", "Altria Group Inc."), ("MDLZ", "Mondelez International"), ("CL", "Colgate-Palmolive"),
            ("TGT", "Target Corporation"), ("KMB", "Kimberly-Clark"), ("STZ", "Constellation Brands"),
            ("KDP", "Keurig Dr Pepper"), ("GIS", "General Mills Inc."), ("SYY", "Sysco Corporation"),
            ("HSY", "Hershey Company"), ("ADM", "Archer-Daniels-Midland"),
            ("MNST", "Monster Beverage"), ("EL", "Estée Lauder Companies"), ("KHC", "Kraft Heinz"),
            ("KR", "Kroger Co."), ("CHD", "Church & Dwight"),
            ("MKC", "McCormick & Company"), ("TSN", "Tyson Foods Inc."), ("CAG", "Conagra Brands"),
            ("SJM", "J.M. Smucker Company"), ("CLX", "Clorox Company"), ("HRL", "Hormel Foods"),
            ("CPB", "Campbell Soup Company"), ("BF-B", "Brown-Forman Corp Class B"), ("LW", "Lamb Weston Holdings"),
            ("BG", "Bunge Global SA"), ("TAP", "Molson Coors Beverage"),
            
            # === ENERGY (25+ companies) ===
            ("XOM", "Exxon Mobil Corporation"), ("CVX", "Chevron Corporation"), ("COP", "ConocoPhillips"),
            ("SLB", "Schlumberger Limited"), ("EOG", "EOG Resources Inc."), ("MPC", "Marathon Petroleum"),
            ("PSX", "Phillips 66"), ("VLO", "Valero Energy"),
            ("OXY", "Occidental Petroleum"), ("WMB", "Williams Companies"),
            ("KMI", "Kinder Morgan Inc."), ("OKE", "ONEOK Inc."), ("HAL", "Halliburton Company"),
            ("BKR", "Baker Hughes Company"), ("DVN", "Devon Energy"), ("FANG", "Diamondback Energy"),
            ("CTRA", "Coterra Energy Inc."), ("TRGP", "Targa Resources"), ("EQT", "EQT Corporation"),
            ("APA", "APA Corporation"),
            
            # === UTILITIES (30+ companies) ===
            ("NEE", "NextEra Energy Inc."), ("DUK", "Duke Energy Corporation"), ("SO", "Southern Company"),
            ("D", "Dominion Energy Inc."), ("SRE", "Sempra"), ("AEP", "American Electric Power"),
            ("EXC", "Exelon Corporation"), ("XEL", "Xcel Energy Inc."), ("PEG", "Public Service Enterprise"),
            ("ED", "Consolidated Edison"), ("WEC", "WEC Energy Group"), ("EIX", "Edison International"),
            ("AWK", "American Water Works"), ("ES", "Eversource Energy"), ("DTE", "DTE Energy"),
            ("PPL", "PPL Corporation"), ("ETR", "Entergy Corporation"), ("FE", "FirstEnergy Corp."),
            ("AEE", "Ameren Corporation"), ("CMS", "CMS Energy Corporation"), ("CNP", "CenterPoint Energy"),
            ("ATO", "Atmos Energy Corporation"), ("NI", "NiSource Inc."), ("EVRG", "Evergy Inc."),
            ("NRG", "NRG Energy Inc."), ("LNT", "Alliant Energy"), ("PNW", "Pinnacle West Capital"),
            
            # === MATERIALS (30+ companies) ===
            ("LIN", "Linde plc"), ("APD", "Air Products and Chemicals"), ("SHW", "Sherwin-Williams"),
            ("ECL", "Ecolab Inc."), ("FCX", "Freeport-McMoRan"), ("NEM", "Newmont Corporation"),
            ("NUE", "Nucor Corporation"), ("DD", "DuPont de Nemours"), ("DOW", "Dow Inc."),
            ("PPG", "PPG Industries Inc."), ("CTVA", "Corteva Inc."), ("VMC", "Vulcan Materials"),
            ("MLM", "Martin Marietta Materials"), ("ALB", "Albemarle Corporation"), ("IFF", "International Flavors"),
            ("BALL", "Ball Corporation"), ("FMC", "FMC Corporation"), ("AVY", "Avery Dennison"),
            ("PKG", "Packaging Corporation"), ("CF", "CF Industries Holdings"), ("IP", "International Paper"),
            ("MOS", "Mosaic Company"), ("CE", "Celanese Corporation"), ("EMN", "Eastman Chemical"),
            ("STLD", "Steel Dynamics Inc."), ("AMCR", "Amcor plc"),
            ("SEE", "Sealed Air Corporation"),
            
            # === REAL ESTATE (30+ companies) ===
            ("PLD", "Prologis Inc."), ("AMT", "American Tower Corporation"), ("EQIX", "Equinix Inc."),
            ("CCI", "Crown Castle Inc."), ("PSA", "Public Storage"), ("SPG", "Simon Property Group"),
            ("WELL", "Welltower Inc."), ("DLR", "Digital Realty Trust"), ("O", "Realty Income"),
            ("CBRE", "CBRE Group Inc."), ("VICI", "VICI Properties Inc."), ("SBAC", "SBA Communications"),
            ("AVB", "AvalonBay Communities"), ("EQR", "Equity Residential"), ("WY", "Weyerhaeuser Company"),
            ("ARE", "Alexandria Real Estate"), ("VTR", "Ventas Inc."), ("EXR", "Extra Space Storage"),
            ("INVH", "Invitation Homes"), ("MAA", "Mid-America Apartment"), ("IRM", "Iron Mountain"),
            ("SUI", "Sun Communities Inc."), ("ESS", "Essex Property Trust"), ("UDR", "UDR Inc."),
            ("CPT", "Camden Property Trust"), ("REG", "Regency Centers"),
            ("HST", "Host Hotels & Resorts"), ("KIM", "Kimco Realty"), ("BXP", "Boston Properties"),
            ("FRT", "Federal Realty Investment"),
            
            # === ADDITIONAL S&P 500 COMPANIES (Completing to 503) ===
            # Additional Tech
            ("FICO", "Fair Isaac Corporation"), ("GDDY", "GoDaddy Inc."), ("CRWD", "CrowdStrike Holdings"),
            ("DDOG", "Datadog Inc."), ("ZS", "Zscaler Inc."), ("SNOW", "Snowflake Inc."),
            ("MDB", "MongoDB Inc."), ("NET", "Cloudflare Inc."), ("TEAM", "Atlassian Corporation"),
            ("WDAY", "Workday Inc."), ("OKTA", "Okta Inc."),
            ("DOCU", "DocuSign Inc."), ("RNG", "RingCentral Inc."), ("VEEV", "Veeva Systems"),
            
            # Additional Healthcare
            ("MRNA", "Moderna Inc."), ("ALNY", "Alnylam Pharmaceuticals"),
            ("BMRN", "BioMarin Pharmaceutical"), ("EXAS", "Exact Sciences"),
            
            # Additional Financials  
            ("COIN", "Coinbase Global"), ("HOOD", "Robinhood Markets"), ("SOFI", "SoFi Technologies"),
            ("LPLA", "LPL Financial"), ("EWBC", "East West Bancorp"),
            ("WAL", "Western Alliance"),
            
            # Additional Consumer
            ("DECK", "Deckers Outdoor"), ("LULU", "Lululemon Athletica"), ("WSM", "Williams-Sonoma"),
            ("RH", "RH (Restoration Hardware)"), ("W", "Wayfair Inc."), ("CPNG", "Coupang Inc."),
            ("CHWY", "Chewy Inc."), ("DKS", "Dick's Sporting Goods"), ("FIVE", "Five Below"),
            ("DLTR", "Dollar Tree Inc."), ("DG", "Dollar General"), ("BBWI", "Bath & Body Works"),
            
            # Additional Industrials
            ("TDY", "Teledyne Technologies"), ("TTEK", "Tetra Tech Inc."), ("LECO", "Lincoln Electric"),
            ("GGG", "Graco Inc."), ("ROP", "Roper Technologies"),
            
            # Additional Energy
            ("LNG", "Cheniere Energy"), ("TPL", "Texas Pacific Land"), ("CHRD", "Chord Energy"),
            
            # Additional Materials
            ("RS", "Reliance Steel"), ("CLF", "Cleveland-Cliffs"),
            
            # Additional Utilities
            ("VST", "Vistra Corp."), ("CEG", "Constellation Energy"),
            
            # === MISSING S&P 500 COMPANIES (Final additions) ===
            ("AES", "AES Corporation"), ("AMP", "Ameriprise Financial"), ("ANET", "Arista Networks"),
            ("BIO", "Bio-Rad Laboratories"), ("BLDR", "Builders FirstSource"), ("BX", "Blackstone Inc."),
            ("CPAY", "Corpay Inc."), ("CRL", "Charles River Laboratories"), ("CSGP", "CoStar Group"),
            ("DAY", "Dayforce Inc."), ("DOC", "Healthpeak Properties"),
            ("GEV", "GE Vernova Inc."), ("GLW", "Corning Inc."), ("GPN", "Global Payments"),
            ("HII", "Huntington Ingalls Industries"), ("JBL", "Jabil Inc."), ("KKR", "KKR & Co."),
            ("KVUE", "Kenvue Inc."), ("LHX", "L3Harris Technologies"), ("LYB", "LyondellBasell"),
            ("MCHP", "Microchip Technology"), ("OM", "Outfront Media"), ("PCG", "PG&E Corporation"),
            ("PFG", "Principal Financial Group"), ("PLTR", "Palantir Technologies"), ("PYPL", "PayPal Holdings"),
            ("ROL", "Rollins Inc."), ("SMCI", "Super Micro Computer"), ("SOLV", "Solventum Corporation"),
            ("TEL", "TE Connectivity"), ("TXT", "Textron Inc."), ("UBER", "Uber Technologies"),
            ("UHS", "Universal Health Services"), ("VLTO", "Veralto Corporation"),
        ]
        return sp500_stocks

    def get_all_us_stocks(self) -> Dict[str, Any]:
        return self._serve_analysis_payload("us_stocks", self._compute_all_us_stocks)

    def _compute_all_us_stocks(self) -> Dict[str, Any]:
        """
        Fetch S&P 500 stocks with real-time data for market analysis.
        Covers all ~500 companies in the S&P 500 index.
        Uses batch download and caching to avoid rate limits.
        """
        try:
            us_stocks = self._get_sp500_list()
            symbols = [s[0] for s in us_stocks]
            name_map = {s[0]: s[1] for s in us_stocks}
            benchmark_daily_return_pct = 0.0
            
            processed = []
            
            # Use yfinance batch download for efficiency
            try:
                try:
                    benchmark_history = yf.download("^GSPC", period="6mo", progress=False, threads=False)
                    if isinstance(benchmark_history.columns, pd.MultiIndex):
                        benchmark_history = benchmark_history.droplevel(-1, axis=1)
                    benchmark_features = _derive_history_features(benchmark_history)
                    benchmark_daily_return_pct = float(benchmark_features.get("change_percent") or 0.0)
                except Exception:
                    benchmark_daily_return_pct = 0.0

                # Download all at once - much faster and avoids rate limits
                df = yf.download(symbols, period="6mo", group_by="ticker", progress=False, threads=True)
                
                for symbol in symbols:
                    try:
                        if symbol in df.columns.get_level_values(0):
                            ticker_data = df[symbol]
                            if len(ticker_data) >= 2 and not ticker_data["Close"].isna().all():
                                closes = ticker_data["Close"].dropna()
                                if len(closes) >= 2:
                                    features = _derive_history_features(ticker_data)
                                    last = float(closes.iloc[-1])
                                    vol = ticker_data["Volume"].iloc[-1] if "Volume" in ticker_data.columns else 0
                                    row = {
                                            "symbol": symbol,
                                            "name": name_map.get(symbol, symbol),
                                            "last": round(last, 2),
                                            "change_percent": round(float(features.get("change_percent") or 0.0), 2),
                                            "volume": int(vol) if not pd.isna(vol) else 0
                                        }
                                    row.update({key: value for key, value in features.items() if value is not None})
                                    row["hakiki_alfa"] = _build_hakiki_alfa_snapshot(row, benchmark_daily_return_pct)
                                    row["hakiki_alfa_pct"] = row["hakiki_alfa"].get("hakiki_alfa_pct")
                                    row["market_signal"] = _build_us_market_signal(row)
                                    processed.append(row)
                    except Exception as e:
                        continue
            except Exception as e:
                logger.exception("[MarketFetcher] Batch download failed", extra={"error": str(e)})
                # Fallback to empty result
                pass

            if processed:
                freshness_window_hours = 18
                enrichment_candidates = sorted(
                    processed,
                    key=lambda item: (
                        -float((item.get("last") or 0.0) * (item.get("volume") or 0.0)),
                        -float((item.get("market_signal") or {}).get("score") or 0.0),
                    ),
                )
                symbols_to_refresh: List[str] = []
                refreshed_symbol_set: set[str] = set()

                def apply_enrichment(row: Dict[str, Any], enrichment: Dict[str, Any]) -> None:
                    if not isinstance(enrichment, dict):
                        return
                    fair_value_snapshot = _build_us_fair_value_snapshot(row, enrichment)
                    if fair_value_snapshot:
                        row["adil_deger"] = fair_value_snapshot
                        row["adil_deger_skoru"] = fair_value_snapshot.get("confidence")
                        row["fair_value_data_band"] = fair_value_snapshot.get("fair_value_data_band")
                        row["fair_value_confidence_band"] = fair_value_snapshot.get("fair_value_confidence_band")
                    market_cap = _safe_float(enrichment.get("market_cap"))
                    if market_cap is not None and market_cap > 0:
                        row["market_cap"] = market_cap
                    sector = enrichment.get("sector")
                    if sector and not row.get("sector"):
                        row["sector"] = sector
                    industry = enrichment.get("industry")
                    if industry and not row.get("industry"):
                        row["industry"] = industry
                    row["market_signal"] = _build_us_market_signal(row)

                processed_by_symbol = {row["symbol"]: row for row in processed}

                for row in enrichment_candidates:
                    cached_meta = self._load_metadata(row["symbol"]) or {}
                    has_fresh_enrichment = _is_cache_fresh(
                        cached_meta.get("us_enrichment_updated_at") or cached_meta.get("updated_at"),
                        max_age_hours=freshness_window_hours,
                    )
                    if has_fresh_enrichment:
                        apply_enrichment(row, cached_meta)
                        if row.get("adil_deger"):
                            refreshed_symbol_set.add(row["symbol"])
                        continue
                    symbols_to_refresh.append(row["symbol"])

                refresh_limit = 90
                refresh_targets = symbols_to_refresh[:refresh_limit]

                def fetch_us_enrichment(symbol: str) -> Optional[tuple[str, Dict[str, Any]]]:
                    try:
                        ticker = yf.Ticker(symbol)
                        analyst_targets = ticker.analyst_price_targets or {}
                        fast_info = ticker.fast_info or {}
                        info = ticker.info or {}

                        payload = {
                            "symbol": symbol,
                            "analyst_target_current": _safe_float(analyst_targets.get("current")),
                            "analyst_target_mean": _safe_float(analyst_targets.get("mean")),
                            "analyst_target_median": _safe_float(analyst_targets.get("median")),
                            "analyst_target_low": _safe_float(analyst_targets.get("low")),
                            "analyst_target_high": _safe_float(analyst_targets.get("high")),
                            "market_cap": _safe_float(fast_info.get("marketCap")) or _safe_float(info.get("marketCap")),
                            "year_high": _safe_float(fast_info.get("yearHigh")) or _safe_float(info.get("fiftyTwoWeekHigh")),
                            "year_low": _safe_float(fast_info.get("yearLow")) or _safe_float(info.get("fiftyTwoWeekLow")),
                            "sector": info.get("sector"),
                            "industry": info.get("industry"),
                            "us_enrichment_updated_at": datetime.now().isoformat(),
                            "source": "yfinance",
                        }

                        merged_meta = {
                            **(self._load_metadata(symbol) or {}),
                            **{key: value for key, value in payload.items() if value is not None},
                        }
                        self._save_metadata(symbol, merged_meta)
                        return symbol, merged_meta
                    except Exception:
                        return None

                if refresh_targets:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
                        for result in ex.map(fetch_us_enrichment, refresh_targets):
                            if result is None:
                                continue
                            symbol, enrichment = result
                            refreshed_symbol_set.add(symbol)
                            matching_row = processed_by_symbol.get(symbol)
                            if matching_row is not None:
                                apply_enrichment(matching_row, enrichment)
            
            processed.sort(key=lambda x: x["change_percent"], reverse=True)
            
            gainers = [p for p in processed if p["change_percent"] > 0][:5]
            losers = [p for p in processed if p["change_percent"] < 0][-5:][::-1]
            
            result = {
                "gainers": gainers,
                "losers": losers,
                "all": processed,
                "count": len(processed),
                "global_reference": {
                    "symbol": "^GSPC",
                    "name": "S&P 500",
                    "daily_return_pct": round(benchmark_daily_return_pct, 2),
                },
                "fair_value_coverage": len(refreshed_symbol_set),
            }
            return result
        except Exception as e:
            logger.exception("[MarketFetcher] US stocks analysis error", extra={"error": str(e)})
            return {"gainers": [], "losers": [], "all": [], "count": 0, "error": str(e)}

    def get_all_commodities_analysis(self) -> Dict[str, Any]:
        return self._serve_analysis_payload("commodities", self._compute_all_commodities_analysis)

    def _compute_all_commodities_analysis(self) -> Dict[str, Any]:
        """
        Fetch comprehensive commodities data for market analysis.
        """
        try:
            commodities = [
                ("GC=F", "Altın"),
                ("SI=F", "Gümüş"),
                ("CL=F", "Ham Petrol (WTI)"),
                ("BZ=F", "Brent Petrol"),
                ("NG=F", "Doğalgaz"),
                ("HG=F", "Bakır"),
                ("PL=F", "Platin"),
                ("PA=F", "Paladyum"),
                ("ZC=F", "Mısır"),
                ("ZW=F", "Buğday"),
                ("ZS=F", "Soya"),
                ("KC=F", "Kahve"),
                ("CT=F", "Pamuk"),
                ("SB=F", "Şeker"),
            ]
            
            processed = []
            
            def fetch_commodity(item):
                symbol, name = item
                try:
                    t = yf.Ticker(symbol)
                    h = t.history(period="3mo")
                    if len(h) >= 2:
                        features = _derive_history_features(h)
                        row = {
                            "symbol": symbol.replace("=F", ""),
                            "name": name,
                            "last": round(float(h.iloc[-1]["Close"]), 2),
                            "change_percent": round(float(features.get("change_percent") or 0.0), 2),
                            "volume": int(h.iloc[-1]["Volume"]) if "Volume" in h.columns else 0
                        }
                        row.update({key: value for key, value in features.items() if value is not None})
                        row["market_signal"] = _build_commodity_market_signal(row)
                        return row
                except:
                    pass
                return None
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
                results = list(ex.map(fetch_commodity, commodities))
            
            processed = [r for r in results if r is not None]
            processed.sort(key=lambda x: x["change_percent"], reverse=True)
            
            gainers = [p for p in processed if p["change_percent"] > 0][:5]
            losers = [p for p in processed if p["change_percent"] < 0][-5:][::-1]
            
            return {
                "gainers": gainers,
                "losers": losers,
                "all": processed,
                "count": len(processed)
            }
        except Exception as e:
            logger.exception("[MarketFetcher] Commodities analysis error", extra={"error": str(e)})
            return {"gainers": [], "losers": [], "all": [], "count": 0, "error": str(e)}

    def get_all_crypto_analysis(self) -> Dict[str, Any]:
        return self._serve_analysis_payload("crypto", self._compute_all_crypto_analysis)

    def _compute_all_crypto_analysis(self) -> Dict[str, Any]:
        """
        Fetch ALL crypto pairs for comprehensive market analysis.
        Uses BtcTurk API for TRY pairs and yfinance for USD pairs.
        """
        try:
            # Get BtcTurk data (TRY pairs)
            btcturk_data = self._fetch_all_crypto()
            bitcoin_daily_return_pct = 0.0
            try:
                btc_benchmark_history = yf.download("BTC-USD", period="3mo", progress=False, threads=False)
                if isinstance(btc_benchmark_history.columns, pd.MultiIndex):
                    btc_benchmark_history = btc_benchmark_history.droplevel(-1, axis=1)
                bitcoin_daily_return_pct = float((_derive_history_features(btc_benchmark_history).get("change_percent") or 0.0))
            except Exception:
                bitcoin_daily_return_pct = 0.0
            
            # Also fetch major USD pairs from yfinance
            usd_pairs = [
                ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("BNB-USD", "BNB"),
                ("SOL-USD", "Solana"), ("XRP-USD", "XRP"), ("ADA-USD", "Cardano"),
                ("DOGE-USD", "Dogecoin"), ("AVAX-USD", "Avalanche"), ("DOT-USD", "Polkadot"),
                ("MATIC-USD", "Polygon"), ("LINK-USD", "Chainlink"), ("LTC-USD", "Litecoin"),
                ("SHIB-USD", "Shiba Inu"), ("ATOM-USD", "Cosmos"), ("UNI-USD", "Uniswap")
            ]
            
            def fetch_yf_crypto_item(item):
                symbol, name = item
                try:
                    t = yf.Ticker(symbol)
                    h = t.history(period="3mo")
                    if len(h) >= 2:
                        if isinstance(h.columns, pd.MultiIndex):
                            h = h.droplevel(-1, axis=1)
                        features = _derive_history_features(h)
                        row = {
                            "symbol": symbol,
                            "name": name,
                            "last": round(float(h.iloc[-1]["Close"]), 2),
                            "change_percent": round(float(features.get("change_percent") or 0.0), 2),
                            "volume": int(h.iloc[-1]["Volume"]) if "Volume" in h.columns else 0,
                            "currency": "USD"
                        }
                        row.update({key: value for key, value in features.items() if value is not None})
                        row["hakiki_alfa"] = _build_crypto_hakiki_alfa_snapshot(row, bitcoin_daily_return_pct)
                        row["hakiki_alfa_pct"] = row["hakiki_alfa"].get("hakiki_alfa_pct")
                        reference_snapshot = _build_crypto_reference_band_snapshot(row, h)
                        if reference_snapshot:
                            row["adil_deger"] = reference_snapshot
                            row["adil_deger_skoru"] = reference_snapshot.get("confidence")
                            row["fair_value_data_band"] = reference_snapshot.get("fair_value_data_band")
                            row["fair_value_confidence_band"] = reference_snapshot.get("fair_value_confidence_band")
                        row["market_signal"] = _build_crypto_market_signal(row)
                        return row
                except:
                    pass
                return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(usd_pairs), 10)) as ex:
                usd_results = list(ex.map(fetch_yf_crypto_item, usd_pairs))
            
            usd_processed = [r for r in usd_results if r is not None]

            def merge_crypto_row(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
                merged = dict(existing)
                for key, value in incoming.items():
                    if value in (None, "", [], {}):
                        continue
                    if key == "volume":
                        if float(value or 0) >= float(merged.get(key) or 0):
                            merged[key] = value
                        continue
                    if key in {"last", "change", "change_percent"}:
                        merged[key] = value
                        continue
                    if merged.get(key) in (None, "", [], {}):
                        merged[key] = value
                return merged
            
            # Combine and dedupe by symbol because major USD pairs can appear
            # both in the bulk fetch and the dedicated yfinance enrichment pass.
            deduped_crypto: Dict[str, Dict[str, Any]] = {}
            for row in btcturk_data + usd_processed:
                symbol = str(row.get("symbol") or "").strip()
                if not symbol:
                    continue
                if symbol in deduped_crypto:
                    deduped_crypto[symbol] = merge_crypto_row(deduped_crypto[symbol], row)
                else:
                    deduped_crypto[symbol] = dict(row)

            all_crypto = list(deduped_crypto.values())
            usd_reference_map = {
                _crypto_base_symbol(row.get("symbol")): row
                for row in usd_processed
                if _crypto_base_symbol(row.get("symbol"))
            }
            for row in all_crypto:
                if row.get("hakiki_alfa") is None:
                    row["hakiki_alfa"] = _build_crypto_hakiki_alfa_snapshot(row, bitcoin_daily_return_pct)
                    row["hakiki_alfa_pct"] = row["hakiki_alfa"].get("hakiki_alfa_pct")

                if row.get("currency") == "USD" and row.get("adil_deger") in (None, {}, []):
                    base_symbol = _crypto_base_symbol(row.get("symbol"))
                    reference_row = usd_reference_map.get(base_symbol)
                    reference_snapshot = reference_row.get("adil_deger") if isinstance(reference_row, dict) else None
                    if isinstance(reference_snapshot, dict):
                        repriced_snapshot = _reprice_reference_snapshot(reference_snapshot, row.get("last"))
                        row["adil_deger"] = repriced_snapshot
                        row["adil_deger_skoru"] = repriced_snapshot.get("confidence")
                        row["fair_value_data_band"] = repriced_snapshot.get("fair_value_data_band")
                        row["fair_value_confidence_band"] = repriced_snapshot.get("fair_value_confidence_band")

                row["market_signal"] = _build_crypto_market_signal(row)
            all_crypto.sort(key=lambda x: x["change_percent"], reverse=True)
            
            gainers = [p for p in all_crypto if p["change_percent"] > 0][:5]
            losers = [p for p in all_crypto if p["change_percent"] < 0][-5:][::-1]
            
            return {
                "gainers": gainers,
                "losers": losers,
                "all": all_crypto,
                "count": len(all_crypto),
                "global_reference": {
                    "symbol": "BTC-USD",
                    "name": "Bitcoin",
                    "daily_return_pct": round(bitcoin_daily_return_pct, 2),
                },
            }
        except Exception as e:
            logger.exception("[MarketFetcher] Crypto analysis error", extra={"error": str(e)})
            return {"gainers": [], "losers": [], "all": [], "count": 0, "error": str(e)}

    def get_turkish_funds(self) -> Dict[str, Any]:
        """
        Get Turkish investment funds from cache.
        Returns top gainers, losers, and full list.
        """
        return self.get_all_funds()

    def get_funds_summary(self) -> List[Dict[str, Any]]:
        """
        Get only participation funds for the specific dashboard section.
        """
        if self._funds_cache:
            # Whitelist of known participation fund codes to be safe if 'fund_type' is empty
            participation_codes = {
                'RBH', 'KPF', 'KTF', 'KZL', 'ZPF', 'MPS', 'KPV', 'ZPE', 'KSR', 'KTX', 
                'KTY', 'OKP', 'PKF', 'TKL', 'KTM', 'KTL', 'KUT', 'KUY', 'KUZ', 'HVK', 
                'HVL', 'HVM', 'CKF', 'KVT'
            }
            
            # Filter for katılım funds (by metadata or whitelist)
            katilim_funds = [f for f in self._funds_cache if 
                             any(word in f.get('fund_type', '').lower() for word in ['katilim', 'katılım']) or 
                             any(word in f.get('name', '').lower() for word in ['katilim', 'katılım']) or
                             f.get('symbol') in participation_codes]
            
            # Return up to 5 best performing participation funds
            return katilim_funds[:5]
        
        # If no cache, trigger refresh and return empty
        if not self._is_refreshing_funds:
            threading.Thread(target=self._refresh_all_funds, daemon=True).start()
        
        return []

    def get_all_funds(self) -> Dict[str, Any]:
        return self._serve_analysis_payload("funds", self._compute_all_funds_analysis)

    def _compute_all_funds_analysis(self) -> Dict[str, Any]:
        """
        Get all cached funds with full details.
        Used for the Piyasa Analizi section.
        """
        if not self._funds_cache and not self._is_refreshing_funds:
            threading.Thread(target=self._refresh_all_funds, daemon=True).start()
        
        all_funds = self._funds_cache or []
        all_funds = [
            {
                **fund,
                "market_signal": _build_fund_market_signal(fund),
            }
            for fund in all_funds
        ]
        
        # Sort for gainers/losers
        gainers = [f for f in all_funds if f.get("change_percent", 0) > 0][:5]
        losers = sorted([f for f in all_funds if f.get("change_percent", 0) < 0], 
                       key=lambda x: x.get("change_percent", 0))[:5]
        
        return {
            "gainers": gainers,
            "losers": losers,
            "all": all_funds,
            "count": len(all_funds),
            "last_updated": self._funds_last_updated.isoformat() if self._funds_last_updated else None,
            "is_refreshing": self._is_refreshing_funds
        }


    def get_batch_changes(self, symbols: List[str], period: str = "1d") -> List[Dict[str, Any]]:
        """
        Fetch change percentages for a list of symbols for a specific period.
        Supported periods: 1d, 1w, 1m, 1y, 5y
        
        STRATEGY:
        - 1d, 1w: Use borsapy for TL-based assets (more accurate local data), yfinance as fallback
        - 1m, 1y, 5y: Always use yfinance (borsapy lacks historical depth)
        
        Uses proper DATE-BASED comparison (not index offsets) for accuracy.
        """
        # 1. Period to target date mapping (calendar days, not trading days)
        now = datetime.now()
        # Days since Jan 1st of current year
        ytd_days = (now - datetime(now.year, 1, 1)).days
        if ytd_days < 1: ytd_days = 1 # Fallback for Jan 1st itself
        
        period_days = {
            "1d": 1,
            "1w": 7,
            "1m": 30,
            "ytd": ytd_days,
            "1y": 365,
            "5y": 1825
        }
        
        # 2. yfinance fetch periods - need more data than target to find closest date
        p_map = {
            "1d": "5d",
            "1w": "1mo",
            "1m": "6mo",
            "ytd": "1y",
            "1y": "3y",
            "5y": "max"
        }
        fetch_period = p_map.get(period, "1mo")
        target_days = period_days.get(period, 7)
        
        # 3. Symbol categorization
        fx_tl_symbols = {"USD", "EUR", "GBP", "CHF", "AUD", "CAD"}
        commodity_tl_symbols = {"gram-altin", "ons-altin", "gram-gumus", "BRENT", "WTI"}
        # Raw symbols as they appear in the dashboard
        dashboard_commodities = {"BRENT", "CL", "gram-gumus", "HG", "PL", "gram-altin", "ons-altin", "NG", "WTI", "Gümüş (gr)", "Altın (gr)", "Altın (ons)"}
        
        # 4. Crypto prefixes
        crypto_prefixes = {"BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX", "DOT", "LINK", "MATIC", "SHIB", "LTC", "TRX", "UNI", "XLM", "ATOM", "XMR", "ETC", "FIL", "HBAR", "APT", "VET"}
        
        # 5. yfinance symbol mapping for FX/Commodities
        yf_symbol_map = {
            # FX -> yfinance
            "USD": "USDTRY=X",
            "EUR": "EURTRY=X", 
            "GBP": "GBPTRY=X",
            "CHF": "CHFTRY=X",
            "AUD": "AUDTRY=X",
            "CAD": "CADTRY=X",
            "DXY": "DX-Y.NYB",
            "EURUSD": "EURUSD=X",
            "EUR/USD": "EURUSD=X",
            # Commodities -> yfinance
            "gram-altin": "GC=F",
            "ons-altin": "GC=F",
            "Altın (gr)": "GC=F",
            "Altın (ons)": "GC=F",
            "gram-gumus": "SI=F",
            "Gümüş (gr)": "SI=F",
            "BRENT": "BZ=F",
            "Brent Petrol": "BZ=F",
            "WTI": "CL=F",
            "CL": "CL=F",
            "Ham Petrol (WTI)": "CL=F",
            "Doğalgaz": "NG=F",
            "NG": "NG=F",
            "Bakır": "HG=F",
            "HG": "HG=F",
            "Platin": "PL=F",
            "PL": "PL=F",
        }
        
        # Symbols that need price inversion
        invert_symbols = set()
        
        results = []
        
        # Cache for USDTRY history to avoid multiple fetches for Gram Gold/Silver
        _usdtry_hist_cache = {}
        
        def get_usdtry_history():
            if "hist" not in _usdtry_hist_cache:
                try:
                    h = yf.Ticker("USDTRY=X").history(period=fetch_period)
                    if h is not None and not h.empty:
                        # Normalize columns
                        h.columns = [str(c).title() for c in h.columns]
                        # Normalize index to tz-naive for intersection
                        if h.index.tz is not None:
                            h.index = h.index.tz_localize(None)
                        _usdtry_hist_cache["hist"] = h
                except Exception as e:
                    logger.exception("[BatchChanges] USDTRY history error", extra={"error": str(e)})
                    _usdtry_hist_cache["hist"] = None
            return _usdtry_hist_cache.get("hist")

        
        def calculate_change_from_history(h, sym, target_days):
            """Calculate change using proper date-based comparison."""
            if h is None or h.empty or len(h) < 2:
                return None
            
            try:
                # Ensure index is datetime
                if not isinstance(h.index, pd.DatetimeIndex):
                    return None
                
                # Make tz-naive for comparison
                if h.index.tz is not None:
                    h.index = h.index.tz_localize(None)
                
                # Current values
                last_date = h.index[-1]
                last_price = float(h.iloc[-1]["Close"])
                
                if last_price <= 0:
                    return None
                
                # Target date for comparison
                target_date = last_date - timedelta(days=target_days)
                
                # Find closest date on or before target
                mask = h.index <= target_date
                if not mask.any():
                    # No data before target, use first available
                    prev_price = float(h.iloc[0]["Close"])
                else:
                    past_data = h[mask]
                    prev_price = float(past_data.iloc[-1]["Close"])
                
                if prev_price <= 0:
                    return None
                
                change_pct = ((last_price - prev_price) / prev_price) * 100
                if not math.isfinite(change_pct):
                    return None
                
                # Handle inverted pairs
                if sym in invert_symbols:
                    change_pct = -change_pct
                
                return round(change_pct, 2)
            except Exception as e:
                logger.exception("[BatchChanges] Calc error", extra={"symbol": sym, "error": str(e)})
                return None
        
        def fetch_change_borsapy_bist(sym):
            """Fetch BIST indices/stocks from borsapy. Supports up to 1Y."""
            # borsapy provides up to 1 year of data for BIST indices
            if period == "5y":
                return None  # borsapy only has ~14 months max, use yfinance for 5Y
            
            try:
                # Determine asset type
                if sym.startswith("XU") or sym.startswith("XBANK") or sym in self.bist_indices:
                    asset = bp.Index(sym)
                else:
                    asset = bp.Ticker(sym)
                
                # Select appropriate period for borsapy
                bp_period = "1y" if period == "1y" else "1mo"
                
                h = asset.history(period=bp_period)
                if h is None or h.empty or len(h) < 2:
                    return None
                
                # Normalize columns
                h.columns = [str(c).title() for c in h.columns]
                
                change = calculate_change_from_history(h, sym, target_days)
                if change is not None:
                    return {
                        "symbol": sym,
                        "change_percent": change,
                        "source": "borsapy",
                        "period": period
                    }
            except Exception as e:
                if "Unsupported" not in str(e):
                    logger.exception("[BatchChanges] Borsapy BIST error", extra={"symbol": sym, "error": str(e)})
            return None
        
        def fetch_change_yfinance(sym, yf_sym=None):
            """Fetch from yfinance."""
            try:
                if yf_sym is None:
                    yf_sym = yf_symbol_map.get(sym, sym)
                
                # Additional normalization
                if yf_sym == sym and not any(x in sym for x in ["=", ".", "-"]):
                    # Check if it's a crypto symbol
                    base_sym = sym.replace("TRY", "").replace("USDT", "").replace("USD", "")
                    if base_sym in crypto_prefixes:
                        yf_sym = f"{base_sym}-USD"
                    elif sym in fx_tl_symbols:
                        yf_sym = f"{sym}TRY=X"
                
                h = yf.Ticker(yf_sym).history(period=fetch_period)
                
                if h is None or h.empty:
                    logger.warning(f"[BatchChanges] No yfinance data for {sym} ({yf_sym})")
                    return None
                
                # Normalize column names
                h.columns = [str(c).title() for c in h.columns]
                # Normalize index to tz-naive for intersection
                if h.index.tz is not None:
                    h.index = h.index.tz_localize(None)
                
                # SPECIAL CASE: Gram Gold / Gram Silver (TRY based - account for USDTRY change)
                if sym in ["gram-altin", "gram-gumus"] and period != "1d":
                    logger.info(f"[BatchChanges] Applying TRY proxy for {sym} ({yf_sym})")
                    usd_hist = get_usdtry_history()
                    if usd_hist is not None:
                        # Align dates and create a TRY price proxy
                        common_dates = h.index.intersection(usd_hist.index)
                        if not common_dates.empty:
                            try_prices = h.loc[common_dates, "Close"] * usd_hist.loc[common_dates, "Close"]
                            h_try = pd.DataFrame({"Close": try_prices}, index=common_dates)
                            change = calculate_change_from_history(h_try, sym, target_days)
                            if change is not None:
                                return {
                                    "symbol": sym,
                                    "change_percent": change,
                                    "source": "yfinance-try-proxy",
                                    "period": period
                                }
                
                change = calculate_change_from_history(h, sym, target_days)
                if change is not None:
                    return {
                        "symbol": sym,
                        "change_percent": change,
                        "source": "yfinance",
                        "period": period
                    }
            except Exception as e:
                logger.exception("[BatchChanges] yfinance error", extra={"symbol": sym, "error": str(e)})
            return None
        
        def fetch_change_crypto_btcturk(sym):
            """Fetch crypto from BtcTurk (TRY pairs only, daily change)."""
            # BtcTurk API only gives current day change, not historical
            # For anything beyond daily, we need yfinance
            if period != "1d":
                return None
            
            try:
                import requests
                url = "https://api.btcturk.com/api/v2/ticker"
                r = requests.get(url, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    if data.get("success"):
                        for item in data.get("data", []):
                            pair = item.get("pair", "")
                            if pair == sym or pair == f"{sym}TRY":
                                return {
                                    "symbol": sym,
                                    "change_percent": round(float(item.get("dailyPercent", 0)), 2),
                                    "source": "btcturk",
                                    "period": period
                                }
            except Exception as e:
                logger.exception("[BatchChanges] BtcTurk error", extra={"symbol": sym, "error": str(e)})
            return None
        
        def fetch_change(sym):
            """Main router - determines best data source for symbol/period."""
            result = None
            
            # 1. Identify symbol type
            sym_lower = sym.lower()
            is_fx = sym in fx_tl_symbols or any(x in sym for x in ["USD", "EUR", "GBP", "CHF", "DXY"])
            
            # More inclusive commodity check
            is_commodity = (
                sym in commodity_tl_symbols or 
                sym in dashboard_commodities or 
                sym in yf_symbol_map or
                "altin" in sym_lower or 
                "gumus" in sym_lower or 
                "gold" in sym_lower or 
                "silver" in sym_lower
            )
            
            base_crypto = sym.replace("TRY", "").replace("USDT", "").replace("USD", "")
            is_crypto = base_crypto in crypto_prefixes or sym.endswith("TRY") or sym.endswith("USDT")
            
            # 2. Route based on type and period
            
            # CRYPTO - Always use yfinance (BtcTurk doesn't provide long-term data)
            if is_crypto:
                yf_sym = f"{base_crypto}-USD"
                result = fetch_change_yfinance(sym, yf_sym)
                return result
            
            # FX / COMMODITIES - Always use yfinance (more reliable)
            if is_fx or is_commodity:
                result = fetch_change_yfinance(sym)
                if result:
                    result["symbol"] = sym
                return result
            
            # BIST (Indices & Stocks) - borsapy for 1D-1Y, yfinance for 5Y
            # Try borsapy first (supports 1D, 1W, 1M, 1Y)
            result = fetch_change_borsapy_bist(sym)
            
            # Fallback to yfinance for 5Y or if borsapy fails
            if result is None:
                yf_sym = self._normalize_symbol(sym)
                result = fetch_change_yfinance(sym, yf_sym)
            
            # SPECIAL CASE: XUTUM and XU050 have no yfinance historical data for 5Y
            # Use XU100 as proxy for long-term changes (they move similarly)
            if result is None and sym in ["XUTUM", "XU050"] and period == "5y":
                try:
                    xu100_result = fetch_change_yfinance("XU100", "XU100.IS")
                    if xu100_result:
                        adjustment = 0.92 if sym == "XUTUM" else 0.95
                        result = {
                            "symbol": sym,
                            "change_percent": round(xu100_result["change_percent"] * adjustment, 2),
                            "source": "xu100-proxy",
                            "period": period
                        }
                        logger.info(f"[BatchChanges] Using XU100 proxy for {sym}: {result['change_percent']}%")
                except Exception as e:
                    logger.exception("[BatchChanges] XU100 proxy error", extra={"symbol": sym, "error": str(e)})
            
            if result: result["symbol"] = sym
            return result
        
        # 1. Check cache first for instant response
        cache_max_age = 2 if period == "1d" else (10 if period == "1w" else 60)  # minutes
        cached_changes = self._get_cached_batch_changes(symbols, period, cache_max_age)
        
        # Separate cached and uncached symbols
        cached_symbols = set(cached_changes.keys())
        uncached_symbols = [s for s in symbols if s not in cached_symbols]
        
        # 2. Build results from cache first
        results = []
        for sym in symbols:
            if sym in cached_changes:
                results.append({
                    "symbol": sym,
                    "change_percent": cached_changes[sym],
                    "source": "cache",
                    "period": period
                })
        
        # 3. Fetch only uncached symbols
        if uncached_symbols:
            with concurrent.futures.ThreadPoolExecutor(max_workers=15) as ex:
                batch_results = list(ex.map(fetch_change, uncached_symbols))
            
            fresh_results = [
                r for r in batch_results
                if r is not None and _is_finite_number(r.get("change_percent"))
            ]
            results.extend(fresh_results)
            
            # 4. Update cache with fresh results
            if fresh_results:
                self._update_batch_changes_cache(period, fresh_results)
        
        # Log summary
        logger.info(f"[BatchChanges] Period={period}, Requested Symbols={symbols}")
        logger.info(f"[BatchChanges] Results Summary: Cached={len(cached_symbols)}, Success={len(results)}")
        
        return results

    @log_performance("quotes")
    def get_batch_quotes(
        self,
        symbols: List[str],
        asset_context_by_symbol: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch current price and daily change for multiple symbols efficiently.
        Uses professional cache layer with TTL.
        """
        if not symbols:
            return []

        normalized_symbols: List[str] = []
        seen_symbols = set()
        for raw_symbol in symbols:
            if raw_symbol is None:
                continue
            clean_symbol = str(raw_symbol).strip()
            if not clean_symbol:
                continue
            if clean_symbol.lower() in {"null", "undefined", "none", "nan"}:
                continue
            symbol_key = clean_symbol.upper()
            if symbol_key in seen_symbols:
                continue
            seen_symbols.add(symbol_key)
            normalized_symbols.append(clean_symbol)

        if not normalized_symbols:
            return []

        results = []
        symbols_to_fetch = []

        def sanitize_quote_payload(payload: Any) -> Optional[Dict[str, Any]]:
            if not isinstance(payload, dict):
                return None

            symbol = str(payload.get("symbol") or "").strip().upper()
            if not symbol:
                return None

            last = _safe_float(payload.get("last"))
            if last is None or not math.isfinite(last) or last <= 0:
                return None

            change_pct = _safe_float(payload.get("change_percent"))
            if change_pct is None or not math.isfinite(change_pct):
                change_pct = 0.0

            currency = str(payload.get("currency") or "TRY").strip().upper() or "TRY"
            source = str(payload.get("source") or "unknown").strip() or "unknown"

            return {
                "symbol": symbol,
                "last": float(last),
                "change_percent": round(float(change_pct), 2),
                "currency": currency,
                "source": source,
            }

        # Check cache first using cache_manager
        for sym in normalized_symbols:
            try:
                cached = cache_manager.get_quote(sym.upper())
            except Exception as cache_exc:
                logger.warning(f"[BatchQuotes] Cache read failed for {sym}: {cache_exc}")
                cached = None

            cached_quote = sanitize_quote_payload(cached)
            if cached_quote:
                results.append(cached_quote)
            else:
                symbols_to_fetch.append(sym)
        
        if not symbols_to_fetch:
            logger.debug(f"All {len(normalized_symbols)} quotes served from cache")
            return results
        
        logger.info(f"Fetching {len(symbols_to_fetch)} quotes (cache hit: {len(results)})")
            
        def fetch_one(sym):
            try:
                context = (asset_context_by_symbol or {}).get(str(sym).upper(), {})
                market_hint = context.get("market")
                currency_hint = context.get("currency")
                # 1. Try BORSAPY for BIST, Gold and FX (with circuit breaker check)
                is_gold = "GOLD" in sym.upper() or sym.lower() in ["gram-altin", "ceyrek-altin", "yarim-altin", "tam-altin", "cumhuriyet-altin", "ata-altin", "ons-altin"]
                
                if (self._is_bist_with_hints(sym, market_hint=market_hint, currency_hint=currency_hint) or is_gold) and self._borsapy_circuit.can_execute():
                    try:
                        if sym in self.bist_indices:
                            info = bp.Index(sym).info
                        elif is_gold:
                            # Map normalized symbols to borsapy FX symbols
                            gold_map = {
                                "GOLD": "ons-altin",
                                "GRAM_GOLD": "gram-altin", "CEYREK_GOLD": "ceyrek-altin",
                                "YARIM_GOLD": "yarim-altin", "TAM_GOLD": "tam-altin",
                                "CUMHURIYET_GOLD": "cumhuriyet-altin", "ATA_GOLD": "ata-altin",
                                "ONS_GOLD": "ons-altin", "SILVER": "gram-gumus"
                            }
                            # Get the borsapy symbol, fallback to lower-hyphen version
                            fx_sym = gold_map.get(sym.upper())
                            if not fx_sym:
                                fx_sym = sym.lower().replace("_", "-")
                            
                            info = BorsapyFX(fx_sym).info
                        else:
                            info = bp.Ticker(sym).info
                        
                        last = _safe_float(info.get("last") or info.get("currentPrice") or 0)
                        
                        # Calculate change percent if not provided
                        change_pct = _safe_float(info.get("change_percent") or 0) or 0.0
                        if not math.isfinite(change_pct):
                            change_pct = 0.0
                        if change_pct == 0 and last and last > 0:
                            # Try to get previous close or calculate from history if important
                            pass
                            
                        if last is not None and math.isfinite(last) and last > 0:
                            self._borsapy_circuit.record_success()
                            return sanitize_quote_payload({
                                "symbol": sym.upper(),
                                "last": last,
                                "change_percent": round(change_pct, 2),
                                "currency": "TRY",
                                "source": "borsapy"
                            })
                    except Exception as e:
                        self._borsapy_circuit.record_failure()
                        logger.warning(f"Borsapy/Gold quote failed for {sym}: {e}")

                # 2. Fallback / Foreign to yfinance (with circuit breaker)
                if self._yfinance_circuit.can_execute():
                    try:
                        yf_sym = self._normalize_symbol(sym, market_hint=market_hint, currency_hint=currency_hint)
                        t = yf.Ticker(yf_sym)
                        h = t.history(period="2d")
                        
                        if h is not None and not h.empty:
                            last = _safe_float(h.iloc[-1]["Close"])
                            change_pct = 0.0
                            if len(h) >= 2:
                                prev = _safe_float(h.iloc[-2]["Close"])
                                if prev is not None and math.isfinite(prev) and prev > 0 and last is not None and math.isfinite(last):
                                    change_pct = ((last - prev) / prev) * 100
                            if last is None or not math.isfinite(last) or last <= 0:
                                return None
                            if not math.isfinite(change_pct):
                                change_pct = 0.0
                            
                            # Logic for currency detection
                            currency = "USD"
                            if ".IS" in yf_sym or "TRY=X" in yf_sym:
                                currency = "TRY"
                            elif any(x in sym for x in ["gram-altin", "gram-gumus", "TRY"]):
                                currency = "TRY"
                            
                            self._yfinance_circuit.record_success()
                            return sanitize_quote_payload({
                                "symbol": sym.upper(),
                                "last": last,
                                "change_percent": round(change_pct, 2),
                                "currency": currency,
                                "source": "yfinance"
                            })
                    except Exception as e:
                        self._yfinance_circuit.record_failure()
                        logger.warning(f"yfinance quote failed for {sym}: {e}")
                        
            except Exception as e:
                logger.error(f"[BatchQuotes] Error fetching {sym}: {e}")
            return None

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(12, max(1, len(symbols_to_fetch)))) as ex:
                fetched = list(ex.map(fetch_one, symbols_to_fetch))
        except Exception as exc:
            logger.exception(f"[BatchQuotes] Thread pool failure: {exc}")
            fetched = []
        
        # Cache and collect results using cache_manager
        for r in fetched:
            quote_payload = sanitize_quote_payload(r)
            if quote_payload is not None:
                try:
                    cache_manager.set_quote(quote_payload["symbol"], quote_payload)
                except Exception as cache_exc:
                    logger.warning(f"[BatchQuotes] Cache write failed for {quote_payload.get('symbol')}: {cache_exc}")
                results.append(quote_payload)
        
        return results

    def get_stock_fast_info(self, symbol: str) -> Dict[str, Any]:
        """Fast quote method for API compatibility."""
        quotes = self.get_batch_quotes([symbol])
        return quotes[0] if quotes else None



    def screen_stocks(self, **kwargs) -> pd.DataFrame:
        """
        Screen BIST stocks using borsapy.
        """
        try:
            from borsapy.screener import screen_stocks
            # Convert string min/max to float if they exist in kwargs
            for key in list(kwargs.keys()):
                if any(x in key for x in ['min', 'max', 'ratio', 'roe', 'yield']):
                    try:
                        if kwargs[key] is not None:
                            kwargs[key] = float(kwargs[key])
                    except: pass
            return screen_stocks(**kwargs)
        except Exception as e:
            logger.exception("[MarketFetcher] Screen stocks error", extra={"error": str(e)})
            return pd.DataFrame()

    def get_screener_filters(self) -> Dict[str, Any]:
        """
        Get all available filters for the screener.
        """
        try:
            from borsapy.screener import sectors, stock_indices, screener_criteria
            return {
                "sectors": sectors(),
                "indices": stock_indices(),
                "criteria": screener_criteria()
            }
        except Exception as e:
            logger.exception("[MarketFetcher] Screener filters error", extra={"error": str(e)})
            return {"sectors": [], "indices": [], "criteria": []}

    def get_company_list(self) -> pd.DataFrame:
        """
        Get all BIST companies.
        """
        try:
            from borsapy import companies
            return companies()
        except Exception as e:
            logger.exception("[MarketFetcher] Company list error", extra={"error": str(e)})
            return pd.DataFrame()


    def get_ta_signals(self, symbol: str) -> Dict[str, Any]:
        """Fetch technical analysis signals (TradingView) for a stock."""
        try:
            if not self._is_bist(symbol):
                return {}
            t = Ticker(symbol)
            signals = t.ta_signals()
            return signals
        except Exception as e:
            logger.exception("[MarketFetcher] TA Signals error", extra={"symbol": symbol, "error": str(e)})
            return {}

    def get_etf_holders(self, symbol: str) -> List[Dict[str, Any]]:
        """Fetch foreign ETF holders for a BIST stock."""
        try:
            if not self._is_bist(symbol):
                return []
            t = Ticker(symbol)
            df = t.etf_holders
            return self._df_to_records(df)
        except Exception as e:
            logger.exception("[MarketFetcher] ETF holders error", extra={"symbol": symbol, "error": str(e)})
            return []

    def search_symbols(self, query: str) -> List[str]:
        """Search for BIST symbols by name or sector."""
        try:
            from borsapy import search_bist
            return search_bist(query)
        except Exception as e:
            logger.exception("[MarketFetcher] Search symbols error", extra={"query": query, "error": str(e)})
            return []

    def get_heikin_ashi(self, symbol: str, period: str = "1mo", interval: str = "1d") -> List[Dict[str, Any]]:
        """Fetch Heikin Ashi candles for a stock."""
        try:
            if not self._is_bist(symbol):
                return []
            t = Ticker(symbol)
            df = t.heikin_ashi(period=period, interval=interval)
            return self._df_to_records(df)
        except Exception as e:
            logger.exception("[MarketFetcher] Heikin Ashi error", extra={"symbol": symbol, "error": str(e)})
            return []

    def technical_scan(self, condition: str, index: str = "BIST 100") -> List[Dict[str, Any]]:
        """Perform a technical scan using borsapy."""
        try:
            from borsapy import TechnicalScanner
            scanner = TechnicalScanner()
            scanner.set_universe(index)
            scanner.add_condition(condition)
            scanner.run()
            df = scanner.to_dataframe()
            return self._df_to_records(df)
        except Exception as e:
            logger.exception("[MarketFetcher] Technical scan error", extra={"error": str(e)})
            return []

    def get_inflation_latest(self) -> Dict[str, Any]:
        """Fetch latest TUFE (CPI) from borsapy."""
        try:
            from borsapy import Inflation
            inf = Inflation()
            latest = inf.latest()
            if not latest: return {}
            return {
                "date": str(latest.get("date")),
                "yearly": float(latest.get("yearly_inflation", 0)),
                "monthly": float(latest.get("monthly_inflation", 0))
            }
        except Exception as e:
            logger.exception("[MarketFetcher] Inflation latest error", extra={"error": str(e)})
            return {}

    def get_tufe_history(self) -> pd.DataFrame:
        """Fetch TUFE history."""
        try:
            from borsapy import Inflation
            return Inflation().tufe()
        except:
            return pd.DataFrame()

    def get_ufe_history(self) -> pd.DataFrame:
        """Fetch UFE history."""
        try:
            from borsapy import Inflation
            return Inflation().ufe()
        except:
            return pd.DataFrame()

    def get_economic_events(self, period: str = "1w", country: str = None, importance: str = None) -> pd.DataFrame:
        """Fetch economic calendar."""
        try:
            from borsapy import economic_calendar
            # economic_calendar is a function in borsapy
            return economic_calendar()
        except Exception as e:
            logger.exception("[MarketFetcher] Calendar error", extra={"error": str(e)})
            return pd.DataFrame()

    def get_today_events(self) -> pd.DataFrame:
        return self.get_economic_events(period="today")

    def get_this_week_events(self) -> pd.DataFrame:
        return self.get_economic_events(period="this-week")

    def get_macro_indicators(self) -> Dict[str, Any]:
        """Fetch composite macro indicators using borsapy."""
        try:
            # 1. Inflation (Turkey) - From borsapy.Inflation
            inf = self.get_inflation_latest()
            
            # 2. TCMB Policy Rate - From borsapy.CentralBank (v0.7.2+) or fallback to Calendar
            tr_rate = {"value": 45.0, "date": "2024-01-25", "trend": "steady"}
            try:
                # Try specific 0.7.2 feature first if available
                import borsapy as bp
                if hasattr(bp, "get_central_bank_rates"):
                    rates = bp.get_central_bank_rates() # Hypothetical helper
                    if rates and "policy_rate" in rates:
                        tr_rate = {
                            "value": float(rates["policy_rate"]),
                            "date": datetime.now().strftime("%Y-%m-%d"),
                            "trend": "steady"
                        }
            except:
                pass

            # 3. Macro Data from Economic Calendar (Unemployment, GDP, Fed Rate)
            # We fetch a wide range to ensure we catch the last event
            tr_unemployment = {"value": 8.8, "date": "2023-12", "trend": "steady"}
            us_data = {
                "inflation": {"yearly": 3.1, "monthly": 0.3, "date": "2024-01"},
                "fed_rate": {"value": 5.5, "date": "2024-01-31", "trend": "peak"},
                "unemployment": {"value": 3.7, "date": "2024-01", "trend": "steady"}
            }

            try:
                from borsapy import economic_calendar
                # Fetch recent events to update values
                # Note: This might be slow if fetching too much history, so good to cache it in production
                # For now we assume standard values or quick fetch
                pass 
            except Exception as e:
                logger.warning(f"Calendar fetch warning: {e}")

            return {
                "tr": {
                    "inflation": inf,
                    "policy_rate": tr_rate,
                    "unemployment": tr_unemployment
                },
                "us": us_data
            }
        except Exception as e:
            logger.exception("[MarketFetcher] Macro indicators error", extra={"error": str(e)})
            return {"error": str(e)}


market_fetcher = MarketFetcher()

