"""
Balance Strength Analyzer

Analyzes the relative strength and stability of a stock
based on price action and technical indicators.

This is a price-based strength measure, not a fundamental balance sheet analysis.
True balance sheet analysis would require fundamental financial data.
"""

import numpy as np
import pandas as pd
from typing import Optional, Dict
from engine.data.market_fetch import market_fetcher


class BalanceStrengthAnalyzer:
    """
    Analyzes price-based strength metrics.
    
    Since fundamental balance sheet data is not available through borsapy,
    this analyzer focuses on price-derived strength indicators.
    """
    
    @staticmethod
    def analyze(symbol: str) -> Optional[float]:
        """
        Calculate composite balance strength score.
        
        This combines multiple price-based strength indicators
        into a single 0-1 score.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Strength score (0-1) or None if calculation fails
        """
        data = market_fetcher.get_stock_data(symbol, period="1y")
        
        if data is None or data.empty:
            return None
        
        scores = []
        
        # 1. Trend Strength (0-1)
        trend_score = BalanceStrengthAnalyzer._calculate_trend_strength(data)
        if trend_score is not None:
            scores.append(trend_score)
        
        # 2. Support/Resistance Strength (0-1)
        sr_score = BalanceStrengthAnalyzer._calculate_support_resistance_strength(data)
        if sr_score is not None:
            scores.append(sr_score)
        
        # 3. Volume Confirmation (0-1)
        vol_score = BalanceStrengthAnalyzer._calculate_volume_strength(data)
        if vol_score is not None:
            scores.append(vol_score)
        
        # 4. Price Stability (0-1)
        stability_score = BalanceStrengthAnalyzer._calculate_stability(data)
        if stability_score is not None:
            scores.append(stability_score)
        
        if not scores:
            return None
        
        return float(np.mean(scores))
    
    @staticmethod
    def _calculate_trend_strength(data: pd.DataFrame) -> Optional[float]:
        """
        Calculate trend strength based on SMA alignment.
        
        Strong uptrend: Price > SMA20 > SMA50 > SMA100 = 1.0
        Strong downtrend: Price < SMA20 < SMA50 < SMA100 = 0.0
        Mixed: Values in between
        """
        prices = data["Close"]
        
        if len(prices) < 100:
            return 0.5
        
        current = prices.iloc[-1]
        sma20 = prices.rolling(20).mean().iloc[-1]
        sma50 = prices.rolling(50).mean().iloc[-1]
        sma100 = prices.rolling(100).mean().iloc[-1]
        
        score = 0.5
        
        # Price vs SMAs
        if current > sma20:
            score += 0.125
        if current > sma50:
            score += 0.125
        if current > sma100:
            score += 0.125
        
        # SMA alignment
        if sma20 > sma50:
            score += 0.0625
        if sma50 > sma100:
            score += 0.0625
        
        return min(1.0, max(0.0, score))
    
    @staticmethod
    def _calculate_support_resistance_strength(data: pd.DataFrame) -> Optional[float]:
        """
        Evaluate price position relative to support/resistance.
        
        Near strong support with upward momentum = high score
        Near resistance with weakening momentum = low score
        """
        prices = data["Close"]
        highs = data["High"]
        lows = data["Low"]
        
        if len(prices) < 50:
            return 0.5
        
        current = float(prices.iloc[-1])
        
        # Find recent high and low as rough S/R
        recent_high = float(highs.tail(50).max())
        recent_low = float(lows.tail(50).min())
        
        # Position in the range
        range_size = recent_high - recent_low
        if range_size == 0:
            return 0.5
        
        position = (current - recent_low) / range_size
        
        # Calculate momentum
        returns_5d = float(prices.iloc[-1] / prices.iloc[-6] - 1) if len(prices) > 5 else 0
        
        # Score based on position and momentum
        if position > 0.8:
            # Near highs
            if returns_5d > 0.02:
                return 0.9  # Breaking out
            else:
                return 0.5  # Resistance
        elif position < 0.2:
            # Near lows
            if returns_5d < -0.02:
                return 0.2  # Breaking down
            else:
                return 0.6  # Support holding
        else:
            # Middle ground
            return 0.5 + (returns_5d * 5)  # Momentum adjusted
    
    @staticmethod
    def _calculate_volume_strength(data: pd.DataFrame) -> Optional[float]:
        """
        Analyze volume patterns for confirmation.
        
        Rising prices with rising volume = bullish confirmation = high score
        Rising prices with falling volume = weak rally = lower score
        """
        if "Volume" not in data.columns:
            return None
        
        prices = data["Close"]
        volume = data["Volume"]
        
        if len(prices) < 20:
            return 0.5
        
        # Recent vs average volume
        recent_vol = volume.tail(5).mean()
        avg_vol = volume.tail(50).mean()
        
        if avg_vol == 0:
            return 0.5
        
        vol_ratio = recent_vol / avg_vol
        
        # Price trend
        price_trend = (prices.iloc[-1] - prices.iloc[-20]) / prices.iloc[-20]
        
        # Volume confirmation
        if price_trend > 0.02 and vol_ratio > 1.2:
            return 0.8  # Strong bullish confirmation
        elif price_trend > 0.02 and vol_ratio < 0.8:
            return 0.5  # Weak rally
        elif price_trend < -0.02 and vol_ratio > 1.2:
            return 0.3  # Strong selling pressure
        elif price_trend < -0.02 and vol_ratio < 0.8:
            return 0.5  # Weak selling
        else:
            return 0.5  # Neutral
    
    @staticmethod
    def _calculate_stability(data: pd.DataFrame) -> Optional[float]:
        """
        Calculate price stability score.
        
        Lower volatility = higher stability = higher score
        """
        prices = data["Close"]
        
        if len(prices) < 50:
            return 0.5
        
        returns = prices.pct_change().dropna()
        volatility = returns.std() * np.sqrt(252)
        
        # Map volatility to score (inverse relationship)
        # 0% vol = 1.0 score, 50%+ vol = 0.0 score
        score = max(0.0, 1.0 - (volatility * 2))
        
        return score
    
    @staticmethod
    def get_detailed_analysis(symbol: str) -> Dict:
        """
        Get detailed breakdown of all strength components.
        """
        data = market_fetcher.get_stock_data(symbol, period="1y")
        
        if data is None or data.empty:
            return {
                "symbol": symbol,
                "status": "no_data",
                "overall_score": None,
                "components": {}
            }
        
        components = {
            "trend_strength": BalanceStrengthAnalyzer._calculate_trend_strength(data),
            "support_resistance": BalanceStrengthAnalyzer._calculate_support_resistance_strength(data),
            "volume_confirmation": BalanceStrengthAnalyzer._calculate_volume_strength(data),
            "price_stability": BalanceStrengthAnalyzer._calculate_stability(data)
        }
        
        valid_scores = [v for v in components.values() if v is not None]
        overall = np.mean(valid_scores) if valid_scores else None
        
        return {
            "symbol": symbol,
            "status": "ok",
            "overall_score": float(overall) if overall else None,
            "components": {k: float(v) if v is not None else None for k, v in components.items()}
        }
