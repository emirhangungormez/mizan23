"""
Borsapy 0.7.2 API Endpoints
============================
New endpoints for borsapy 0.7.2 features:
- TCMB interest rates
- Eurobonds
- Enhanced screener
- Technical scanning
- Fund comparisons
- Portfolio management
"""

from fastapi import APIRouter, HTTPException, Query, Path
from typing import Optional, List
from pydantic import BaseModel
import pandas as pd

from engine.data.borsapy_v072_extensions import (
    get_fast_info,
    get_ttm_financials,
    get_bank_financials,
    get_tcmb_rates,
    get_tcmb_history,
    get_policy_rate,
    get_eurobonds,
    get_eurobond,
    get_bond_yields,
    get_bond,
    get_risk_free_rate,
    get_technicals,
    get_history_with_indicators,
    get_supertrend,
    get_tilson_t3,
    get_ta_signals_all_timeframes,
    screen_stocks_public,
    get_screener_templates,
    get_sectors,
    get_stock_indices,
    technical_scan,
    get_fund_info_enhanced,
    screen_funds_enhanced,
    compare_funds,
    create_portfolio,
    get_portfolio_metrics,
    get_fx_intraday,
    get_fx_bank_rates,
    get_fx_institution_history,
    get_metal_institution_rates,
    get_viop_contracts,
    search_viop,
    search_symbols_tv,
    search_bist,
    search_crypto,
    get_index_components,
    get_all_indices,
    get_popular_indices,
    calculate_inflation,
    get_companies_list,
    search_companies
)

router = APIRouter()


# ==========================================
# Helper Functions
# ==========================================

import math

def clean_value(value):
    """Clean a value to be JSON serializable (handles nan, inf, nested structures)."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, pd.Timestamp):
        return str(value)
    if hasattr(pd, 'isna') and pd.isna(value) if isinstance(value, (float, type(None))) else False:
        return None
    if isinstance(value, dict):
        return {k: clean_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean_value(v) for v in value]
    return value

def df_to_records(df: pd.DataFrame) -> List[dict]:
    """Convert DataFrame to list of dicts with NaN/Inf handling."""
    if df is None or df.empty:
        return []
    if isinstance(df.index, pd.DatetimeIndex):
        df = df.reset_index()
    records = df.to_dict(orient="records")
    cleaned_records = []
    for record in records:
        cleaned = {}
        for key, value in record.items():
            cleaned[key] = clean_value(value)
        cleaned_records.append(cleaned)
    return cleaned_records


def safe_dict(data) -> dict:
    """Make data JSON serializable with deep cleaning."""
    if data is None:
        return {}
    if isinstance(data, pd.DataFrame):
        return {"data": df_to_records(data)}
    if isinstance(data, dict):
        result = {}
        for k, v in data.items():
            if isinstance(v, pd.DataFrame):
                result[k] = df_to_records(v)
            else:
                result[k] = clean_value(v)
        return result
    return clean_value(data)


# ==========================================
# TCMB ENDPOINTS
# ==========================================

@router.get("/tcmb/rates")
def get_tcmb_rates_endpoint():
    """
    Get current TCMB (Turkish Central Bank) interest rates.
    Includes policy rate, overnight corridor, and late liquidity window.
    """
    data = get_tcmb_rates()
    return safe_dict(data)


@router.get("/tcmb/policy-rate")
def get_policy_rate_endpoint():
    """Get current policy rate (1-week repo rate)."""
    rate = get_policy_rate()
    return {"policy_rate": rate, "unit": "percent"}


@router.get("/tcmb/history/{rate_type}")
def get_tcmb_history_endpoint(
    rate_type: str,
    period: str = Query("1y", description="1y, 3y, 5y, max")
):
    """
    Get TCMB rate history.
    rate_type: policy, overnight, late_liquidity
    """
    df = get_tcmb_history(rate_type, period=period)
    return {"rate_type": rate_type, "data": df_to_records(df)}


# ==========================================
# EUROBOND ENDPOINTS
# ==========================================

@router.get("/eurobonds")
def get_eurobonds_endpoint(
    currency: Optional[str] = Query(None, pattern="^(USD|EUR)$")
):
    """
    Get Turkish government eurobonds.
    38+ bonds available in USD and EUR.
    """
    df = get_eurobonds(currency=currency)
    return {"currency": currency or "all", "bonds": df_to_records(df), "count": len(df)}


@router.get("/eurobond/{isin}")
def get_eurobond_endpoint(isin: str):
    """Get single eurobond by ISIN code."""
    data = get_eurobond(isin)
    if not data:
        raise HTTPException(status_code=404, detail=f"Eurobond {isin} not found")
    return data


# ==========================================
# BOND ENDPOINTS (Enhanced)
# ==========================================

@router.get("/bonds/all")
def get_all_bonds_endpoint():
    """Get all Turkish government bond yields (2Y, 5Y, 10Y)."""
    df = get_bond_yields()
    return {"bonds": df_to_records(df)}


@router.get("/bonds/{maturity}")
def get_bond_endpoint(maturity: str):
    """Get specific bond yield. maturity: 2Y, 5Y, 10Y"""
    data = get_bond(maturity)
    if not data:
        raise HTTPException(status_code=404, detail=f"Bond {maturity} not found")
    return data


@router.get("/risk-free-rate")
def get_rfr_endpoint():
    """
    Get risk-free rate (10Y bond yield in decimal form).
    Useful for DCF and valuation calculations.
    """
    rate = get_risk_free_rate()
    return {"rate": rate, "maturity": "10Y", "note": "decimal form (0.28 = 28%)"}


# ==========================================
# FAST INFO ENDPOINT
# ==========================================

@router.get("/fast-info/{symbol}")
def get_fast_info_endpoint(symbol: str):
    """
    Get quick price info from cache (no API call).
    Fast response with: last_price, volume, market_cap, pe_ratio, etc.
    """
    data = get_fast_info(symbol.upper())
    if not data:
        raise HTTPException(status_code=404, detail=f"No fast info for {symbol}")
    return data


# ==========================================
# TTM FINANCIALS
# ==========================================

@router.get("/ttm-financials/{symbol}")
def get_ttm_financials_endpoint(
    symbol: str,
    financial_group: Optional[str] = Query(None, description="UFRS for banks")
):
    """
    Get trailing twelve months (TTM) financial statements.
    For banks, use financial_group=UFRS
    """
    data = get_ttm_financials(symbol.upper(), financial_group=financial_group)
    return safe_dict(data)


@router.get("/bank-financials/{symbol}")
def get_bank_financials_endpoint(
    symbol: str,
    quarterly: bool = Query(False)
):
    """
    Get bank financials using UFRS format.
    Banks require special UFRS format for accurate data.
    """
    data = get_bank_financials(symbol.upper(), quarterly=quarterly)
    return safe_dict(data)


# ==========================================
# TECHNICAL ANALYSIS ENDPOINTS
# ==========================================

@router.get("/technicals/{symbol}")
def get_technicals_endpoint(symbol: str, period: str = Query("1y")):
    """
    Get comprehensive technical analysis.
    Returns latest values for RSI, SMA, EMA, MACD, Bollinger, etc.
    """
    data = get_technicals(symbol.upper(), period=period)
    return safe_dict(data)


@router.get("/history-with-indicators/{symbol}")
def get_history_indicators_endpoint(
    symbol: str,
    period: str = Query("3mo"),
    indicators: Optional[str] = Query(None, description="Comma-separated: sma,rsi,macd")
):
    """
    Get OHLCV with technical indicators in single DataFrame.
    """
    indicator_list = indicators.split(",") if indicators else None
    df = get_history_with_indicators(symbol.upper(), period=period, indicators=indicator_list)
    return {"symbol": symbol.upper(), "data": df_to_records(df)}


@router.get("/supertrend/{symbol}")
def get_supertrend_endpoint(
    symbol: str,
    period: str = Query("6mo"),
    atr_period: int = Query(10),
    multiplier: float = Query(3.0)
):
    """
    Get Supertrend indicator.
    direction: 1 = bullish, -1 = bearish
    """
    data = get_supertrend(symbol.upper(), period=period, atr_period=atr_period, multiplier=multiplier)
    return {"symbol": symbol.upper(), **data}


@router.get("/tilson-t3/{symbol}")
def get_tilson_endpoint(symbol: str, period: int = Query(5)):
    """Get Tilson T3 (triple-smoothed EMA) value."""
    value = get_tilson_t3(symbol.upper(), t3_period=period)
    return {"symbol": symbol.upper(), "tilson_t3": value, "period": period}


@router.get("/ta-signals-all/{symbol}")
def get_ta_signals_all_endpoint(symbol: str):
    """
    Get TradingView signals for ALL timeframes.
    Returns 1h, 4h, 1d, 1W, 1M signals.
    """
    data = get_ta_signals_all_timeframes(symbol.upper())
    return safe_dict(data)


# ==========================================
# SCREENER ENDPOINTS (Public API)
# ==========================================

@router.get("/screen/stocks")
def screen_stocks_endpoint(
    template: Optional[str] = Query(None, description="high_dividend, low_pe, high_roe, etc."),
    sector: Optional[str] = None,
    index: Optional[str] = None,
    pe_max: Optional[float] = None,
    pe_min: Optional[float] = None,
    pb_max: Optional[float] = None,
    dividend_yield_min: Optional[float] = None,
    roe_min: Optional[float] = None,
    market_cap_min: Optional[float] = None,
    upside_potential_min: Optional[float] = None
):
    """
    Screen BIST stocks using public borsapy API.
    Uses the new screen_stocks() function instead of internal API.
    """
    df = screen_stocks_public(
        template=template,
        sector=sector,
        index=index,
        pe_max=pe_max,
        pe_min=pe_min,
        pb_max=pb_max,
        dividend_yield_min=dividend_yield_min,
        roe_min=roe_min,
        market_cap_min=market_cap_min,
        upside_potential_min=upside_potential_min
    )
    return {"results": df_to_records(df), "count": len(df)}


@router.get("/screen/templates")
def get_templates_endpoint():
    """Get available screener templates."""
    return {"templates": get_screener_templates()}


@router.get("/screen/sectors")
def get_sectors_endpoint():
    """Get list of BIST sectors."""
    return {"sectors": get_sectors()}


@router.get("/screen/indices")
def get_indices_endpoint():
    """Get list of BIST indices for screening."""
    return {"indices": get_stock_indices()}


# ==========================================
# TECHNICAL SCAN ENDPOINT
# ==========================================

@router.get("/scan")
def technical_scan_endpoint(
    index: str = Query("XU100", description="XU030, XU100, XBANK, etc."),
    condition: str = Query(..., description="e.g., 'rsi < 30' or 'sma_20 crosses_above sma_50'"),
    interval: str = Query("1d", description="1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1W, 1M")
):
    """
    Perform technical scan using condition strings.
    
    Examples:
    - rsi < 30 (oversold)
    - price > sma_50 (above 50-day SMA)
    - rsi < 30 and volume > 1000000 (compound)
    - sma_20 crosses_above sma_50 (golden cross)
    - close above_pct sma_50 1.05 (5% above SMA50)
    """
    df = technical_scan(index, condition, interval=interval)
    return {"index": index, "condition": condition, "results": df_to_records(df), "count": len(df)}


# ==========================================
# FUND ENDPOINTS (Enhanced)
# ==========================================

@router.get("/fund-enhanced/{code}")
def get_fund_enhanced_endpoint(
    code: str,
    fund_type: Optional[str] = Query(None, pattern="^(YAT|EMK)$", description="YAT=investment, EMK=pension")
):
    """
    Get enhanced fund info including risk metrics.
    Supports both YAT (investment) and EMK (pension/emeklilik) funds.
    """
    data = get_fund_info_enhanced(code.upper(), fund_type=fund_type)
    return safe_dict(data)


@router.get("/screen/funds")
def screen_funds_endpoint(
    fund_type: str = Query("YAT", pattern="^(YAT|EMK)$"),
    min_return_1y: Optional[float] = None,
    min_return_ytd: Optional[float] = None,
    min_return_1m: Optional[float] = None
):
    """
    Screen funds by performance criteria.
    fund_type: YAT (investment) or EMK (pension)
    """
    df = screen_funds_enhanced(
        fund_type=fund_type,
        min_return_1y=min_return_1y,
        min_return_ytd=min_return_ytd,
        min_return_1m=min_return_1m
    )
    return {"fund_type": fund_type, "results": df_to_records(df), "count": len(df)}


@router.get("/compare-funds")
def compare_funds_endpoint(
    codes: str = Query(..., description="Comma-separated fund codes (max 10)")
):
    """
    Compare multiple funds.
    Returns rankings by return, size, and risk.
    """
    code_list = [c.strip().upper() for c in codes.split(",")][:10]
    data = compare_funds(code_list)
    return safe_dict(data)


# ==========================================
# FX ENHANCED ENDPOINTS
# ==========================================

@router.get("/fx-intraday/{currency}")
def get_fx_intraday_endpoint(
    currency: str,
    interval: str = Query("5m", pattern="^(1m|5m|15m|30m|1h)$"),
    period: str = Query("1g", description="1g=1day, 5g=5days")
):
    """
    Get intraday FX data from TradingView.
    Supported currencies: USD, EUR, GBP
    """
    df = get_fx_intraday(currency.upper(), interval=interval, period=period)
    return {"currency": currency.upper(), "interval": interval, "data": df_to_records(df)}


@router.get("/fx-bank-rates/{currency}")
def get_bank_rates_endpoint(currency: str):
    """
    Get exchange rates from all Turkish banks.
    """
    df = get_fx_bank_rates(currency.upper())
    return {"currency": currency.upper(), "rates": df_to_records(df)}


@router.get("/fx-institution-history/{currency}/{institution}")
def get_institution_history_endpoint(
    currency: str,
    institution: str,
    period: str = Query("1mo")
):
    """
    Get historical rates from a specific bank or kuyumcu.
    institution: akbank, garanti, kapalicarsi, harem, altinkaynak, etc.
    """
    df = get_fx_institution_history(currency.lower(), institution.lower(), period=period)
    return {"currency": currency, "institution": institution, "data": df_to_records(df)}


@router.get("/metal-institution-rates/{metal}")
def get_metal_rates_endpoint(
    metal: str = Path(description="gram-altin, gram-gumus, ons-altin, gram-platin")
):
    """
    Get gold/silver rates from all institutions (banks + kuyumcular).
    """
    df = get_metal_institution_rates(metal)
    return {"metal": metal, "rates": df_to_records(df)}


# ==========================================
# VIOP ENHANCED ENDPOINTS
# ==========================================

@router.get("/viop-contracts/{base_symbol}")
def get_viop_contracts_endpoint(base_symbol: str):
    """
    Get VIOP contracts for a base symbol.
    base_symbol: XU030D, XAUTRY, USDTRYD, THYAOD, etc.
    """
    contracts = get_viop_contracts(base_symbol.upper())
    return {"base_symbol": base_symbol.upper(), "contracts": contracts, "count": len(contracts)}


@router.get("/viop-search")
def search_viop_endpoint(query: str):
    """Search VIOP symbols."""
    results = search_viop(query)
    return {"query": query, "results": results}


# ==========================================
# SEARCH ENDPOINTS
# ==========================================

@router.get("/search-tv")
def search_tv_endpoint(
    query: str,
    type: Optional[str] = Query(None, description="stock, forex, crypto, index, futures, bond, fund"),
    exchange: Optional[str] = Query(None, description="BIST, etc.")
):
    """
    Search symbols using TradingView API.
    Returns detailed info for each match.
    """
    results = search_symbols_tv(query, type=type, exchange=exchange)
    return {"query": query, "results": results}


@router.get("/search-bist")
def search_bist_endpoint(query: str):
    """Search only BIST stocks."""
    results = search_bist(query)
    return {"query": query, "results": results}


@router.get("/search-crypto")
def search_crypto_endpoint(query: str):
    """Search crypto pairs."""
    results = search_crypto(query)
    return {"query": query, "results": results}


# ==========================================
# INDEX ENHANCED ENDPOINTS
# ==========================================

@router.get("/index-components/{index_symbol}")
def get_index_components_endpoint(index_symbol: str):
    """
    Get components of a BIST index.
    Returns list of {symbol, name} for each constituent.
    """
    components = get_index_components(index_symbol.upper())
    return {"index": index_symbol.upper(), "components": components, "count": len(components)}


@router.get("/all-indices")
def get_all_indices_endpoint():
    """Get all 79 BIST indices with details."""
    indices = get_all_indices()
    return {"indices": indices, "count": len(indices)}


@router.get("/popular-indices")
def get_popular_indices_endpoint():
    """Get list of 33 popular BIST indices."""
    indices = get_popular_indices()
    return {"indices": indices}


# ==========================================
# UTILITY ENDPOINTS
# ==========================================

@router.get("/inflation-calculate")
def calculate_inflation_endpoint(
    amount: float = Query(..., description="Initial amount in TL"),
    start_date: str = Query(..., description="Start date YYYY-MM"),
    end_date: str = Query(..., description="End date YYYY-MM")
):
    """
    Calculate inflation-adjusted value.
    """
    result = calculate_inflation(amount, start_date, end_date)
    return safe_dict(result)


@router.get("/companies-list")
def get_companies_endpoint():
    """Get all BIST companies."""
    df = get_companies_list()
    return {"companies": df_to_records(df), "count": len(df)}


@router.get("/search-companies")
def search_companies_endpoint(query: str):
    """Search BIST companies by name or sector."""
    results = search_companies(query)
    return {"query": query, "results": results}
