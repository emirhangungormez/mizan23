"""
Volatility Calculations

Volatility measures the magnitude of price fluctuations.
Higher volatility = larger price swings = higher risk.

Multiple volatility measures are provided for comprehensive analysis.
"""

import numpy as np
import pandas as pd
from typing import Union, Dict


def calculate_volatility(
    series: Union[pd.Series, np.ndarray],
    window: int = 20,
    annualize: bool = True
) -> float:
    """
    Calculate historical volatility (standard deviation of returns).
    
    Args:
        series: Price series
        window: Rolling window for calculation (default 20 days)
        annualize: If True, annualize the volatility (default True)
    
    Returns:
        Volatility as a decimal (e.g., 0.25 = 25%).
        
    Interpretation:
        < 0.15: Low volatility
        0.15-0.30: Moderate volatility
        0.30-0.50: High volatility
        > 0.50: Very high volatility
    """
    if isinstance(series, pd.Series):
        prices = series
    else:
        prices = pd.Series(series)
    
    if len(prices) < window:
        return 0.0
    
    # Calculate returns
    returns = prices.pct_change().dropna()
    
    if returns.empty:
        return 0.0
    
    # Rolling standard deviation
    rolling_vol = returns.rolling(window=window).std()
    
    # Get the latest volatility
    vol = rolling_vol.iloc[-1] if not rolling_vol.empty else 0.0
    
    # Annualize if requested (252 trading days)
    if annualize:
        vol = vol * np.sqrt(252)
    
    return float(vol) if not np.isnan(vol) else 0.0


def calculate_parkinson_volatility(
    high: Union[pd.Series, np.ndarray],
    low: Union[pd.Series, np.ndarray],
    window: int = 20
) -> float:
    """
    Calculate Parkinson volatility using high-low range.
    
    This estimator is more efficient than close-to-close volatility
    as it uses more information from the price bar.
    
    Args:
        high: High prices
        low: Low prices
        window: Rolling window for calculation
    
    Returns:
        Annualized Parkinson volatility.
    """
    if isinstance(high, pd.Series):
        h = high.values
        l = low.values
    else:
        h = high
        l = low
    
    if len(h) < window or len(l) < window:
        return 0.0
    
    # Parkinson estimator: σ² = (1/4ln2) * mean((ln(H/L))²)
    log_hl = np.log(h / l)
    log_hl_squared = log_hl ** 2
    
    parkinson_var = (1 / (4 * np.log(2))) * np.mean(log_hl_squared[-window:])
    parkinson_vol = np.sqrt(parkinson_var) * np.sqrt(252)
    
    return float(parkinson_vol) if not np.isnan(parkinson_vol) else 0.0


def calculate_garman_klass_volatility(
    open_prices: Union[pd.Series, np.ndarray],
    high: Union[pd.Series, np.ndarray],
    low: Union[pd.Series, np.ndarray],
    close: Union[pd.Series, np.ndarray],
    window: int = 20
) -> float:
    """
    Calculate Garman-Klass volatility.
    
    This estimator uses OHLC data and is more efficient than
    simple close-to-close volatility.
    
    Returns:
        Annualized Garman-Klass volatility.
    """
    o = np.array(open_prices) if not isinstance(open_prices, np.ndarray) else open_prices
    h = np.array(high) if not isinstance(high, np.ndarray) else high
    l = np.array(low) if not isinstance(low, np.ndarray) else low
    c = np.array(close) if not isinstance(close, np.ndarray) else close
    
    if len(o) < window:
        return 0.0
    
    # Use last 'window' days
    o, h, l, c = o[-window:], h[-window:], l[-window:], c[-window:]
    
    # Garman-Klass formula
    log_hl = np.log(h / l)
    log_co = np.log(c / o)
    
    gk_var = 0.5 * (log_hl ** 2) - (2 * np.log(2) - 1) * (log_co ** 2)
    gk_vol = np.sqrt(np.mean(gk_var) * 252)
    
    return float(gk_vol) if not np.isnan(gk_vol) else 0.0


def calculate_volatility_metrics(df: pd.DataFrame) -> Dict[str, float]:
    """
    Calculate comprehensive volatility metrics from OHLCV DataFrame.
    
    Args:
        df: DataFrame with Open, High, Low, Close columns
    
    Returns:
        Dictionary with multiple volatility measures.
    """
    result = {
        "historical_volatility": 0.0,
        "parkinson_volatility": 0.0,
        "garman_klass_volatility": 0.0,
        "volatility_band": "unknown"
    }
    
    if df is None or df.empty:
        return result
    
    # Ensure column names are standardized
    cols = {col.lower(): col for col in df.columns}
    
    close_col = cols.get("close")
    high_col = cols.get("high")
    low_col = cols.get("low")
    open_col = cols.get("open")
    
    if close_col:
        result["historical_volatility"] = calculate_volatility(df[close_col])
    
    if high_col and low_col:
        result["parkinson_volatility"] = calculate_parkinson_volatility(
            df[high_col], df[low_col]
        )
    
    if open_col and high_col and low_col and close_col:
        result["garman_klass_volatility"] = calculate_garman_klass_volatility(
            df[open_col], df[high_col], df[low_col], df[close_col]
        )
    
    # Determine volatility band based on average
    avg_vol = np.mean([
        v for k, v in result.items() 
        if isinstance(v, (int, float)) and v > 0
    ])
    
    if avg_vol < 0.15:
        result["volatility_band"] = "low"
    elif avg_vol < 0.30:
        result["volatility_band"] = "moderate"
    elif avg_vol < 0.50:
        result["volatility_band"] = "elevated"
    else:
        result["volatility_band"] = "high"
    
    return result


def calculate_realized_volatility(
    returns: Union[pd.Series, np.ndarray],
    frequency: str = "daily"
) -> float:
    """
    Calculate realized volatility from return series.
    
    Args:
        returns: Series of returns
        frequency: 'daily', 'weekly', or 'monthly'
    
    Returns:
        Annualized realized volatility.
    """
    if isinstance(returns, pd.Series):
        r = returns.dropna().values
    else:
        r = returns[~np.isnan(returns)]
    
    if len(r) < 2:
        return 0.0
    
    # Annualization factors
    factors = {
        "daily": 252,
        "weekly": 52,
        "monthly": 12
    }
    
    factor = factors.get(frequency, 252)
    
    # Realized volatility: sqrt(sum(r²) * factor / n)
    rv = np.sqrt(np.sum(r ** 2) * factor / len(r))
    
    return float(rv)
