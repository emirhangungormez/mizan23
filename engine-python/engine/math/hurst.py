"""
Hurst Exponent Calculation

The Hurst exponent measures the tendency of a time series to either
regress to the mean or to cluster in a direction.

H < 0.5: Mean-reverting (anti-persistent)
H = 0.5: Random walk (geometric Brownian motion)
H > 0.5: Trending (persistent)

This is a deterministic mathematical calculation.
"""

import numpy as np
import pandas as pd
from typing import Union, Tuple


def calculate_hurst(
    series: Union[pd.Series, np.ndarray],
    max_lag: int = 20
) -> float:
    """
    Calculate the Hurst Exponent using the Rescaled Range (R/S) method.
    
    The Hurst exponent quantifies the long-term memory of a time series.
    
    Args:
        series: Price series
        max_lag: Maximum lag for R/S calculation (default 20)
    
    Returns:
        Hurst exponent value (typically 0 to 1).
        
    Interpretation:
        H < 0.4: Strongly mean-reverting
        H = 0.4-0.5: Slightly mean-reverting
        H ≈ 0.5: Random walk
        H = 0.5-0.6: Slightly trending
        H > 0.6: Strongly trending
    """
    if isinstance(series, pd.Series):
        ts = series.values
    else:
        ts = series
    
    # Need sufficient data
    if len(ts) < max_lag * 5:
        return 0.5  # Return random walk assumption if insufficient data
    
    lags = range(2, max_lag + 1)
    
    # Calculate R/S for each lag
    rs_values = []
    
    for lag in lags:
        try:
            rs = _rescaled_range(ts, lag)
            if rs > 0:
                rs_values.append((lag, rs))
        except Exception:
            continue
    
    if len(rs_values) < 3:
        return 0.5
    
    # Linear regression of log(R/S) vs log(lag)
    log_lags = np.log([x[0] for x in rs_values])
    log_rs = np.log([x[1] for x in rs_values])
    
    # Polyfit: slope is the Hurst exponent
    try:
        coefficients = np.polyfit(log_lags, log_rs, 1)
        hurst = coefficients[0]
    except Exception:
        return 0.5
    
    # Clip to reasonable range
    return float(max(0.0, min(1.0, hurst)))


def _rescaled_range(ts: np.ndarray, lag: int) -> float:
    """
    Calculate the rescaled range for a given lag.
    
    R/S = Range / Standard Deviation of the mean-adjusted series.
    """
    n = len(ts)
    
    if n < lag:
        return 0.0
    
    # Split into sub-series
    num_subseries = n // lag
    rs_list = []
    
    for i in range(num_subseries):
        start = i * lag
        end = start + lag
        subseries = ts[start:end]
        
        # Mean-adjust
        mean = np.mean(subseries)
        mean_adjusted = subseries - mean
        
        # Cumulative deviations
        cumulative = np.cumsum(mean_adjusted)
        
        # Range
        R = np.max(cumulative) - np.min(cumulative)
        
        # Standard deviation
        S = np.std(subseries, ddof=1)
        
        if S > 0:
            rs_list.append(R / S)
    
    return np.mean(rs_list) if rs_list else 0.0


def calculate_hurst_variance(
    series: Union[pd.Series, np.ndarray]
) -> float:
    """
    Calculate Hurst exponent using the variance method.
    
    This is an alternative method that uses the relationship
    between variance and sample size.
    
    Returns:
        Hurst exponent estimate.
    """
    if isinstance(series, pd.Series):
        ts = series.values
    else:
        ts = series
    
    if len(ts) < 100:
        return 0.5
    
    # Calculate returns
    returns = np.diff(ts) / ts[:-1]
    returns = returns[~np.isnan(returns)]
    
    if len(returns) < 50:
        return 0.5
    
    # Calculate variance at different time scales
    lags = [2, 4, 8, 16, 32]
    variances = []
    
    for lag in lags:
        if lag * 3 > len(returns):
            continue
        
        # Aggregate returns over lag periods
        n_periods = len(returns) // lag
        aggregated = np.array([
            np.sum(returns[i * lag:(i + 1) * lag]) 
            for i in range(n_periods)
        ])
        
        if len(aggregated) > 1:
            variances.append((lag, np.var(aggregated)))
    
    if len(variances) < 3:
        return 0.5
    
    # Log-log regression
    log_lags = np.log([v[0] for v in variances])
    log_vars = np.log([v[1] for v in variances])
    
    try:
        slope, _ = np.polyfit(log_lags, log_vars, 1)
        # Var(n) ∝ n^(2H), so slope = 2H, H = slope/2
        hurst = slope / 2
    except Exception:
        return 0.5
    
    return float(max(0.0, min(1.0, hurst)))


def interpret_hurst(hurst: float) -> Tuple[str, str]:
    """
    Provide human-readable interpretation of Hurst exponent.
    
    Returns:
        Tuple of (regime_type, description)
    """
    if hurst < 0.35:
        return (
            "strongly_mean_reverting",
            "Strong tendency to revert to mean. Price swings tend to reverse."
        )
    elif hurst < 0.45:
        return (
            "mean_reverting", 
            "Mild mean-reverting behavior. Range-bound movements likely."
        )
    elif hurst < 0.55:
        return (
            "random_walk",
            "Random walk behavior. No clear trend or mean-reversion."
        )
    elif hurst < 0.65:
        return (
            "trending",
            "Mild trending behavior. Moves tend to persist."
        )
    else:
        return (
            "strongly_trending",
            "Strong trending behavior. Momentum strategies may be effective."
        )
