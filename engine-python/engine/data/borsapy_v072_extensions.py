"""
Borsapy 0.7.2 Extensions Module
================================
New features from borsapy 0.7.2:
- fast_info (cache-based quick price data)
- ttm_* (trailing twelve months financial statements)
- TradingViewStream (real-time WebSocket streaming)
- Portfolio (multi-asset portfolio management)
- Backtest (strategy backtesting engine)
- TCMB (Central Bank interest rates)
- Eurobond (Turkish government eurobonds)
- TechnicalAnalyzer (comprehensive technical indicators)
- screen_stocks with Fluent API
- scan() function for technical screening
- Fund risk_metrics and compare_funds
"""

import borsapy as bp
from borsapy import Ticker, Index, FX, Crypto, Fund, Inflation
import pandas as pd
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import threading
from engine.utils.logger import logger
from engine.utils.retry import retry_external_service


# ==========================================
# FAST INFO - Cache-based quick price data
# ==========================================

@retry_external_service("borsapy")
def get_fast_info(symbol: str) -> Dict[str, Any]:
    """
    Get quick price info without full API call.
    Uses borsapy's fast_info which reads from cache.
    If PE ratio is null, tries to fetch from screener.
    
    Returns: last_price, previous_close, volume, market_cap, pe_ratio, free_float, foreign_ratio
    """
    try:
        t = bp.Ticker(symbol)
        fast = t.fast_info
        
        # Get PE ratio - fallback to screener if null
        pe_ratio = getattr(fast, 'pe_ratio', None)
        pb_ratio = getattr(fast, 'pb_ratio', None)
        
        # If PE is null, try to get from screener
        if pe_ratio is None or pb_ratio is None:
            try:
                screener = bp.Screener()
                screener.add_filter("price", 0.01, 100000)
                screener.add_filter("pe", -5000, 10000)
                screener.add_filter("pb", -1000, 1000)
                df = screener.run()
                if df is not None and not df.empty:
                    stock_row = df[df['symbol'] == symbol]
                    if not stock_row.empty:
                        if pe_ratio is None:
                            pe_ratio = stock_row.iloc[0].get('criteria_28', None)
                        if pb_ratio is None:
                            pb_ratio = stock_row.iloc[0].get('criteria_30', None)
            except Exception as screener_e:
                logger.exception("[BorsapyExt] screener fallback error", extra={"symbol": symbol, "error": str(screener_e)})
        
        # fast_info is an object, not a dict - access attributes directly
        return {
            "symbol": symbol,
            "currency": getattr(fast, 'currency', None),
            "exchange": getattr(fast, 'exchange', None),
            "last_price": getattr(fast, 'last_price', None),
            "open": getattr(fast, 'open', None),
            "day_high": getattr(fast, 'day_high', None),
            "day_low": getattr(fast, 'day_low', None),
            "previous_close": getattr(fast, 'previous_close', None),
            "volume": getattr(fast, 'volume', None),
            "amount": getattr(fast, 'amount', None),
            "market_cap": getattr(fast, 'market_cap', None),
            "shares": getattr(fast, 'shares', None),
            "pe_ratio": pe_ratio,
            "pb_ratio": pb_ratio,
            "year_high": getattr(fast, 'year_high', None),
            "year_low": getattr(fast, 'year_low', None),
            "fifty_day_average": getattr(fast, 'fifty_day_average', None),
            "two_hundred_day_average": getattr(fast, 'two_hundred_day_average', None),
            "free_float": getattr(fast, 'free_float', None),
            "foreign_ratio": getattr(fast, 'foreign_ratio', None),
            "source": "fast_info"
        }
    except Exception as e:
        logger.exception("[BorsapyExt] fast_info error", extra={"symbol": symbol, "error": str(e)})
        return {}


# ==========================================
# TTM FINANCIALS - Trailing Twelve Months
# ==========================================

@retry_external_service("borsapy")
def get_ttm_financials(symbol: str, financial_group: str = None) -> Dict[str, pd.DataFrame]:
    """
    Get trailing twelve months (TTM) financial statements.
    For banks, use financial_group="UFRS"
    
    Returns dict with ttm_income_stmt and ttm_cashflow
    """
    result = {}
    try:
        t = bp.Ticker(symbol)
        
        # Check if it's a bank (requires UFRS format)
        if financial_group == "UFRS":
            result["ttm_income_stmt"] = t.get_ttm_income_stmt(financial_group="UFRS")
            result["ttm_cashflow"] = t.get_ttm_cashflow(financial_group="UFRS")
        else:
            result["ttm_income_stmt"] = t.ttm_income_stmt
            result["ttm_cashflow"] = t.ttm_cashflow
            
    except Exception as e:
        logger.exception("[BorsapyExt] TTM financials error", extra={"symbol": symbol, "error": str(e)})
    
    return result


# ==========================================
# BANK FINANCIALS - UFRS Format
# ==========================================

@retry_external_service("borsapy")
def get_bank_financials(symbol: str, quarterly: bool = False) -> Dict[str, pd.DataFrame]:
    """
    Get financial statements for banks using UFRS format.
    Banks require financial_group="UFRS" parameter.
    """
    result = {}
    try:
        t = bp.Ticker(symbol)
        result["balance_sheet"] = t.get_balance_sheet(quarterly=quarterly, financial_group="UFRS")
        result["income_stmt"] = t.get_income_stmt(quarterly=quarterly, financial_group="UFRS")
        result["cashflow"] = t.get_cashflow(quarterly=quarterly, financial_group="UFRS")
    except Exception as e:
        logger.exception("[BorsapyExt] Bank financials error", extra={"symbol": symbol, "error": str(e)})
    return result


# ==========================================
# TCMB - Central Bank Interest Rates
# ==========================================

@retry_external_service("borsapy")
def get_tcmb_rates() -> Dict[str, Any]:
    """
    Get TCMB (Turkish Central Bank) interest rates.
    Includes policy rate, overnight corridor, and late liquidity window.
    """
    try:
        tcmb = bp.TCMB()
        return {
            "policy_rate": tcmb.policy_rate,
            "overnight": tcmb.overnight,  # {'borrowing': x, 'lending': y}
            "late_liquidity": tcmb.late_liquidity,  # {'borrowing': x, 'lending': y}
            "rates_df": tcmb.rates.to_dict(orient="records") if hasattr(tcmb, 'rates') else []
        }
    except Exception as e:
        logger.exception("[BorsapyExt] TCMB rates error", extra={"error": str(e)})
        return {}


@retry_external_service("borsapy")
def get_tcmb_history(rate_type: str = "policy", period: str = "1y") -> pd.DataFrame:
    """
    Get TCMB interest rate history.
    rate_type: "policy", "overnight", "late_liquidity"
    """
    try:
        tcmb = bp.TCMB()
        return tcmb.history(rate_type, period=period)
    except Exception as e:
        logger.exception("[BorsapyExt] TCMB history error", extra={"error": str(e)})
    return pd.DataFrame()


@retry_external_service("borsapy")
def get_policy_rate() -> float:
    """Quick helper to get current policy rate."""
    try:
        return float(bp.policy_rate())
    except Exception as e:
        logger.exception("[BorsapyExt] policy_rate error", extra={"error": str(e)})
        return 0.0


# ==========================================
# EUROBOND - Turkish Government Eurobonds
# ==========================================

@retry_external_service("borsapy")
def get_eurobonds(currency: str = None) -> pd.DataFrame:
    """
    Get Turkish government eurobonds.
    currency: None (all), "USD", or "EUR"
    
    Returns DataFrame with: isin, maturity, days_to_maturity, currency, 
                           bid_price, bid_yield, ask_price, ask_yield
    """
    try:
        if currency:
            return bp.eurobonds(currency=currency)
        return bp.eurobonds()
    except Exception as e:
        logger.exception("[BorsapyExt] Eurobonds error", extra={"currency": currency, "error": str(e)})
        return pd.DataFrame()


@retry_external_service("borsapy")
def get_eurobond(isin: str) -> Dict[str, Any]:
    """
    Get single eurobond details by ISIN code.
    """
    try:
        bond = bp.Eurobond(isin)
        return {
            "isin": bond.isin,
            "maturity": str(bond.maturity),
            "currency": bond.currency,
            "days_to_maturity": bond.days_to_maturity,
            "bid_price": bond.bid_price,
            "bid_yield": bond.bid_yield,
            "ask_price": bond.ask_price,
            "ask_yield": bond.ask_yield
        }
    except Exception as e:
        logger.exception("[BorsapyExt] Eurobond error", extra={"isin": isin, "error": str(e)})
        return {}


# ==========================================
# BONDS - Turkish Government Bonds
# ==========================================

@retry_external_service("borsapy")
def get_bond_yields() -> pd.DataFrame:
    """
    Get Turkish government bond yields (2Y, 5Y, 10Y).
    """
    try:
        return bp.bonds()
    except Exception as e:
        logger.exception("[BorsapyExt] Bonds error", extra={"error": str(e)})
        return pd.DataFrame()


@retry_external_service("borsapy")
def get_bond(maturity: str) -> Dict[str, Any]:
    """
    Get specific bond yield info.
    maturity: "2Y", "5Y", "10Y"
    """
    try:
        bond = bp.Bond(maturity)
        return {
            "maturity": maturity,
            "yield_rate": bond.yield_rate,
            "yield_decimal": bond.yield_decimal,
            "change_pct": bond.change_pct
        }
    except Exception as e:
        logger.exception("[BorsapyExt] Bond error", extra={"maturity": maturity, "error": str(e)})
        return {}


@retry_external_service("borsapy")
def get_risk_free_rate() -> float:
    """
    Get 10Y bond yield as risk-free rate (decimal form).
    Useful for DCF calculations.
    """
    try:
        return float(bp.risk_free_rate())
    except Exception as e:
        logger.exception("[BorsapyExt] risk_free_rate error", extra={"error": str(e)})
        return 0.28  # Default fallback


# ==========================================
# TECHNICAL ANALYZER - Comprehensive TA
# ==========================================

@retry_external_service("borsapy")
def get_technicals(symbol: str, period: str = "1y") -> Dict[str, Any]:
    """
    Get comprehensive technical analysis using TechnicalAnalyzer.
    Returns latest values for all indicators.
    """
    try:
        t = bp.Ticker(symbol)
        ta = t.technicals(period=period)
        return {
            "symbol": symbol,
            "latest": ta.latest,
            "rsi": float(ta.rsi().iloc[-1]) if not ta.rsi().empty else None,
            "sma_20": float(ta.sma(20).iloc[-1]) if not ta.sma(20).empty else None,
            "ema_12": float(ta.ema(12).iloc[-1]) if not ta.ema(12).empty else None
        }
    except Exception as e:
        logger.exception("[BorsapyExt] Technicals error", extra={"symbol": symbol, "error": str(e)})
        return {}


@retry_external_service("borsapy")
def get_history_with_indicators(symbol: str, period: str = "3mo", indicators: List[str] = None) -> pd.DataFrame:
    """
    Get OHLCV data with technical indicators in a single DataFrame.
    indicators: List of indicators to include, e.g., ["sma", "rsi", "macd"]
                If None, includes all standard indicators.
    """
    try:
        t = bp.Ticker(symbol)
        if indicators:
            return t.history_with_indicators(period=period, indicators=indicators)
        return t.history_with_indicators(period=period)
    except Exception as e:
        logger.exception("[BorsapyExt] History with indicators error", extra={"symbol": symbol, "error": str(e)})
        return pd.DataFrame()


@retry_external_service("borsapy")
def get_supertrend(symbol: str, period: str = "6mo", atr_period: int = 10, multiplier: float = 3.0) -> Dict[str, Any]:
    """
    Get Supertrend indicator values.
    """
    try:
        t = bp.Ticker(symbol)
        st = t.supertrend(period=period, atr_period=atr_period, multiplier=multiplier)
        return {
            "value": st.get("value"),
            "direction": st.get("direction"),  # 1 = bullish, -1 = bearish
            "upper": st.get("upper"),
            "lower": st.get("lower")
        }
    except Exception as e:
        logger.exception("[BorsapyExt] Supertrend error", extra={"symbol": symbol, "error": str(e)})
        return {}


@retry_external_service("borsapy")
def get_tilson_t3(symbol: str, period: str = "1y", t3_period: int = 5, vfactor: float = 0.7) -> float:
    """
    Get Tilson T3 (triple-smoothed EMA) value.
    """
    try:
        t = bp.Ticker(symbol)
        return t.tilson_t3(t3_period=t3_period)
    except Exception as e:
        logger.exception("[BorsapyExt] Tilson T3 error", extra={"symbol": symbol, "error": str(e)})
        return None


@retry_external_service("borsapy")
def get_ta_signals_all_timeframes(symbol: str) -> Dict[str, Any]:
    """
    Get TradingView technical analysis signals for all timeframes.
    Returns signals for 1h, 4h, 1d, 1W, 1M
    """
    try:
        t = bp.Ticker(symbol)
        return t.ta_signals_all_timeframes()
    except Exception as e:
        logger.exception("[BorsapyExt] TA signals all timeframes error", extra={"symbol": symbol, "error": str(e)})
        return {}


# ==========================================
# SCREENER - Public API (replaces internal)
# ==========================================

@retry_external_service("borsapy")
def screen_stocks_public(
    template: str = None,
    sector: str = None,
    index: str = None,
    pe_max: float = None,
    pe_min: float = None,
    pb_max: float = None,
    dividend_yield_min: float = None,
    roe_min: float = None,
    market_cap_min: float = None,
    upside_potential_min: float = None
) -> pd.DataFrame:
    """
    Screen BIST stocks using public borsapy API.
    This replaces the internal _providers.isyatirim_screener usage.
    
    Templates: high_dividend, low_pe, high_roe, high_upside, buy_recommendation, etc.
    """
    try:
        kwargs = {}
        if template:
            kwargs["template"] = template
        if sector:
            kwargs["sector"] = sector
        if index:
            kwargs["index"] = index
        if pe_max:
            kwargs["pe_max"] = pe_max
        if pe_min:
            kwargs["pe_min"] = pe_min
        if pb_max:
            kwargs["pb_max"] = pb_max
        if dividend_yield_min:
            kwargs["dividend_yield_min"] = dividend_yield_min
        if roe_min:
            kwargs["roe_min"] = roe_min
        if market_cap_min:
            kwargs["market_cap_min"] = market_cap_min
        if upside_potential_min:
            kwargs["upside_potential_min"] = upside_potential_min
            
        return bp.screen_stocks(**kwargs)
    except Exception as e:
        logger.exception("[BorsapyExt] screen_stocks_public error", extra={"kwargs": kwargs, "error": str(e)})
        return pd.DataFrame()


def get_screener_templates() -> List[str]:
    """Get available screener templates."""
    return [
        "small_cap", "mid_cap", "large_cap",
        "high_dividend", "low_pe", "high_roe", "high_upside", "low_upside",
        "high_volume", "low_volume", "high_net_margin", "high_return",
        "high_foreign_ownership", "buy_recommendation", "sell_recommendation"
    ]


def get_sectors() -> List[str]:
    """Get list of BIST sectors."""
    try:
        return bp.sectors()
    except:
        return []


def get_stock_indices() -> List[str]:
    """Get list of BIST indices for screening."""
    try:
        return bp.stock_indices()
    except:
        return []


# ==========================================
# TECHNICAL SCANNER - scan() function
# ==========================================

def technical_scan(index: str, condition: str, interval: str = "1d") -> pd.DataFrame:
    """
    Perform technical scan on an index using condition string.
    
    Examples:
    - "rsi < 30" (oversold)
    - "price > sma_50" (above 50-day SMA)
    - "rsi < 30 and volume > 1000000" (compound)
    - "sma_20 crosses_above sma_50" (golden cross)
    
    index: "XU030", "XU100", "XBANK", etc.
    interval: "1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1W", "1M"
    """
    try:
        return bp.scan(index, condition, interval=interval)
    except Exception as e:
        print(f"[BorsapyExt] Technical scan error: {e}")
        return pd.DataFrame()


# ==========================================
# FUND ENHANCEMENTS - EMK, Risk Metrics
# ==========================================

def get_fund_info_enhanced(code: str, fund_type: str = None) -> Dict[str, Any]:
    """
    Get enhanced fund info including risk metrics.
    fund_type: "YAT" (investment) or "EMK" (pension/emeklilik)
    """
    try:
        if fund_type:
            fund = bp.Fund(code, fund_type=fund_type)
        else:
            fund = bp.Fund(code)  # Auto-detects type
        
        info = fund.info
        
        # Get risk metrics
        risk = {}
        try:
            risk = fund.risk_metrics(period="1y")
        except:
            pass
        
        # Get Sharpe ratio
        sharpe = None
        try:
            sharpe = fund.sharpe_ratio()
        except:
            pass
        
        return {
            "code": code,
            "fund_type": fund.fund_type,
            "info": info,
            "risk_metrics": risk,
            "sharpe_ratio": sharpe,
            "allocation": fund.allocation.to_dict(orient="records") if hasattr(fund, 'allocation') and fund.allocation is not None else []
        }
    except Exception as e:
        print(f"[BorsapyExt] Fund info error for {code}: {e}")
        return {}


def screen_funds_enhanced(
    fund_type: str = "YAT",
    min_return_1y: float = None,
    min_return_ytd: float = None,
    min_return_1m: float = None
) -> pd.DataFrame:
    """
    Screen funds with criteria.
    fund_type: "YAT" (investment) or "EMK" (pension)
    """
    try:
        kwargs = {"fund_type": fund_type}
        if min_return_1y:
            kwargs["min_return_1y"] = min_return_1y
        if min_return_ytd:
            kwargs["min_return_ytd"] = min_return_ytd
        if min_return_1m:
            kwargs["min_return_1m"] = min_return_1m
        
        return bp.screen_funds(**kwargs)
    except Exception as e:
        print(f"[BorsapyExt] Screen funds error: {e}")
        return pd.DataFrame()


def compare_funds(codes: List[str]) -> Dict[str, Any]:
    """
    Compare multiple funds (max 10).
    Returns rankings and summary.
    """
    try:
        return bp.compare_funds(codes[:10])
    except Exception as e:
        print(f"[BorsapyExt] Compare funds error: {e}")
        return {}


# ==========================================
# PORTFOLIO - Multi-asset Management
# ==========================================

def create_portfolio() -> "bp.Portfolio":
    """Create a new portfolio instance."""
    try:
        return bp.Portfolio()
    except Exception as e:
        print(f"[BorsapyExt] Portfolio creation error: {e}")
        return None


def get_portfolio_metrics(portfolio: "bp.Portfolio", period: str = "1y") -> Dict[str, Any]:
    """
    Get comprehensive portfolio metrics.
    """
    try:
        metrics = portfolio.risk_metrics(period=period)
        return {
            "value": portfolio.value,
            "cost": portfolio.cost,
            "pnl": portfolio.pnl,
            "pnl_pct": portfolio.pnl_pct,
            "holdings": portfolio.holdings.to_dict(orient="records") if hasattr(portfolio, 'holdings') else [],
            "weights": portfolio.weights,
            "risk_metrics": metrics,
            "sharpe_ratio": portfolio.sharpe_ratio(),
            "sortino_ratio": portfolio.sortino_ratio(),
            "beta": portfolio.beta()
        }
    except Exception as e:
        print(f"[BorsapyExt] Portfolio metrics error: {e}")
        return {}


# ==========================================
# BACKTEST - Strategy Testing
# ==========================================

def run_backtest(
    symbol: str,
    strategy_func,
    period: str = "1y",
    capital: float = 100000,
    commission: float = 0.001,
    indicators: List[str] = None
) -> Dict[str, Any]:
    """
    Run a backtest on a strategy.
    
    strategy_func signature:
    def my_strategy(candle, position, indicators) -> 'BUY' | 'SELL' | 'HOLD' | None
    """
    try:
        result = bp.backtest(
            symbol,
            strategy_func,
            period=period,
            capital=capital,
            commission=commission,
            indicators=indicators or ['rsi', 'sma_20']
        )
        
        return {
            "net_profit": result.net_profit,
            "net_profit_pct": result.net_profit_pct,
            "total_trades": result.total_trades,
            "win_rate": result.win_rate,
            "profit_factor": result.profit_factor,
            "sharpe_ratio": result.sharpe_ratio,
            "max_drawdown": result.max_drawdown,
            "buy_hold_return": result.buy_hold_return,
            "vs_buy_hold": result.vs_buy_hold
        }
    except Exception as e:
        print(f"[BorsapyExt] Backtest error: {e}")
        return {}


# ==========================================
# FX ENHANCEMENTS - Intraday & Bank Rates
# ==========================================

def get_fx_intraday(currency: str, interval: str = "5m", period: str = "1g") -> pd.DataFrame:
    """
    Get intraday FX data from TradingView.
    Supported: USD, EUR, GBP (with TRY pairs)
    interval: "1m", "5m", "15m", "30m", "1h"
    """
    try:
        fx = bp.FX(currency)
        return fx.history(period=period, interval=interval)
    except Exception as e:
        print(f"[BorsapyExt] FX intraday error for {currency}: {e}")
        return pd.DataFrame()


def get_fx_bank_rates(currency: str) -> pd.DataFrame:
    """
    Get exchange rates from all banks.
    """
    try:
        fx = bp.FX(currency)
        return fx.bank_rates
    except Exception as e:
        print(f"[BorsapyExt] Bank rates error for {currency}: {e}")
        return pd.DataFrame()


def get_fx_institution_history(currency: str, institution: str, period: str = "1mo") -> pd.DataFrame:
    """
    Get historical rates from a specific institution (bank or kuyumcu).
    """
    try:
        fx = bp.FX(currency)
        return fx.institution_history(institution, period=period)
    except Exception as e:
        print(f"[BorsapyExt] Institution history error: {e}")
        return pd.DataFrame()


def get_metal_institution_rates(metal: str = "gram-altin") -> pd.DataFrame:
    """
    Get gold/silver rates from all institutions (banks + kuyumcular).
    metal: "gram-altin", "gram-gumus", "ons-altin", "gram-platin"
    """
    try:
        gold = bp.FX(metal)
        return gold.institution_rates
    except Exception as e:
        print(f"[BorsapyExt] Metal institution rates error: {e}")
        return pd.DataFrame()


# ==========================================
# VIOP ENHANCEMENTS - Contracts & Streaming
# ==========================================

def get_viop_contracts(base_symbol: str = "XU030D") -> List[str]:
    """
    Get list of VIOP contracts for a base symbol.
    base_symbol: "XU030D", "XAUTRY", "USDTRYD", etc.
    """
    try:
        return bp.viop_contracts(base_symbol)
    except Exception as e:
        print(f"[BorsapyExt] VIOP contracts error: {e}")
        return []


def search_viop(query: str) -> List[str]:
    """Search VIOP symbols."""
    try:
        return bp.search_viop(query)
    except:
        return []


# ==========================================
# SEARCH - TradingView Symbol Search
# ==========================================

def search_symbols_tv(query: str, type: str = None, exchange: str = None) -> List[Dict[str, Any]]:
    """
    Search symbols using TradingView API.
    type: "stock", "forex", "crypto", "index", "futures", "bond", "fund"
    exchange: "BIST", etc.
    """
    try:
        results = bp.search(query, type=type, exchange=exchange, full_info=True)
        return results
    except Exception as e:
        print(f"[BorsapyExt] Symbol search error: {e}")
        return []


def search_bist(query: str) -> List[str]:
    """Search only BIST stocks."""
    try:
        return bp.search_bist(query)
    except:
        return []


def search_crypto(query: str) -> List[str]:
    """Search only crypto pairs."""
    try:
        return bp.search_crypto(query)
    except:
        return []


# ==========================================
# INDEX ENHANCEMENTS
# ==========================================

def get_index_components(index_symbol: str) -> List[Dict[str, str]]:
    """
    Get components of a BIST index.
    Returns list of {'symbol': 'AKBNK', 'name': 'AKBANK'}
    """
    try:
        idx = bp.Index(index_symbol)
        return idx.components
    except Exception as e:
        print(f"[BorsapyExt] Index components error for {index_symbol}: {e}")
        return []


def get_all_indices() -> List[Dict[str, Any]]:
    """Get all 79 BIST indices with details."""
    try:
        return bp.all_indices()
    except:
        return []


def get_popular_indices() -> List[str]:
    """Get list of 33 popular indices."""
    try:
        return bp.indices()
    except:
        return []


# ==========================================
# UTILITY FUNCTIONS
# ==========================================

def calculate_inflation(amount: float, start_date: str, end_date: str) -> Dict[str, Any]:
    """
    Calculate inflation-adjusted value.
    Dates in format: "YYYY-MM"
    """
    try:
        inf = bp.Inflation()
        return inf.calculate(amount, start_date, end_date)
    except Exception as e:
        print(f"[BorsapyExt] Inflation calc error: {e}")
        return {}


def get_companies_list() -> pd.DataFrame:
    """Get all BIST companies."""
    try:
        return bp.companies()
    except:
        return pd.DataFrame()


def search_companies(query: str) -> List[Dict[str, Any]]:
    """Search BIST companies."""
    try:
        return bp.search_companies(query)
    except:
        return []
