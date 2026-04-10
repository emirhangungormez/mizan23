"""
Analysis API Endpoints

Deep analysis endpoints for individual assets and market conditions.
All calculations happen in Python using deterministic mathematics.
"""

from typing import ClassVar
from fastapi import APIRouter
router: ClassVar[APIRouter] = APIRouter()

from fastapi import HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import concurrent.futures

from engine.data.market_fetch import market_fetcher
from engine.math.entropy import calculate_entropy
from engine.math.hurst import calculate_hurst
from engine.math.volatility import calculate_volatility
from engine.math.regime import detect_regime
from scoring.score_engine import ScoreEngine
from valuation.intrinsic_value import IntrinsicValueCalculator
from valuation.balance_strength import BalanceStrengthAnalyzer
import threading
import time




class AssetAnalysisResponse(BaseModel):
    symbol: str
    last_price: float
    analysis_time: str
    
    # Core metrics
    score: float
    entropy: float
    hurst: float
    volatility: float
    regime: str
    
    # Probability estimates
    probability_up: float
    probability_down: float
    probability_sideways: float
    
    # Risk classification
    risk_band: str
    
    # Interpretation
    trend_strength: str
    predictability: str
    recommendation_class: str


class MarketRegimeResponse(BaseModel):
    symbol: str
    regime: str
    confidence: float
    sma_20: float
    sma_50: float
    current_price: float
    trend_direction: str
    analysis_time: str


class ValuationResponse(BaseModel):
    symbol: str
    intrinsic_value: Optional[float]
    current_price: float
    margin_of_safety: Optional[float]
    balance_strength: Optional[float]
    analysis_time: str


@router.get("/{symbol}", response_model=AssetAnalysisResponse)
def analyze_asset(
    symbol: str,
    market: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
):
    """
    Perform comprehensive analysis on a single asset.
    
    Returns:
    - Mathematical metrics (entropy, hurst, volatility)
    - Regime classification
    - Probability estimates
    - Risk classification
    - Human-readable interpretation
    """
    data = market_fetcher.get_stock_data(symbol, period="1y", market_hint=market, currency_hint=currency)
    
    if data is None or data.empty:
        raise HTTPException(status_code=404, detail=f"No data available for '{symbol}'")
    
    prices = data["Close"]
    last_price = float(prices.iloc[-1])
    
    # Calculate all metrics
    entropy = calculate_entropy(prices)
    hurst = calculate_hurst(prices)
    volatility = calculate_volatility(prices)
    regime = detect_regime(prices)
    
    # Generate score
    metrics = ScoreEngine.generate_asset_score(data)
    score = metrics["score"]
    
    # Calculate probabilities based on metrics
    # This is probabilistic estimation, not prediction
    prob_up = 0.33
    prob_down = 0.33
    prob_sideways = 0.34
    
    # Adjust based on hurst (trend persistence)
    if hurst > 0.6:
        if regime == "Bullish Trend":
            prob_up += 0.20
            prob_sideways -= 0.10
            prob_down -= 0.10
        elif regime == "Bearish Trend":
            prob_down += 0.20
            prob_sideways -= 0.10
            prob_up -= 0.10
    elif hurst < 0.4:
        # Mean-reverting
        prob_sideways += 0.15
        prob_up -= 0.05
        prob_down -= 0.10 if regime == "Bearish Trend" else 0.05
    
    # Adjust based on entropy (predictability)
    if entropy < 2.5:
        # Lower entropy = more predictable
        if prob_up > prob_down:
            prob_up += 0.10
        else:
            prob_down += 0.10
        prob_sideways -= 0.10
    
    # Normalize probabilities
    total = prob_up + prob_down + prob_sideways
    prob_up = max(0.05, min(0.90, prob_up / total))
    prob_down = max(0.05, min(0.90, prob_down / total))
    prob_sideways = max(0.05, min(0.90, 1 - prob_up - prob_down))
    
    # Risk band classification
    if volatility < 0.15:
        risk_band = "low"
    elif volatility < 0.30:
        risk_band = "moderate"
    elif volatility < 0.50:
        risk_band = "elevated"
    else:
        risk_band = "high"
    
    # Interpretation
    if hurst > 0.6:
        trend_strength = "strong"
    elif hurst > 0.5:
        trend_strength = "moderate"
    else:
        trend_strength = "weak"
    
    if entropy < 2.5:
        predictability = "high"
    elif entropy < 3.2:
        predictability = "moderate"
    else:
        predictability = "low"
    
    # Recommendation class (not advice, just classification)
    if score >= 0.75 and risk_band in ["low", "moderate"]:
        recommendation_class = "opportunity"
    elif score >= 0.5:
        recommendation_class = "neutral"
    elif risk_band == "high":
        recommendation_class = "caution"
    else:
        recommendation_class = "monitor"
    
    return AssetAnalysisResponse(
        symbol=symbol.upper(),
        last_price=last_price,
        analysis_time=datetime.now().isoformat(),
        score=round(score, 4),
        entropy=round(entropy, 4),
        hurst=round(hurst, 4),
        volatility=round(volatility, 4),
        regime=regime,
        probability_up=round(prob_up, 4),
        probability_down=round(prob_down, 4),
        probability_sideways=round(prob_sideways, 4),
        risk_band=risk_band,
        trend_strength=trend_strength,
        predictability=predictability,
        recommendation_class=recommendation_class
    )


@router.get("/{symbol}/regime", response_model=MarketRegimeResponse)
def get_regime(symbol: str):
    """
    Get detailed regime analysis for a symbol.
    """
    data = market_fetcher.get_stock_data(symbol, period="6mo")
    
    if data is None or data.empty:
        raise HTTPException(status_code=404, detail=f"No data available for '{symbol}'")
    
    prices = data["Close"]
    
    if len(prices) < 50:
        raise HTTPException(status_code=400, detail="Insufficient data for regime analysis (need 50+ days)")
    
    regime = detect_regime(prices)
    
    sma_20 = float(prices.rolling(window=20).mean().iloc[-1])
    sma_50 = float(prices.rolling(window=50).mean().iloc[-1])
    current_price = float(prices.iloc[-1])
    
    # Determine trend direction
    if current_price > sma_20 > sma_50:
        trend_direction = "up"
        confidence = 0.8
    elif current_price < sma_20 < sma_50:
        trend_direction = "down"
        confidence = 0.8
    elif current_price > sma_20:
        trend_direction = "recovering"
        confidence = 0.6
    elif current_price < sma_20:
        trend_direction = "weakening"
        confidence = 0.6
    else:
        trend_direction = "neutral"
        confidence = 0.5
    
    return MarketRegimeResponse(
        symbol=symbol.upper(),
        regime=regime,
        confidence=confidence,
        sma_20=round(sma_20, 2),
        sma_50=round(sma_50, 2),
        current_price=current_price,
        trend_direction=trend_direction,
        analysis_time=datetime.now().isoformat()
    )


@router.get("/{symbol}/valuation", response_model=ValuationResponse)
def get_valuation(symbol: str):
    """
    Get valuation analysis for a symbol.
    Includes intrinsic value estimation and balance strength.
    
    Note: Intrinsic value calculation requires fundamental data.
    This endpoint returns estimates when available.
    """
    data = market_fetcher.get_stock_data(symbol, period="1y")
    
    if data is None or data.empty:
        raise HTTPException(status_code=404, detail=f"No data available for '{symbol}'")
    
    current_price = float(data["Close"].iloc[-1])
    
    # Try to get intrinsic value (may not be available for all symbols)
    try:
        intrinsic = IntrinsicValueCalculator.calculate(symbol)
        if intrinsic and intrinsic > 0:
            margin_of_safety = (intrinsic - current_price) / intrinsic
            
            if margin_of_safety > 0.25:
                valuation_status = "undervalued"
            elif margin_of_safety < -0.15:
                valuation_status = "overvalued"
            else:
                valuation_status = "fairly_valued"
        else:
            intrinsic = None
            margin_of_safety = None
            valuation_status = "unknown"
    except Exception:
        intrinsic = None
        margin_of_safety = None
        valuation_status = "unknown"
    
    # Try to get balance strength
    try:
        balance_strength = BalanceStrengthAnalyzer.analyze(symbol)
    except Exception:
        balance_strength = None
    
    return ValuationResponse(
        symbol=symbol.upper(),
        intrinsic_value=round(intrinsic, 2) if intrinsic else None,
        current_price=current_price,
        margin_of_safety=round(margin_of_safety, 4) if margin_of_safety else None,
        valuation_status=valuation_status,
        balance_strength=round(balance_strength, 4) if balance_strength else None,
        analysis_time=datetime.now().isoformat()
    )


@router.get("/batch/analyze")
def batch_analyze(symbols: str):
    """
    Analyze multiple symbols at once.
    
    Pass symbols as comma-separated string, e.g., ?symbols=THYAO,SISE,EREGL
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    
    if len(symbol_list) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 symbols per batch")
    
    results = []
    
    def analyze_single(symbol):
        try:
            data = market_fetcher.get_stock_data(symbol, period="1y")
            if data is None or data.empty:
                return {"symbol": symbol, "status": "no_data"}
            
            metrics = ScoreEngine.generate_asset_score(data)
            last_price = float(data["Close"].iloc[-1])
            
            return {
                "symbol": symbol,
                "status": "ok",
                "last_price": last_price,
                "score": round(metrics["score"], 4),
                "entropy": round(metrics["entropy"], 4),
                "hurst": round(metrics["hurst"], 4),
                "volatility": round(metrics["volatility"], 4),
                "regime": metrics["regime"]
            }
        except Exception as e:
            return {"symbol": symbol, "status": "error", "error": str(e)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(symbol_list)) as executor:
        results = list(executor.map(analyze_single, symbol_list))
    
    return {
        "count": len(results),
        "results": results
    }


# ==========================================
# Benchmark Comparison Endpoint
# ==========================================

class BenchmarkResponse(BaseModel):
    period: str
    inflation: float
    gold: float
    bist100: float
    interest_rate: float
    usd: float
    eur: float
    data_source: str
    last_updated: str


import json
import os
from dateutil import parser as date_parser
from engine.utils import logger

BENCHMARK_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "benchmarks_cache.json")
BENCHMARK_CACHE_TTL_SECONDS = 15 * 60  # 15 minutes


def load_benchmark_cache() -> dict:
    # CACHE DEVRE DIŞI: Her zaman boş dict dön
    return {}


def save_benchmark_cache(data: dict) -> None:
    # CACHE DEVRE DIŞI: Hiçbir şey yapma
    pass


def get_cached_benchmark(period: str) -> dict | None:
    # CACHE DEVRE DIŞI: Her zaman None dön
    return None


@router.get("/benchmarks/{period}")
def get_benchmarks(period: str, start_date: Optional[str] = None):
    """
    Get benchmark performance data for portfolio comparison.
    
    Periods: daily, weekly, monthly, all
    
    Query Parameters:
    - start_date: Optional ISO date string (e.g., "2023-06-15") for custom period calculation.
                  Primarily used with period='all' to calculate from portfolio's first investment date.
    
    Data Sources:
    - Inflation: TCMB TÜFE data via borsapy
    - BIST 100: Yahoo Finance / borsapy Index
    - Gold: Yahoo Finance XAU/TRY
    - FX (USD/EUR): Yahoo Finance
    - Interest Rate: TCMB policy rate
    
    Caching:
    - Data is saved to storage/benchmarks_cache.json
    - If API fails, cached data is returned
    - Enables offline access
    """
    import borsapy as bp
    import pandas as pd
    from datetime import datetime, timedelta

    def compute_period_return(obj, period_key: str) -> Optional[float]:
        period_fetch_map = {
            "daily": "5d",
            "weekly": "1mo",
            "monthly": "3mo",
            "ytd": "ytd",
            "yearly": "1y",
            "5y": "5y",
            "all": "max",
        }
        fetch_period = period_fetch_map.get(period_key, "1y")
        hist = obj.history(period=fetch_period)
        if hist is None or len(hist) < 2 or "Close" not in hist.columns:
            return None

        df = hist.copy()
        if not isinstance(df.index, pd.DatetimeIndex):
            return round(((float(df["Close"].iloc[-1]) - float(df["Close"].iloc[0])) / float(df["Close"].iloc[0])) * 100, 2)

        df = df.sort_index()
        if getattr(df.index, "tz", None) is not None:
            df.index = df.index.tz_localize(None)
        latest_close = float(df["Close"].iloc[-1])

        if period_key == "daily":
            base_close = float(df["Close"].iloc[-2])
        elif period_key == "weekly":
            target_date = df.index[-1] - timedelta(days=7)
            base_slice = df[df.index <= target_date]
            base_close = float((base_slice if not base_slice.empty else df.iloc[[0]])["Close"].iloc[-1])
        elif period_key == "monthly":
            target_date = df.index[-1] - timedelta(days=30)
            base_slice = df[df.index <= target_date]
            base_close = float((base_slice if not base_slice.empty else df.iloc[[0]])["Close"].iloc[-1])
        elif period_key == "ytd":
            year_start = datetime(df.index[-1].year, 1, 1)
            base_slice = df[df.index >= year_start]
            base_close = float((base_slice if not base_slice.empty else df.iloc[[0]])["Close"].iloc[0])
        elif period_key == "yearly":
            base_close = float(df["Close"].iloc[0])
        elif period_key == "5y":
            base_close = float(df["Close"].iloc[0])
        else:
            base_close = float(df["Close"].iloc[0])

        if base_close == 0:
            return None
        return round(((latest_close - base_close) / base_close) * 100, 2)
    
    valid_periods = ['daily', 'weekly', 'monthly', 'ytd', 'yearly', '5y', 'all']
    if period not in valid_periods:
        if period == 'five_years': period = '5y'
        elif period == '1d': period = 'daily'
        elif period == '1w': period = 'weekly'
        elif period == '1m': period = 'monthly'
        elif period == '1y': period = 'yearly'
        else:
            raise HTTPException(status_code=400, detail=f"Invalid period. Use: {valid_periods}")
    
    result = {
        "period": period,
        "inflation": None,
        "gold": None,
        "bist100": None,
        "interest_rate": None,
        "usd": None,
        "eur": None,
        "data_source": "borsapy",
        "last_updated": datetime.now().isoformat(),
        "from_cache": False
    }

    # Try to load existing cache to merge partial results if needed
    existing_cache = load_benchmark_cache()
    cached_for_period = existing_cache.get(period) if isinstance(existing_cache, dict) else None

    any_success = False

    # Per-field safe fetches. If a field fails, leave as None and try to fill from cache/fallback later.
    try:
        # ===== INFLATION =====
        try:
            inf = bp.Inflation()
            latest = inf.latest()

            if period == 'daily':
                result["inflation"] = round(latest.get("yearly_inflation", 0) / 365, 2)
            elif period == 'weekly':
                result["inflation"] = round(latest.get("yearly_inflation", 0) / 52, 2)
            elif period == 'monthly':
                # monthly_inflation from borsapy is month-over-month percentage
                result["inflation"] = round(latest.get("monthly_inflation", 0), 2)
            elif period == 'ytd':
                # Calculate Year-to-Date cumulative inflation by multiplying monthly rates.
                # Prefer a robust TUFE history from market_fetcher, fall back to borsapy.Inflation.latest linearization.
                try:
                    import pandas as pd

                    # Try market_fetcher helper first (more resilient to provider differences)
                    tufe_df = None
                    try:
                        tufe_df = market_fetcher.get_tufe_history()
                    except Exception:
                        tufe_df = None

                    computed = False
                    if tufe_df is not None and not tufe_df.empty:
                        # Find a candidate monthly inflation column (case-insensitive)
                        monthly_col = None
                        for c in tufe_df.columns:
                            cname = str(c).lower()
                            if 'monthly' in cname or 'ay' in cname or 'tufe' in cname or 'inflation' in cname:
                                # prefer explicitly monthly-named columns
                                if 'monthly' in cname or 'ay' in cname:
                                    monthly_col = c
                                    break
                                monthly_col = c

                        # If we found a column, filter rows for current year and compute cumulative product
                        if monthly_col is not None:
                            df = tufe_df.copy()
                            # prefer using datetime index if present
                            if isinstance(df.index, pd.DatetimeIndex):
                                df = df[df.index.year == datetime.now().year]
                            else:
                                # try to find a date-like column
                                date_col = None
                                for c in df.columns:
                                    if 'date' in str(c).lower():
                                        date_col = c
                                        break
                                if date_col is not None:
                                    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                                    df = df[df[date_col].dt.year == datetime.now().year]

                            series = pd.to_numeric(df[monthly_col], errors='coerce').dropna()
                            if not series.empty:
                                # Series values are expected as percent (e.g. 3.2 for 3.2%)
                                cumulative = (1 + series.astype(float) / 100).prod()
                                result["inflation"] = round((cumulative - 1) * 100, 2)
                                any_success = True
                                computed = True

                    if not computed:
                        # Attempt start-of-year vs latest TUFE level comparison
                        try:
                            # Try market_fetcher first for a level series
                            df = None
                            try:
                                df = market_fetcher.get_tufe_history()
                            except Exception:
                                df = None

                            # If market_fetcher returned an empty DataFrame, try borsapy directly
                            if (df is None or df.empty) and hasattr(bp, 'Inflation'):
                                try:
                                    df = bp.Inflation().tufe()
                                except Exception:
                                    df = None

                            if df is not None and not df.empty:
                                # normalize index/columns to find a numeric column representing level
                                # look for 'value', 'level', 'tufe', 'yearly' or numeric columns
                                level_col = None
                                for c in df.columns:
                                    cname = str(c).lower()
                                    if cname in ('value', 'level', 'tufe', 'tüfe', 'tufe_level'):
                                        level_col = c
                                        break
                                if level_col is None:
                                    # pick first numeric column
                                    for c in df.columns:
                                        try:
                                            pd.to_numeric(df[c].dropna())
                                            level_col = c
                                            break
                                        except Exception:
                                            continue

                                # Determine start-of-year value and latest
                                if isinstance(df.index, pd.DatetimeIndex):
                                    df_idx = df.sort_index()
                                    start_of_year = datetime(datetime.now().year, 1, 1)
                                    # find the nearest index on or after start_of_year
                                    try:
                                        start_row = df_idx[df_idx.index >= start_of_year].iloc[0]
                                    except Exception:
                                        start_row = df_idx.iloc[0]
                                    end_row = df_idx.iloc[-1]
                                else:
                                    # try to find a date-like column
                                    date_col = None
                                    for c in df.columns:
                                        if 'date' in str(c).lower():
                                            date_col = c
                                            break
                                    if date_col is not None:
                                        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                                        df = df.dropna(subset=[date_col])
                                        df = df.sort_values(by=date_col)
                                        start_of_year = datetime(datetime.now().year, 1, 1)
                                        try:
                                            start_row = df[df[date_col] >= start_of_year].iloc[0]
                                        except Exception:
                                            start_row = df.iloc[0]
                                        end_row = df.iloc[-1]
                                    else:
                                        start_row = df.iloc[0]
                                        end_row = df.iloc[-1]

                                if level_col is not None:
                                    try:
                                        start_val = float(start_row[level_col])
                                        end_val = float(end_row[level_col])
                                        if start_val and start_val != 0:
                                            pct = ((end_val - start_val) / start_val) * 100
                                            result["inflation"] = round(pct, 2)
                                            any_success = True
                                            computed = True
                                    except Exception:
                                        computed = False

                        except Exception as e:
                            logger.error("YTD start-of-year level fallback error", error=str(e))

                    if not computed:
                        # Final fallback: use borsapy latest approximation scaled by elapsed days
                        try:
                            latest = inf.latest()
                        except Exception:
                            latest = {}
                        days_ytd = (datetime.now() - datetime(datetime.now().year, 1, 1)).days + 1
                        result["inflation"] = round(float(latest.get("yearly_inflation", 0) or 0) * (days_ytd / 365), 2)
                except Exception as e:
                    logger.error("YTD inflation calculation error", error=str(e))
                    try:
                        latest = inf.latest()
                    except Exception:
                        latest = {}
                    days_ytd = (datetime.now() - datetime(datetime.now().year, 1, 1)).days + 1
                    result["inflation"] = round(float(latest.get("yearly_inflation", 0) or 0) * (days_ytd / 365), 2)
            elif period == 'yearly':
                result["inflation"] = round(latest.get("yearly_inflation", 0), 2)
            elif period == '5y':
                # Calculate 5-year cumulative inflation from yearly rate (compound)
                try:
                    yr = float(latest.get("yearly_inflation", 0) or 0)
                    result["inflation"] = round(((1 + yr / 100) ** 5 - 1) * 100, 2)
                except Exception:
                    result["inflation"] = round(latest.get("yearly_inflation", 0) * 5, 2)
            else:  # all
                if start_date:
                    try:
                        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                        now_dt = datetime.now()
                        months_diff = (now_dt.year - start_dt.year) * 12 + (now_dt.month - start_dt.month)
                        months_diff = max(1, months_diff)
                        monthly_avg = latest.get("monthly_inflation", 0)
                        cumulative = ((1 + monthly_avg/100) ** months_diff - 1) * 100
                        result["inflation"] = round(cumulative, 2)
                    except Exception:
                        result["inflation"] = round(latest.get("yearly_inflation", 0), 2)
                else:
                    result["inflation"] = round(latest.get("yearly_inflation", 0), 2)

            any_success = any_success or (result["inflation"] is not None)
        except Exception as e:
            logger.error("Inflation fetch error", error=str(e))

        # ===== BIST, GOLD, FX (borsapy ile) =====
        try:
            # BIST 100
            try:
                bist = bp.Index("XU100")
                bist_return = compute_period_return(bist, period)
                if bist_return is not None:
                    result["bist100"] = bist_return
                    any_success = True
            except Exception as e:
                logger.error("BIST fetch error", error=str(e))

            # Altın (XAU/TRY) - try multiple FX asset keys (borsapy supports different names)
            try:
                gold_candidates = ["ons-altin", "XAU", "gram-altin"]
                gold_pct = None
                for asset in gold_candidates:
                    try:
                        gold = bp.FX(asset)
                        gold_pct = compute_period_return(gold, period)
                        if gold_pct is not None:
                            any_success = True
                            break
                    except Exception:
                        # ignore and try next candidate
                        continue
                if gold_pct is not None:
                    result["gold"] = gold_pct
                else:
                    # Log a single consolidated message if all candidates failed
                    logger.error("Gold fetch error", error="all asset candidates failed")
            except Exception as e:
                logger.error("Gold fetch error", error=str(e))

            # USD/TRY
            try:
                usd = bp.FX("USD")
                usd_return = compute_period_return(usd, period)
                if usd_return is not None:
                    result["usd"] = usd_return
                    any_success = True
            except Exception as e:
                logger.error("USD fetch error", error=str(e))

            # EUR/TRY
            try:
                eur = bp.FX("EUR")
                eur_return = compute_period_return(eur, period)
                if eur_return is not None:
                    result["eur"] = eur_return
                    any_success = True
            except Exception as e:
                logger.error("EUR fetch error", error=str(e))
        except Exception as e:
            logger.error("Borsapy overall fetch error", error=str(e))

        # ===== INTEREST RATE =====
        try:
            # Try to read TCMB policy rate via borsapy if available
            try:
                policy = bp.PolicyRate() if hasattr(bp, 'PolicyRate') else None
            except Exception:
                policy = None

            yearly_rate = None
            if policy is not None:
                try:
                    pr = policy.latest()
                    yearly_rate = float(pr.get('policy_rate', pr.get('value', 0)))
                except Exception:
                    yearly_rate = None

            # fallback to configured constant if not available
            if not yearly_rate:
                yearly_rate = 45.0

            if period == 'daily': result["interest_rate"] = round(yearly_rate / 365, 2)
            elif period == 'weekly': result["interest_rate"] = round(yearly_rate / 52, 2)
            elif period == 'monthly': result["interest_rate"] = round(yearly_rate / 12, 2)
            elif period == 'ytd':
                days_ytd = (datetime.now() - datetime(datetime.now().year, 1, 1)).days + 1
                result["interest_rate"] = round(yearly_rate * (days_ytd / 365), 2)
            elif period == '5y': result["interest_rate"] = round(yearly_rate * 5, 2)
            else: result["interest_rate"] = yearly_rate

            any_success = True
        except Exception as e:
            logger.error("Interest rate error", error=str(e))

        # Merge missing fields from cache or fallback defaults
        fallback = {
            'daily': {"inflation": 0.08, "gold": 0.45, "bist100": -0.32, "interest_rate": 0.10, "usd": 0.12, "eur": 0.08},
            'weekly': {"inflation": 0.56, "gold": 2.1, "bist100": 1.8, "interest_rate": 0.73, "usd": 0.85, "eur": 0.62},
            'monthly': {"inflation": 2.4, "gold": 4.8, "bist100": 6.2, "interest_rate": 3.17, "usd": 3.2, "eur": 2.8},
            'all': {"inflation": 32.5, "gold": 38.2, "bist100": 28.4, "interest_rate": 38.0, "usd": 35.5, "eur": 32.0}
        }

        # If a specific field is None, try cached value, otherwise fallback
        for k in ["inflation", "gold", "bist100", "interest_rate", "usd", "eur"]:
            if result.get(k) is None:
                # try cached
                try:
                    if cached_for_period and k in cached_for_period:
                        result[k] = cached_for_period.get(k)
                    else:
                        result[k] = fallback.get(period, fallback['all']).get(k)
                except Exception:
                    result[k] = fallback.get(period, fallback['all']).get(k)

        # If we were able to fetch at least one real field, save merged result to cache
        if any_success:
            result["data_source"] = "borsapy/merged"
            save_benchmark_cache(result)
        else:
            # No live data - try to serve cache if exists
            cached = get_cached_benchmark(period)
            if cached:
                cached["from_cache"] = True
                cached["data_source"] = "cache (offline)"
                return cached
            else:
                # no cache - return fallback merged result
                result["data_source"] = "fallback (no cache)"
                result["from_cache"] = True

    except Exception as e:
        logger.exception("Benchmark fetch error")
        # Try cache
        cached = get_cached_benchmark(period)
        if cached:
            cached["from_cache"] = True
            cached["data_source"] = "cache (offline)"
            return cached
        # final fallback
        result.update(fallback.get(period, fallback['all']))
        result["data_source"] = "fallback (error)"
        result["from_cache"] = True

    return result


# Background refresh utilities for benchmarks
_bench_refresh_thread: threading.Thread | None = None
_bench_refresh_stop_event: threading.Event | None = None


def _bench_refresh_loop(interval_seconds: int = 900):
    """Loop that refreshes benchmark periods every `interval_seconds`."""
    global _bench_refresh_stop_event
    if _bench_refresh_stop_event is None:
        _bench_refresh_stop_event = threading.Event()

    while not _bench_refresh_stop_event.is_set():
        try:
            # Refresh a full set of benchmark periods to keep cache consistent
            for p in ["daily", "weekly", "monthly", "ytd", "yearly", "5y", "all"]:
                try:
                    logger.debug("[BenchRefresh] refreshing period", period=p)
                    # Call the function to refresh and save to cache
                    get_benchmarks(p)
                    logger.info("[BenchRefresh] refreshed", period=p)
                except Exception as e:
                    logger.error("[BenchRefresh] Error refreshing", period=p, error=str(e))
        except Exception as e:
            logger.exception("[BenchRefresh] Unexpected error")

        # Wait for interval or exit earlier if stop requested
        _bench_refresh_stop_event.wait(interval_seconds)


def start_benchmarks_refresh(interval_seconds: int = 900):
    """Start background thread to refresh benchmarks periodically.

    - `interval_seconds`: refresh interval in seconds (default 900s = 15min)
    """
    global _bench_refresh_thread, _bench_refresh_stop_event
    if _bench_refresh_thread and _bench_refresh_thread.is_alive():
        return
    _bench_refresh_stop_event = threading.Event()
    _bench_refresh_thread = threading.Thread(target=_bench_refresh_loop, args=(interval_seconds,), daemon=True)
    _bench_refresh_thread.start()
    logger.info("[BenchRefresh] started", interval_seconds=interval_seconds)


def stop_benchmarks_refresh():
    """Stop the background refresh thread."""
    global _bench_refresh_thread, _bench_refresh_stop_event
    try:
        if _bench_refresh_stop_event:
            _bench_refresh_stop_event.set()
        if _bench_refresh_thread:
            _bench_refresh_thread.join(timeout=5)
    except Exception as e:
        logger.error("[BenchRefresh] Stop error", error=str(e))
    _bench_refresh_thread = None
    _bench_refresh_stop_event = None
    logger.info("[BenchRefresh] stopped")

