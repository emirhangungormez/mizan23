"""
Score Engine

Central scoring system that combines all mathematical indicators
into a normalized, interpretable score.

The score represents an OPPORTUNITY ASSESSMENT, not a recommendation.
Higher score = potentially more favorable conditions based on metrics.

This is deterministic mathematics, NOT prediction.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any

from engine.math.entropy import calculate_entropy
from engine.math.hurst import calculate_hurst
from engine.math.volatility import calculate_volatility
from engine.math.regime import detect_regime, detect_regime_advanced


class ScoreEngine:
    """
    Central engine for generating asset scores.
    
    Combines multiple mathematical indicators into a single
    normalized score while preserving individual metrics
    for transparency.
    """
    
    @staticmethod
    def generate_asset_score(history_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate comprehensive score and metrics for an asset.
        
        Args:
            history_df: DataFrame with OHLCV data
            
        Returns:
            Dictionary containing:
            - score: Normalized score (0-1)
            - entropy: Shannon entropy value
            - hurst: Hurst exponent
            - volatility: Annualized volatility
            - regime: Market regime classification
            - risk_band: Risk classification
            - interpretation: Human-readable summary
        """
        if history_df is None or history_df.empty:
            return ScoreEngine._empty_result()
        
        # Ensure we have the Close column
        close_col = None
        for col in history_df.columns:
            if col.lower() == "close":
                close_col = col
                break
        
        if close_col is None:
            return ScoreEngine._empty_result()
        
        prices = history_df[close_col]
        
        if len(prices) < 50:
            return ScoreEngine._empty_result("Insufficient data (need 50+ days)")
        
        # Calculate all indicators
        entropy = calculate_entropy(prices)
        hurst = calculate_hurst(prices)
        volatility = calculate_volatility(prices)
        regime = detect_regime(prices)
        
        # Generate normalized score
        score = ScoreEngine._calculate_composite_score(
            entropy=entropy,
            hurst=hurst,
            volatility=volatility,
            regime=regime
        )
        
        # Determine risk band
        risk_band = ScoreEngine._classify_risk(volatility, entropy)
        
        # Generate interpretation
        interpretation = ScoreEngine._generate_interpretation(
            score=score,
            entropy=entropy,
            hurst=hurst,
            regime=regime,
            risk_band=risk_band
        )
        
        return {
            "score": round(score, 4),
            "entropy": round(entropy, 4),
            "hurst": round(hurst, 4),
            "volatility": round(volatility, 4),
            "regime": regime,
            "risk_band": risk_band,
            "interpretation": interpretation,
            "status": "ok"
        }
    
    @staticmethod
    def _calculate_composite_score(
        entropy: float,
        hurst: float,
        volatility: float,
        regime: str
    ) -> float:
        """
        Calculate composite score from individual indicators.
        
        Scoring logic:
        - Higher Hurst (trending) contributes positively
        - Lower entropy (predictable) contributes positively
        - Lower volatility contributes positively (stability)
        - Bullish regime adds bonus
        
        This is a weighted combination designed to favor
        stable, trending, predictable conditions.
        """
        score = 0.5  # Base score
        
        # Hurst contribution (0.25 weight)
        # H > 0.5 = trending = positive
        # H < 0.4 = mean-reverting = neutral to slightly positive
        if hurst > 0.6:
            score += 0.20
        elif hurst > 0.5:
            score += 0.10
        elif hurst < 0.4:
            score += 0.05  # Mean reversion can be traded
        
        # Entropy contribution (0.20 weight)
        # Lower entropy = more predictable = positive
        if entropy < 2.0:
            score += 0.15
        elif entropy < 2.5:
            score += 0.10
        elif entropy < 3.0:
            score += 0.05
        
        # Volatility contribution (0.20 weight)
        # Lower volatility = lower risk = positive
        if volatility < 0.15:
            score += 0.15
        elif volatility < 0.25:
            score += 0.10
        elif volatility < 0.35:
            score += 0.05
        elif volatility > 0.50:
            score -= 0.10  # High volatility penalty
        
        # Regime contribution (0.15 weight)
        if regime == "Bullish Trend":
            score += 0.15
        elif regime == "Sideways/Range":
            score += 0.05
        elif regime == "Bearish Trend":
            score -= 0.05  # Small penalty, not large
        
        # Clamp to valid range
        return max(0.0, min(1.0, score))
    
    @staticmethod
    def _classify_risk(volatility: float, entropy: float) -> str:
        """
        Classify risk level based on volatility and entropy.
        
        Returns:
            Risk band: "low", "moderate", "elevated", "high"
        """
        # Combine volatility and entropy for risk assessment
        vol_score = min(1.0, volatility / 0.50)  # 50% vol = max
        ent_score = min(1.0, entropy / 4.0)  # 4.0 entropy = max
        
        combined = (vol_score * 0.6) + (ent_score * 0.4)
        
        if combined < 0.25:
            return "low"
        elif combined < 0.50:
            return "moderate"
        elif combined < 0.75:
            return "elevated"
        else:
            return "high"
    
    @staticmethod
    def _generate_interpretation(
        score: float,
        entropy: float,
        hurst: float,
        regime: str,
        risk_band: str
    ) -> str:
        """
        Generate human-readable interpretation of the metrics.
        
        This explains what the numbers mean, not what to do.
        """
        parts = []
        
        # Score interpretation
        if score >= 0.75:
            parts.append("Metrics indicate favorable conditions.")
        elif score >= 0.6:
            parts.append("Metrics indicate moderately favorable conditions.")
        elif score >= 0.4:
            parts.append("Metrics indicate neutral conditions.")
        else:
            parts.append("Metrics indicate challenging conditions.")
        
        # Hurst interpretation
        if hurst > 0.6:
            parts.append(f"Strong trending behavior (H={hurst:.2f}).")
        elif hurst > 0.5:
            parts.append(f"Mild trending behavior (H={hurst:.2f}).")
        elif hurst < 0.4:
            parts.append(f"Mean-reverting behavior (H={hurst:.2f}).")
        else:
            parts.append(f"Random walk behavior (H={hurst:.2f}).")
        
        # Entropy interpretation
        if entropy < 2.5:
            parts.append(f"Low entropy ({entropy:.2f}) suggests higher predictability.")
        elif entropy > 3.2:
            parts.append(f"High entropy ({entropy:.2f}) suggests lower predictability.")
        
        # Regime
        parts.append(f"Current regime: {regime}.")
        
        # Risk
        parts.append(f"Risk band: {risk_band}.")
        
        return " ".join(parts)
    
    @staticmethod
    def _empty_result(message: str = "No data") -> Dict[str, Any]:
        """Return empty result structure."""
        return {
            "score": 0.0,
            "entropy": 0.0,
            "hurst": 0.5,
            "volatility": 0.0,
            "regime": "Unknown",
            "risk_band": "unknown",
            "interpretation": message,
            "status": "no_data"
        }
    
    @staticmethod
    def batch_score(symbols_data: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
        """
        Generate scores for multiple symbols at once.
        
        Args:
            symbols_data: Dictionary of {symbol: DataFrame}
            
        Returns:
            Dictionary of {symbol: score_result}
        """
        results = {}
        
        for symbol, data in symbols_data.items():
            try:
                results[symbol] = ScoreEngine.generate_asset_score(data)
                results[symbol]["symbol"] = symbol
            except Exception as e:
                results[symbol] = ScoreEngine._empty_result(f"Error: {str(e)}")
                results[symbol]["symbol"] = symbol
        
        return results
    
    @staticmethod
    def compare_assets(scores: Dict[str, Dict]) -> Dict:
        """
        Compare multiple scored assets and rank them.
        
        Args:
            scores: Dictionary from batch_score
            
        Returns:
            Comparison summary with rankings
        """
        valid_scores = {
            k: v for k, v in scores.items() 
            if v.get("status") == "ok"
        }
        
        if not valid_scores:
            return {
                "count": 0,
                "rankings": [],
                "best": None,
                "worst": None
            }
        
        # Sort by score
        ranked = sorted(
            valid_scores.items(),
            key=lambda x: x[1]["score"],
            reverse=True
        )
        
        rankings = [
            {
                "rank": i + 1,
                "symbol": symbol,
                "score": data["score"],
                "regime": data["regime"],
                "risk_band": data["risk_band"]
            }
            for i, (symbol, data) in enumerate(ranked)
        ]
        
        return {
            "count": len(rankings),
            "rankings": rankings,
            "best": rankings[0] if rankings else None,
            "worst": rankings[-1] if rankings else None,
            "average_score": np.mean([r["score"] for r in rankings])
        }
