"""
Market Regime Detection

Regime detection identifies the current market state:
- Bullish Trend: Sustained upward movement
- Bearish Trend: Sustained downward movement  
- Sideways/Range: Consolidation, no clear direction
- High Volatility: Erratic, unstable conditions

This uses deterministic rules based on moving averages and price action.
"""

import numpy as np
import pandas as pd
from typing import Union, Dict, Tuple


def detect_regime(
    series: Union[pd.Series, np.ndarray],
    sma_short: int = 20,
    sma_long: int = 50
) -> str:
    """
    Detect market regime using SMA-based analysis.
    
    Args:
        series: Price series
        sma_short: Short-term SMA period (default 20)
        sma_long: Long-term SMA period (default 50)
    
    Returns:
        Regime classification:
        - "Bullish Trend"
        - "Bearish Trend"
        - "Sideways/Range"
        - "Unknown" (insufficient data)
    """
    if isinstance(series, np.ndarray):
        prices = pd.Series(series)
    else:
        prices = series
    
    if len(prices) < sma_long:
        return "Unknown"
    
    # Calculate SMAs
    sma_20 = prices.rolling(window=sma_short).mean()
    sma_50 = prices.rolling(window=sma_long).mean()
    
    # Get current values
    current_price = float(prices.iloc[-1])
    last_sma_20 = float(sma_20.iloc[-1])
    last_sma_50 = float(sma_50.iloc[-1])
    
    # Regime classification
    if current_price > last_sma_20 > last_sma_50:
        return "Bullish Trend"
    elif current_price < last_sma_20 < last_sma_50:
        return "Bearish Trend"
    else:
        return "Sideways/Range"


def detect_regime_advanced(
    series: Union[pd.Series, np.ndarray]
) -> Dict[str, any]:
    """
    Advanced regime detection with additional metrics.
    
    Returns:
        Dictionary with regime details:
        - regime: Primary classification
        - confidence: Confidence level (0-1)
        - trend_strength: Magnitude of trend
        - volatility_regime: separate volatility-based regime
    """
    if isinstance(series, np.ndarray):
        prices = pd.Series(series)
    else:
        prices = series
    
    result = {
        "regime": "Unknown",
        "confidence": 0.0,
        "trend_strength": 0.0,
        "volatility_regime": "unknown",
        "sma_alignment": "none"
    }
    
    if len(prices) < 50:
        return result
    
    # Calculate multiple SMAs
    sma_10 = prices.rolling(window=10).mean()
    sma_20 = prices.rolling(window=20).mean()
    sma_50 = prices.rolling(window=50).mean()
    
    current = float(prices.iloc[-1])
    s10 = float(sma_10.iloc[-1])
    s20 = float(sma_20.iloc[-1])
    s50 = float(sma_50.iloc[-1])
    
    # SMA alignment scoring
    bull_score = 0
    bear_score = 0
    
    if current > s10:
        bull_score += 1
    else:
        bear_score += 1
        
    if current > s20:
        bull_score += 1
    else:
        bear_score += 1
        
    if current > s50:
        bull_score += 1
    else:
        bear_score += 1
        
    if s10 > s20:
        bull_score += 1
    else:
        bear_score += 1
        
    if s20 > s50:
        bull_score += 1
    else:
        bear_score += 1
    
    # Determine regime based on scores
    if bull_score >= 4:
        result["regime"] = "Bullish Trend"
        result["confidence"] = bull_score / 5
        result["sma_alignment"] = "bullish"
    elif bear_score >= 4:
        result["regime"] = "Bearish Trend"
        result["confidence"] = bear_score / 5
        result["sma_alignment"] = "bearish"
    else:
        result["regime"] = "Sideways/Range"
        result["confidence"] = 0.5
        result["sma_alignment"] = "mixed"
    
    # Calculate trend strength (distance from 50 SMA as %)
    trend_strength = abs(current - s50) / s50
    result["trend_strength"] = min(1.0, trend_strength * 5)  # Scale to 0-1
    
    # Volatility regime
    returns = prices.pct_change().dropna()
    recent_vol = returns.tail(20).std() * np.sqrt(252)
    long_vol = returns.std() * np.sqrt(252)
    
    vol_ratio = recent_vol / long_vol if long_vol > 0 else 1.0
    
    if vol_ratio > 1.5:
        result["volatility_regime"] = "expanding"
    elif vol_ratio < 0.7:
        result["volatility_regime"] = "contracting"
    else:
        result["volatility_regime"] = "stable"
    
    return result


def detect_volatility_regime(
    series: Union[pd.Series, np.ndarray],
    short_window: int = 10,
    long_window: int = 50
) -> Tuple[str, float]:
    """
    Detect volatility regime (expanding/contracting).
    
    Returns:
        Tuple of (regime, ratio)
        - regime: "expanding", "contracting", or "stable"
        - ratio: short-term vol / long-term vol
    """
    if isinstance(series, np.ndarray):
        prices = pd.Series(series)
    else:
        prices = series
    
    if len(prices) < long_window + 5:
        return ("unknown", 1.0)
    
    returns = prices.pct_change().dropna()
    
    short_vol = returns.tail(short_window).std()
    long_vol = returns.tail(long_window).std()
    
    if long_vol == 0:
        return ("unknown", 1.0)
    
    ratio = short_vol / long_vol
    
    if ratio > 1.3:
        return ("expanding", float(ratio))
    elif ratio < 0.7:
        return ("contracting", float(ratio))
    else:
        return ("stable", float(ratio))


def calculate_regime_probabilities(
    series: Union[pd.Series, np.ndarray]
) -> Dict[str, float]:
    """
    Calculate soft probabilities for each regime.
    
    Instead of hard classification, this returns the likelihood
    of each regime being active.
    
    Returns:
        Dictionary with probabilities for each regime (sum to 1.0)
    """
    if isinstance(series, np.ndarray):
        prices = pd.Series(series)
    else:
        prices = series
    
    probs = {
        "bullish": 0.25,
        "bearish": 0.25,
        "sideways": 0.25,
        "volatile": 0.25
    }
    
    if len(prices) < 50:
        return probs
    
    # Get regime details
    regime_info = detect_regime_advanced(prices)
    vol_regime, vol_ratio = detect_volatility_regime(prices)
    
    # Start with base probabilities
    probs = {
        "bullish": 0.10,
        "bearish": 0.10,
        "sideways": 0.30,
        "volatile": 0.20
    }
    
    # Adjust based on detected regime
    if regime_info["regime"] == "Bullish Trend":
        probs["bullish"] += 0.30 * regime_info["confidence"]
        probs["sideways"] -= 0.15
    elif regime_info["regime"] == "Bearish Trend":
        probs["bearish"] += 0.30 * regime_info["confidence"]
        probs["sideways"] -= 0.15
    else:
        probs["sideways"] += 0.20
    
    # Adjust based on volatility
    if vol_regime == "expanding":
        probs["volatile"] += 0.20
        probs["sideways"] -= 0.10
    elif vol_regime == "contracting":
        probs["sideways"] += 0.15
        probs["volatile"] -= 0.10
    
    # Normalize to sum to 1
    total = sum(probs.values())
    probs = {k: max(0.05, v / total) for k, v in probs.items()}
    
    # Re-normalize after floor
    total = sum(probs.values())
    probs = {k: v / total for k, v in probs.items()}
    
    return probs
