"""
Shannon Entropy Calculation

Entropy measures the uncertainty/randomness in price movements.
Lower entropy = more predictable patterns.
Higher entropy = more chaotic/random behavior.

This is a deterministic mathematical calculation.
"""

import numpy as np
import pandas as pd
from typing import Union


def calculate_entropy(
    series: Union[pd.Series, np.ndarray], 
    bins: int = 10,
    use_returns: bool = True
) -> float:
    """
    Calculate Shannon Entropy of a price or return series.
    
    Shannon Entropy measures the average amount of information
    (or uncertainty) in a distribution.
    
    Args:
        series: Price series or return series
        bins: Number of bins for histogram (default 10)
        use_returns: If True, calculate returns from prices first
    
    Returns:
        Entropy value (in bits). Range typically 0-4.
        - 0: Perfectly predictable (single outcome)
        - log2(bins): Maximum entropy (uniform distribution)
    
    Interpretation:
        < 2.0: High predictability
        2.0-3.0: Moderate uncertainty
        > 3.0: High uncertainty/randomness
    """
    if isinstance(series, pd.Series):
        data = series.values
    else:
        data = series
    
    if len(data) < 2:
        return 0.0
    
    # Convert to returns if needed
    if use_returns:
        # Calculate percentage changes
        returns = np.diff(data) / data[:-1]
        returns = returns[~np.isnan(returns)]  # Remove NaN values
        returns = returns[np.isfinite(returns)]  # Remove infinite values
    else:
        returns = data
    
    if len(returns) < 2:
        return 0.0
    
    # Create histogram
    counts, _ = np.histogram(returns, bins=bins)
    
    # Convert to probabilities
    total = len(returns)
    probabilities = counts / total
    
    # Filter out zero probabilities (log(0) is undefined)
    probabilities = probabilities[probabilities > 0]
    
    if len(probabilities) == 0:
        return 0.0
    
    # Calculate Shannon entropy: H = -Σ p(x) * log2(p(x))
    entropy = -np.sum(probabilities * np.log2(probabilities))
    
    return float(entropy)


def calculate_normalized_entropy(
    series: Union[pd.Series, np.ndarray],
    bins: int = 10
) -> float:
    """
    Calculate normalized entropy (0 to 1 scale).
    
    Normalized entropy divides by maximum possible entropy,
    making comparison across different bin sizes easier.
    
    Returns:
        Value between 0 and 1.
        0 = perfectly predictable
        1 = maximum uncertainty
    """
    entropy = calculate_entropy(series, bins)
    max_entropy = np.log2(bins)  # Maximum entropy for given bins
    
    if max_entropy == 0:
        return 0.0
    
    return min(1.0, entropy / max_entropy)


def calculate_sample_entropy(
    series: Union[pd.Series, np.ndarray],
    m: int = 2,
    r: float = 0.2
) -> float:
    """
    Calculate Sample Entropy (SampEn) for time series complexity analysis.
    
    Sample Entropy is more suitable for financial time series as it
    doesn't count self-matches and is less dependent on data length.
    
    Args:
        series: Time series data
        m: Embedding dimension (default 2)
        r: Tolerance, typically 0.1-0.25 of std (default 0.2)
    
    Returns:
        Sample entropy value. Higher = more complex/random.
    """
    if isinstance(series, pd.Series):
        data = series.values
    else:
        data = series
    
    N = len(data)
    if N < m + 1:
        return 0.0
    
    # Tolerance as fraction of standard deviation
    tolerance = r * np.std(data)
    
    def count_matches(template_length):
        """Count matching templates within tolerance."""
        templates = np.array([data[i:i + template_length] 
                            for i in range(N - template_length)])
        count = 0
        for i in range(len(templates)):
            for j in range(i + 1, len(templates)):
                if np.max(np.abs(templates[i] - templates[j])) <= tolerance:
                    count += 1
        return count
    
    A = count_matches(m + 1)
    B = count_matches(m)
    
    if B == 0:
        return 0.0
    
    return -np.log(A / B) if A > 0 else 0.0
