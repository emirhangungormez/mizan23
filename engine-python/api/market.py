
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Response
from typing import ClassVar, Optional, List, Any
from pydantic import BaseModel
from datetime import datetime, timedelta
import threading
import pandas as pd
import borsapy as bp
from engine.data.market_fetch import market_fetcher
from engine.utils.logger import logger
from storage.market_outcomes import build_market_outcome_report

router: ClassVar[APIRouter] = APIRouter()

_macro_indicators_cache: dict | None = None
_macro_indicators_cached_at: datetime | None = None
_macro_indicators_refreshing = False


def _default_macro_indicators_payload() -> dict:
    return {
        "tr": {
            "inflation": {
                "yearly": 32.5,
                "monthly": 2.4,
                "date": "2026-03-01",
            },
            "policy_rate": {
                "value": 37.0,
                "date": "2026-03-12",
                "trend": "stable",
            },
            "unemployment": {
                "value": 8.6,
                "date": "2025-11-01",
                "trend": "stable",
            },
            "gdp_growth": {
                "value": 4.5,
                "date": "2025-Q3",
                "trend": "stable",
            },
        },
        "us": {
            "inflation": {
                "yearly": 2.4,
                "monthly": 0.5,
                "date": "2026-03-01",
            },
            "fed_rate": {
                "value": 4.5,
                "date": "2025-12-18",
                "trend": "down",
            },
            "unemployment": {
                "value": 4.2,
                "date": "2025-12-01",
                "trend": "stable",
            },
        },
        "generated_at": datetime.now().isoformat(),
    }


def _build_macro_indicators_payload() -> dict:
    from borsapy import Inflation, TCMB
    from engine.data.tuik_api import get_macro_indicators as get_tuik_data

    inf = Inflation()
    latest_tufe = inf.latest()

    try:
        tcmb = TCMB()
        policy_rate = float(getattr(tcmb, "policy_rate", 0) or 0)
        if policy_rate < 10:
            raise ValueError(f"implausible policy rate from borsapy: {policy_rate}")
    except Exception as e:
        print(f"[API] TCMB policy rate error: {e}")
        policy_rate = 37.0

    tuik_data = get_tuik_data()
    unemployment_data = tuik_data.get("unemployment", {})
    gdp_data = tuik_data.get("gdp", {})

    return {
        "tr": {
            "inflation": {
                "yearly": float(latest_tufe.get("yearly_inflation", 0)),
                "monthly": float(latest_tufe.get("monthly_inflation", 0)),
                "date": str(latest_tufe.get("date", "")),
            },
            "policy_rate": {
                "value": float(policy_rate),
                "date": "2026-03-12",
                "trend": "stable",
            },
            "unemployment": {
                "value": unemployment_data.get("value", 8.6),
                "date": unemployment_data.get("date", "2025-11-01"),
                "trend": unemployment_data.get("trend", "stable"),
            },
            "gdp_growth": {
                "value": gdp_data.get("value", 4.5),
                "date": gdp_data.get("date", "2025-Q3"),
                "trend": gdp_data.get("trend", "stable"),
            },
        },
        "us": {
            "inflation": {
                "yearly": 2.4,
                "monthly": 0.5,
                "date": "2026-03-01",
            },
            "fed_rate": {
                "value": 4.5,
                "date": "2025-12-18",
                "trend": "down",
            },
            "unemployment": {
                "value": 4.2,
                "date": "2025-12-01",
                "trend": "stable",
            },
        },
        "generated_at": datetime.now().isoformat(),
    }


def _refresh_macro_indicators_cache() -> None:
    global _macro_indicators_cache, _macro_indicators_cached_at, _macro_indicators_refreshing
    if _macro_indicators_refreshing:
        return
    _macro_indicators_refreshing = True
    try:
        _macro_indicators_cache = _build_macro_indicators_payload()
        _macro_indicators_cached_at = datetime.now()
    except Exception as e:
        print(f"[API] Macro indicators error: {e}")
    finally:
        _macro_indicators_refreshing = False


def _start_macro_indicators_refresh() -> None:
    if _macro_indicators_refreshing:
        return
    thread = threading.Thread(target=_refresh_macro_indicators_cache, daemon=True)
    thread.start()

@router.get("/analysis/commodities")
def get_commodities_analysis():
    """
    Get comprehensive commodities analysis.
    """
    try:
        # Gerçek veri kaynağı burada
        return {"all": []}
    except Exception as e:
        return {"error": str(e)}

@router.get("/analysis/funds")
def get_funds_analysis():
    """
    Get Turkish investment funds analysis.
    """
    try:
        # Gerçek veri kaynağı burada
        return {"all": []}
    except Exception as e:
        return {"error": str(e)}

@router.get("/ta-signals/{symbol}")
def get_ta_signals(symbol: str):
    """
    Get TradingView TA signals for a symbol.
    """
    try:
        # Gerçek veri kaynağı burada
        return {"signals": []}
    except Exception as e:
        return {"error": str(e)}
"""
Complete Market Data API - All borsapy Features

Endpoints for:
- Stocks (BIST hisseleri)
- Indices (Endeksler)  
- FX & Commodities (Döviz ve Emtia)
- Crypto (Kripto)
- Funds (Yatırım Fonları)
- Inflation (Enflasyon)
- VIOP (Vadeli İşlem ve Opsiyon)
- Bonds (Tahvil/Bono)
- Economic Calendar (Ekonomik Takvim)
- Screener (Hisse Tarama)
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import ClassVar
from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import borsapy as bp

from engine.data.market_fetch import market_fetcher

router: ClassVar[APIRouter] = APIRouter()


# ==========================================
# Helper Functions
# ==========================================

def df_to_records(df: pd.DataFrame) -> List[dict]:
    """Convert DataFrame to list of dicts for JSON serialization."""
    if df is None or df.empty:
        return []
    
    # Reset index if it's a DatetimeIndex
    if isinstance(df.index, pd.DatetimeIndex):
        df = df.reset_index()
    
    # Convert to records
    records = df.to_dict(orient="records")
    
    # Convert any remaining datetime/Timestamp objects
    for record in records:
        for key, value in record.items():
            if isinstance(value, (pd.Timestamp, datetime)):
                record[key] = str(value)
            elif pd.isna(value):
                record[key] = None
    
    return records


def safe_dict(data: Any) -> Any:
    """Recursively make data JSON serializable, handling DataFrames, Timestamps, etc."""
    if data is None:
        return None
    
    if isinstance(data, (pd.Timestamp, datetime)):
        return str(data)
    
    if isinstance(data, pd.DataFrame):
        return df_to_records(data)
    
    if isinstance(data, pd.Series):
        return safe_dict(data.to_dict())
    
    if isinstance(data, dict):
        return {str(k): safe_dict(v) for k, v in data.items() if not str(k).startswith('_')}
    
    if isinstance(data, (list, tuple, set)):
        return [safe_dict(i) for i in data]
    
    if isinstance(data, float):
        if pd.isna(data) or data != data:
            return 0
        return data
        
    if isinstance(data, (int, str, bool)):
        return data
        
    # Attempt to convert other objects to string or dict if safe
    try:
        # Avoid serializing complex library objects
        module = getattr(data, '__module__', '')
        if any(x in module for x in ['borsapy', 'pandas', 'numpy', 'requests', 'httpx', 'ssl']):
            return str(data)
        return str(data)
    except:
        return None


def safe_float(val: Any) -> Optional[float]:
    """Safely convert any value to float, handling Turkish and English locale number strings."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if not isinstance(val, str):
        try:
            return float(val)
        except:
            return None
            
    try:
        # If both . and , exist, it's a formatted string. 
        # In Turkish: 1.234,56 -> remove . then replace , with .
        # In English: 1,234.56 -> remove , then keep .
        if "." in val and "," in val:
            if val.find(".") < val.find(","): # Turkish
                val = val.replace(".", "").replace(",", ".")
            else: # English
                val = val.replace(",", "")
        elif "," in val:
            # Only comma: probably Turkish decimal (3,14) or English separator (3,140)
            # We assume it's decimal if it's near the end and only one.
            if val.count(",") == 1:
                val = val.replace(",", ".")
            else:
                val = val.replace(",", "")
        
        return float(val)
    except (ValueError, TypeError):
        return None


# ==========================================
# STOCK ENDPOINTS (Hisse Senedi)
# ==========================================

@router.get("/quote/{symbol}")
def get_stock_quote(symbol: str):
    """Get current stock quote with fast info."""
    fast_info = market_fetcher.get_stock_fast_info(symbol)
    
    if not fast_info:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")
    
    return safe_dict(fast_info)


@router.get("/history/{symbol}")
def get_stock_history(
    symbol: str,
    period: str = Query("1y", pattern="^(1g|5g|1ay|3ay|6ay|1y|2y|5y|max)$"),
    interval: str = Query("1d", pattern="^(1m|3m|5m|15m|30m|45m|1h|1d)$")
):
    """Get historical OHLCV data for a stock."""
    df = market_fetcher.get_stock_data(symbol, period=period, interval=interval)
    
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{symbol}'")
    
    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "count": len(df),
        "data": df_to_records(df)
    }


@router.get("/info/{symbol}")
def get_stock_info(symbol: str):
    """Get detailed stock information."""
    info = market_fetcher.get_stock_info(symbol)
    
    if not info:
        raise HTTPException(status_code=404, detail=f"Info not found for '{symbol}'")
    
    return safe_dict(info)


@router.get("/financials/{symbol}")
def get_stock_financials(symbol: str):
    """Get all financial statements for a stock."""
    financials = market_fetcher.get_financials(symbol)
    
    result = {}
    for key, df in financials.items():
        result[key] = df_to_records(df) if df is not None else None
    
    return result


@router.get("/dividends/{symbol}")
def get_stock_dividends(symbol: str):
    """Get dividend history for a stock."""
    df = market_fetcher.get_dividends(symbol)
    return {"symbol": symbol, "dividends": df_to_records(df)}


@router.get("/splits/{symbol}")
def get_stock_splits(symbol: str):
    """Get stock split history."""
    df = market_fetcher.get_splits(symbol)
    return {"symbol": symbol, "splits": df_to_records(df)}


@router.get("/holders/{symbol}")
def get_major_holders(symbol: str):
    """Get major shareholders."""
    df = market_fetcher.get_major_holders(symbol)
    return {"symbol": symbol, "holders": df_to_records(df)}


@router.get("/analyst/{symbol}")
def get_analyst_data(symbol: str):
    """Get analyst recommendations and price targets."""
    data = market_fetcher.get_analyst_data(symbol)
    return safe_dict(data)


@router.get("/news/{symbol}")
def get_stock_news(symbol: str):
    """Get KAP announcements for a stock."""
    df = market_fetcher.get_news(symbol)
    return {"symbol": symbol, "news": df_to_records(df)}


@router.get("/calendar/{symbol}")
def get_stock_calendar(symbol: str):
    """Get upcoming events for a stock."""
    df = market_fetcher.get_calendar(symbol)
    return {"symbol": symbol, "events": df_to_records(df)}


@router.get("/download")
def download_multiple_stocks(
    symbols: str = Query(..., description="Comma-separated symbols"),
    period: str = Query("1ay")
):
    """Download data for multiple stocks at once."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    df = market_fetcher.download_multiple(symbol_list, period=period)
    
    if df is None or df.empty:
        return {"symbols": symbol_list, "data": []}
    
    return {
        "symbols": symbol_list,
        "period": period,
        "data": df_to_records(df)
    }


@router.get("/ta-signals/{symbol}")
def get_ta_signals(symbol: str):
    """Get TradingView technical analysis signals for a stock."""
    data = market_fetcher.get_ta_signals(symbol.upper())
    return safe_dict(data)


@router.get("/etf-holders/{symbol}")
def get_etf_holders(symbol: str):
    """Get foreign ETF holders for a BIST stock."""
    data = market_fetcher.get_etf_holders(symbol.upper())
    return {"symbol": symbol.upper(), "holders": data}


@router.get("/search-symbols")
def search_symbols(query: str):
    """Search for BIST symbols by name or sector."""
    results = market_fetcher.search_symbols(query)
    return {"query": query, "results": results}


@router.get("/heikin-ashi/{symbol}")
def get_heikin_ashi(
    symbol: str, 
    period: str = Query("1mo"), 
    interval: str = Query("1d")
):
    """Get Heikin Ashi candles for a stock."""
    data = market_fetcher.get_heikin_ashi(symbol.upper(), period=period, interval=interval)
    return {"symbol": symbol.upper(), "data": data}


# ==========================================
# INDEX ENDPOINTS (Endeksler)
# ==========================================

@router.get("/indices")
def get_indices_list():
    """Get list of available BIST indices."""
    indices = market_fetcher.get_indices_list()
    return {"indices": indices}


@router.get("/index/{index_symbol}")
def get_index_data(
    index_symbol: str,
    period: str = Query("1ay")
):
    """Get historical data for a BIST index."""
    df = market_fetcher.get_index_data(index_symbol, period=period)
    
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"Index '{index_symbol}' not found")
    
    return {
        "symbol": index_symbol,
        "period": period,
        "data": df_to_records(df)
    }


@router.get("/index/{index_symbol}/constituents")
def get_index_constituents(index_symbol: str):
    """Get constituents of a BIST index with real-time data."""
    constituents = market_fetcher.get_index_constituents(index_symbol)
    
    if not constituents:
        raise HTTPException(status_code=404, detail=f"No constituents found for '{index_symbol}'")
    
    return {
        "symbol": index_symbol,
        "count": len(constituents),
        "constituents": constituents
    }


# ==========================================
# FX & COMMODITY ENDPOINTS (Döviz ve Emtia)
# ==========================================

@router.get("/fx/{currency}/current")
def get_fx_current(currency: str):
    """Get current exchange rate (USD, EUR, GBP, etc.)."""
    data = market_fetcher.get_fx_current(currency)
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Currency '{currency}' not found")
    
    return safe_dict(data)


@router.get("/fx/{currency}/history")
def get_fx_history(currency: str, period: str = Query("1ay")):
    """Get historical exchange rate data."""
    df = market_fetcher.get_fx_history(currency, period=period)
    
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No history for '{currency}'")
    
    return {
        "currency": currency,
        "period": period,
        "data": df_to_records(df)
    }


@router.get("/fx/{currency}/bank-rates")
def get_bank_rates(currency: str):
    """Get exchange rates from all banks."""
    df = market_fetcher.get_bank_rates(currency)
    return {"currency": currency, "rates": df_to_records(df)}


@router.get("/banks")
def get_banks_list():
    """Get list of supported banks."""
    banks = market_fetcher.get_bank_list()
    return {"banks": banks}


@router.get("/gold/{gold_type}/current")
def get_gold_current(gold_type: str):
    """Get current gold price."""
    data = market_fetcher.get_gold_current(gold_type)
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Gold type '{gold_type}' not found")
    
    return safe_dict(data)


@router.get("/gold/{gold_type}/history")
def get_gold_history(gold_type: str, period: str = Query("1ay")):
    """Get historical gold prices."""
    df = market_fetcher.get_gold_history(gold_type, period=period)
    return {"gold_type": gold_type, "period": period, "data": df_to_records(df)}


@router.get("/silver/current")
def get_silver_current():
    """Get current silver price."""
    data = market_fetcher.get_silver_current()
    return safe_dict(data) if data else {}


# ==========================================
# CRYPTO ENDPOINTS (Kripto Para)
# ==========================================

@router.get("/crypto/pairs")
def get_crypto_pairs():
    """Get available crypto trading pairs."""
    pairs = market_fetcher.get_crypto_pairs()
    return {"pairs": pairs}


@router.get("/crypto/{pair}/current")
def get_crypto_current(pair: str):
    """Get current crypto price (e.g., BTCTRY, ETHTRY)."""
    data = market_fetcher.get_crypto_current(pair)
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Crypto pair '{pair}' not found")
    
    return safe_dict(data)


@router.get("/crypto/{pair}/history")
def get_crypto_history(pair: str, period: str = Query("1ay")):
    """Get historical crypto OHLCV data."""
    df = market_fetcher.get_crypto_history(pair, period=period)
    return {"pair": pair, "period": period, "data": df_to_records(df)}


# ==========================================
# FUND ENDPOINTS (Yatırım Fonları)
# ==========================================

@router.get("/funds/search")
def search_funds(query: str):
    """Search for investment funds."""
    df = market_fetcher.search_funds(query)
    return {"query": query, "results": df_to_records(df)}


@router.get("/fund/{code}/info")
def get_fund_info(code: str):
    """Get detailed fund information."""
    info = market_fetcher.get_fund_info(code)
    return safe_dict(info) if info else {}


@router.get("/fund/{code}/history")
def get_fund_history(code: str, period: str = Query("1ay")):
    """Get historical fund prices."""
    df = market_fetcher.get_fund_history(code, period=period)
    return {"code": code, "period": period, "data": df_to_records(df)}


@router.get("/fund/{code}/allocation")
def get_fund_allocation(code: str):
    """Get fund's asset allocation."""
    data = market_fetcher.get_fund_allocation(code)
    return safe_dict(data) if data else {}


@router.get("/fund/{code}/performance")
def get_fund_performance(code: str):
    """Get fund performance metrics."""
    data = market_fetcher.get_fund_performance(code)
    return safe_dict(data) if data else {}


@router.get("/funds/screen")
def screen_funds(
    fund_type: Optional[str] = None,
    min_return_1y: Optional[float] = None,
    min_return_ytd: Optional[float] = None,
    min_return_1m: Optional[float] = None
):
    """Screen funds by performance criteria."""
    df = market_fetcher.screen_funds(
        fund_type=fund_type,
        min_return_1y=min_return_1y,
        min_return_ytd=min_return_ytd,
        min_return_1m=min_return_1m
    )
    return {"results": df_to_records(df)}


@router.get("/funds/compare")
def compare_funds(codes: str = Query(..., description="Comma-separated fund codes (max 10)")):
    """Compare multiple funds."""
    code_list = [c.strip().upper() for c in codes.split(",")][:10]
    result = market_fetcher.compare_funds(code_list)
    return safe_dict(result) if result else {}


# ==========================================
# INFLATION ENDPOINTS (Enflasyon)
# ==========================================

@router.get("/inflation/latest")
def get_inflation_latest():
    """Get latest TUFE (CPI) data."""
    data = market_fetcher.get_inflation_latest()
    return safe_dict(data) if data else {}


@router.get("/inflation/tufe")
def get_tufe_history():
    """Get TUFE (Consumer Price Index) history."""
    df = market_fetcher.get_tufe_history()
    return {"data": df_to_records(df)}


@router.get("/inflation/ufe")
def get_ufe_history():
    """Get UFE (Producer Price Index) history."""
    df = market_fetcher.get_ufe_history()
    return {"data": df_to_records(df)}


@router.get("/inflation/calculate")
def calculate_inflation(
    amount: float = Query(..., description="Initial amount in TL"),
    start_date: str = Query(..., description="Start date (YYYY-MM)"),
    end_date: str = Query(..., description="End date (YYYY-MM)")
):
    """Calculate inflation-adjusted value."""
    result = market_fetcher.calculate_inflation(amount, start_date, end_date)
    return safe_dict(result) if result else {}


# ==========================================
# VIOP ENDPOINTS (Vadeli İşlem ve Opsiyon)
# ==========================================

@router.get("/viop/futures")
def get_viop_futures():
    """Get all futures contracts."""
    df = market_fetcher.get_viop_futures()
    return {"futures": df_to_records(df)}


@router.get("/viop/options")
def get_viop_options():
    """Get all options contracts."""
    df = market_fetcher.get_viop_options()
    return {"options": df_to_records(df)}


@router.get("/viop/symbol/{symbol}")
def get_viop_by_symbol(symbol: str):
    """Get all derivatives for a specific underlying."""
    df = market_fetcher.get_viop_by_symbol(symbol)
    return {"symbol": symbol, "derivatives": df_to_records(df)}


@router.get("/viop/stock-futures")
def get_stock_futures():
    """Get stock futures only."""
    df = market_fetcher.get_stock_futures()
    return {"stock_futures": df_to_records(df)}


@router.get("/viop/index-futures")
def get_index_futures():
    """Get index futures only."""
    df = market_fetcher.get_index_futures()
    return {"index_futures": df_to_records(df)}


@router.get("/viop/currency-futures")
def get_currency_futures():
    """Get currency futures only."""
    df = market_fetcher.get_currency_futures()
    return {"currency_futures": df_to_records(df)}


# ==========================================
# BOND ENDPOINTS (Tahvil/Bono)
# ==========================================

@router.get("/bonds")
def get_all_bonds():
    """Get all government bond yields."""
    df = market_fetcher.get_all_bonds()
    return {"bonds": df_to_records(df)}


@router.get("/bond/{maturity}")
def get_bond_info(maturity: str):
    """Get specific bond yield info (2Y, 5Y, 10Y)."""
    data = market_fetcher.get_bond_info(maturity)
    return safe_dict(data) if data else {}


@router.get("/risk-free-rate")
def get_risk_free_rate():
    """Get 10Y bond yield as risk-free rate."""
    rate = market_fetcher.get_risk_free_rate()
    return {"rate": rate, "maturity": "10Y"}


# ==========================================
# ECONOMIC CALENDAR ENDPOINTS
# ==========================================

@router.get("/calendar/events")
def get_economic_events(
    period: str = Query("1w"),
    country: Optional[str] = Query(None, pattern="^(TR|US|EU|DE|GB|JP|CN)$"),
    importance: Optional[str] = Query(None, pattern="^(high|medium|low)$")
):
    """Get economic calendar events."""
    df = market_fetcher.get_economic_events(
        period=period,
        country=country,
        importance=importance
    )
    return {"period": period, "events": df_to_records(df)}


@router.get("/calendar/today")
def get_today_events():
    """Get today's economic events."""
    df = market_fetcher.get_today_events()
    return {"date": str(datetime.now().date()), "events": df_to_records(df)}


@router.get("/calendar/this-week")
def get_this_week_events():
    """Get this week's economic events."""
    df = market_fetcher.get_this_week_events()
    return {"events": df_to_records(df)}


# ==========================================
# SCREENER ENDPOINTS (Hisse Tarama)
# ==========================================

@router.get("/screener/stocks")
def screen_stocks(
    template: Optional[str] = None,
    sector: Optional[str] = None,
    index: Optional[str] = None,
    group: str = Query("getiri", description="getiri, degerleme, karlilik, borcluluk, buyume, bilanco"),
):
    """
    Screen BIST stocks with dynamic criteria groups.
    Uses borsapy screen_stocks() to get ALL stocks.
    For real-time change data, we need to use cached data or limited fetch.
    """
    try:
        # Get all stock symbols and basic price from screen_stocks
        df = bp.screen_stocks()
        
        if df is None or df.empty:
            return {"results": [], "count": 0}
        
        print(f"[Screener] Got {len(df)} stocks from borsapy")
        
        # Convert to list of dicts with basic data
        stocks = []
        for _, row in df.iterrows():
            symbol = str(row.get("symbol", ""))
            name = str(row.get("name", symbol))
            price = float(row.get("criteria_7", 0) or 0)
            
            stocks.append({
                "symbol": symbol,
                "name": name,
                "last": price,
                "change_percent": 0,  # Will be filled by cache or separate call
                "volume": 0,
            })
        
        # Sort alphabetically by symbol
        stocks.sort(key=lambda x: x.get("symbol", ""))
        
        print(f"[Screener] Returning {len(stocks)} stocks")
        return {"results": stocks, "count": len(stocks)}
        
    except Exception as e:
        print(f"[API] Screen stocks error: {e}")
        import traceback
        traceback.print_exc()
        return {"results": [], "error": str(e)}


@router.get("/screener/filters")
def get_screener_filters():
    """Get available screener filter categories."""
    return market_fetcher.get_screener_filters()


@router.get("/screener/technical")
def technical_scan(
    index: str = Query("BIST 100"),
    condition: str = Query(..., description="Condition string like 'rsi < 30'")
):
    """
    Perform a technical scan on BIST stocks.
    
    NEW in borsapy 0.7.2: Uses bp.scan() function for more powerful scanning.
    
    Examples:
    - "rsi < 30" (oversold)
    - "price > sma_50" (above 50-day SMA)  
    - "rsi < 30 and volume > 1000000" (compound)
    - "sma_20 crosses_above sma_50" (golden cross)
    - "supertrend_direction == 1" (bullish supertrend)
    """
    try:
        # Try new borsapy 0.7.2 scan() function first
        try:
            import borsapy as bp
            df = bp.scan(index, condition)
            if df is not None and not df.empty:
                return {"results": df_to_records(df), "count": len(df), "method": "scan"}
        except Exception as scan_err:
            print(f"[API] bp.scan error: {scan_err}")
        
        # Fallback to TechnicalScanner
        from borsapy import TechnicalScanner
        scanner = TechnicalScanner()
        scanner.set_universe(index)
        scanner.add_condition(condition)
        results = scanner.run()
        return {"results": results, "count": len(results), "method": "TechnicalScanner"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Technical scan error: {str(e)}")


# ==========================================
# COMPANY LIST
# ==========================================

@router.get("/companies")
def get_company_list():
    """Get list of all BIST companies."""
    df = market_fetcher.get_company_list()
    return {"companies": df_to_records(df)}


# ==========================================
# ASSET DETAIL ENDPOINT (Bundled)
# ==========================================

@router.get("/asset/{symbol}")
def get_asset_details(
    symbol: str,
    period: str = Query("3mo", pattern="^(1g|5g|1ay|3ay|6ay|1y|2y|5y|max|1d|5d|1mo|3mo|6mo|1y|2y|5y|max)$"),
    market: str | None = Query(None),
    currency: str | None = Query(None),
):
    """Get comprehensive details for any investment asset (Stock, FX, Crypto, etc.)."""
    data = market_fetcher.get_asset_details(symbol.upper(), period=period, market_hint=market, currency_hint=currency)
    # The MarketFetcher already sanitizes the data, but we use safe_dict for extra safety
    return safe_dict(data)


@router.get("/batch-changes")
def get_batch_changes(
    symbols: str = Query(..., description="Comma-separated symbols"),
    period: str = Query("1d", pattern="^(1d|1w|1m|ytd|1y|5y)$")
):
    """Get change percentages for multiple symbols for a specific period."""
    symbol_list = [s.strip() for s in symbols.split(",")]
    if not symbol_list:
        return {"results": []}
    
    results = market_fetcher.get_batch_changes(symbol_list, period)
    return {"results": results, "period": period}


@router.get("/batch-quotes")
def get_batch_quotes(
    symbols: str = Query(..., description="Comma-separated symbols")
):
    """Get current prices and daily changes for multiple symbols."""
    symbol_list = []
    for raw_symbol in symbols.split(","):
        clean_symbol = raw_symbol.strip()
        if not clean_symbol:
            continue
        if clean_symbol.lower() in {"null", "undefined", "none", "nan"}:
            continue
        symbol_list.append(clean_symbol)
    if not symbol_list:
        return {"results": []}

    try:
        results = market_fetcher.get_batch_quotes(symbol_list)
    except Exception as exc:
        logger.exception("[BatchQuotesAPI] Failed", extra={"symbols": symbol_list, "error": str(exc)})
        return {"results": []}
    return {"results": results}


# ==========================================
# DASHBOARD (Combined Data)
# ==========================================

@router.get("/dashboard")
def get_dashboard_data():
    """Get dashboard overview with cached market data."""
    return market_fetcher.get_dashboard_data()


# ==========================================
# COMPANY FINANCIALS (Şirket Finansal Analizi)
# ==========================================

from engine.data.company_financials import CompanyFinancials, get_company_financials

@router.get("/company/{symbol}/financials")
def get_company_financial_analysis(symbol: str):
    """
    Get comprehensive financial analysis for a BIST company.
    Includes: profile, income metrics, balance sheet metrics, ratios, multiples, and score.
    """
    try:
        data = get_company_financials(symbol.upper())
        return safe_dict(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Financial analysis error: {str(e)}")


@router.get("/company/{symbol}/profile")
def get_company_profile(symbol: str):
    """Get company profile and basic info."""
    try:
        cf = CompanyFinancials(symbol.upper())
        return safe_dict(cf.get_company_profile())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile error: {str(e)}")


@router.get("/company/{symbol}/ratios")
def get_company_ratios(symbol: str):
    """Get financial ratios (liquidity, profitability, leverage)."""
    try:
        cf = CompanyFinancials(symbol.upper())
        metrics = cf.get_key_metrics()
        return safe_dict({
            "symbol": symbol.upper(),
            "ratios": metrics.get("ratios", {}),
            "multiples": metrics.get("multiples", {})
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ratios error: {str(e)}")


@router.get("/company/{symbol}/quarterly")
def get_company_quarterly(symbol: str):
    """Get quarterly financial data for charts."""
    try:
        cf = CompanyFinancials(symbol.upper())
        return safe_dict(cf.get_quarterly_summary())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quarterly data error: {str(e)}")


@router.get("/company/{symbol}/score")
def get_company_score(symbol: str):
    """Get company score card (0-100 rating)."""
    try:
        cf = CompanyFinancials(symbol.upper())
        return safe_dict(cf.get_score_card())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Score error: {str(e)}")


@router.get("/company/{symbol}/shareholders")
def get_company_shareholders(symbol: str):
    """Get company shareholder structure."""
    try:
        cf = CompanyFinancials(symbol.upper())
        return {"shareholders": safe_dict(cf.get_shareholders())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shareholders error: {str(e)}")


@router.get("/company/{symbol}/subsidiaries")
def get_company_subsidiaries(symbol: str):
    """Get company subsidiaries and affiliates."""
    try:
        cf = CompanyFinancials(symbol.upper())
        return {"subsidiaries": safe_dict(cf.get_subsidiaries())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subsidiaries error: {str(e)}")


@router.post("/company/{symbol}/refresh")
async def refresh_company_data(symbol: str, background_tasks: BackgroundTasks):
    """Trigger ETL process to refresh company data from KAP."""
    try:
        # Lazy import to avoid startup errors if dependencies are missing
        from engine.data.kap_etl import run_kap_etl
        background_tasks.add_task(run_kap_etl, symbol.upper())
        return {"status": "accepted", "message": f"ETL process started for {symbol}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ETL trigger error: {str(e)}")


# ==========================================
# MARKET ANALYSIS ENDPOINTS (Piyasa Analizi)
# ==========================================

@router.get("/analysis/bist-stocks")
def get_bist_stocks_analysis():
    """
    Get comprehensive BIST stocks analysis with top gainers/losers.
    This fetches ALL BIST stocks, not just the first-glance dashboard data.
    """
    data = market_fetcher.get_all_bist_stocks()
    return safe_dict(data)


@router.get("/analysis/us-stocks")
def get_us_stocks_analysis():
    """
    Get US stocks analysis with top gainers/losers.
    Focuses on major S&P 500 and tech stocks.
    """
    data = market_fetcher.get_all_us_stocks()
    return safe_dict(data)


@router.get("/analysis/commodities")
def get_commodities_analysis():
    """
    Get comprehensive commodities analysis.
    Includes gold, silver, oil, gas, agricultural commodities.
    """
    data = market_fetcher.get_all_commodities_analysis()
    return safe_dict(data)


@router.get("/analysis/crypto")
def get_crypto_analysis():
    """
    Get comprehensive crypto analysis.
    Includes both TRY pairs (BtcTurk) and USD pairs (yfinance).
    """
    data = market_fetcher.get_all_crypto_analysis()
    return safe_dict(data)


@router.get("/analysis/funds")
def get_funds_analysis():
    """
    Get Turkish investment funds analysis.
    Uses borsapy Fund module.
    """
    data = market_fetcher.get_turkish_funds()
    return safe_dict(data)


@router.get("/outcomes/{market}")
def get_market_outcomes(
    market: str,
    horizon_days: int = Query(1, ge=1, le=730),
    top_n: int = Query(20, ge=5, le=100),
):
    normalized_market = str(market or "").lower().strip()
    if normalized_market == "bist":
        from storage.proprietary_outcomes import build_bist_outcome_report

        return build_bist_outcome_report(horizon_days=horizon_days, top_n=top_n)
    if normalized_market not in {"us", "crypto", "commodities", "funds"}:
        raise HTTPException(status_code=404, detail="Unsupported market")
    return safe_dict(build_market_outcome_report(market=normalized_market, horizon_days=horizon_days, top_n=top_n))


@router.get("/funds/summary")
def get_funds_summary():
    """
    Get quick summary of popular Turkish funds for dashboard.
    """
    data = market_fetcher.get_funds_summary()
    return safe_dict({"funds": data})


# ==========================================
# Economic Calendar & Inflation
# ==========================================

@router.get("/economic-calendar")
def get_economic_calendar(
    period: str = Query("today", description="today, week, month"),
    importance: str = Query("all", description="all, high")
):
    """
    Get economic calendar events.
    Uses borsapy EconomicCalendar module.
    """
    try:
        from borsapy import EconomicCalendar
        ec = EconomicCalendar()
        
        if period == "today":
            df = ec.today()
        elif period == "week":
            df = ec.this_week()
        elif period == "month":
            df = ec.this_month()
        else:
            df = ec.today()
        
        if importance == "high":
            df = ec.high_importance()
        
        if df is None or df.empty:
            return {"events": [], "count": 0}
        
        # Fix Turkish characters
        df = df.fillna("")
        records = df.to_dict(orient="records")
        
        # Clean up records
        events = []
        for record in records:
            event = {
                "date": str(record.get("Date", "")),
                "time": str(record.get("Time", "")),
                "country": str(record.get("Country", "")).encode('latin-1', errors='ignore').decode('utf-8', errors='ignore'),
                "importance": str(record.get("Importance", "low")),
                "event": str(record.get("Event", "")).encode('latin-1', errors='ignore').decode('utf-8', errors='ignore'),
                "actual": str(record.get("Actual", "")) if record.get("Actual") else None,
                "forecast": str(record.get("Forecast", "")) if record.get("Forecast") else None,
                "previous": str(record.get("Previous", "")) if record.get("Previous") else None,
                "period": str(record.get("Period", "")).encode('latin-1', errors='ignore').decode('utf-8', errors='ignore')
            }
            events.append(event)
        
        return {"events": events, "count": len(events)}
    except Exception as e:
        print(f"[API] Economic calendar error: {e}")
        return {"events": [], "count": 0, "error": str(e)}


@router.get("/inflation")
def get_inflation(
    months: int = Query(6, description="Number of months to return")
):
    """
    Get Turkish inflation data (TUFE & UFE) and hardcoded US data.
    """
    try:
        from borsapy import Inflation
        inf = Inflation()
        
        # Get TUFE
        df_tufe = inf.tufe()
        latest_tufe = inf.latest()
        
        # Get UFE
        df_ufe = inf.ufe()
        
        # Prepare TUFE records
        tufe_records = []
        if df_tufe is not None and not df_tufe.empty:
            df_tufe = df_tufe.head(months).reset_index()
            for _, row in df_tufe.iterrows():
                tufe_records.append({
                    "date": str(row.get("Date", "")),
                    "year_month": str(row.get("YearMonth", "")),
                    "yearly": float(row.get("YearlyInflation", 0)),
                    "monthly": float(row.get("MonthlyInflation", 0))
                })
        
        # Prepare UFE records
        ufe_records = []
        latest_ufe = None
        if df_ufe is not None and not df_ufe.empty:
            latest_ufe_row = df_ufe.iloc[0]
            latest_ufe = {
                "date": str(df_ufe.index[0]),
                "yearly": float(latest_ufe_row.get("YearlyInflation", 0)),
                "monthly": float(latest_ufe_row.get("MonthlyInflation", 0))
            }
            df_ufe = df_ufe.head(months).reset_index()
            for _, row in df_ufe.iterrows():
                ufe_records.append({
                    "date": str(row.get("Date", "")),
                    "year_month": str(row.get("YearMonth", "")),
                    "yearly": float(row.get("YearlyInflation", 0)),
                    "monthly": float(row.get("MonthlyInflation", 0))
                })

        # US Inflation (Hardcoded for now as it's not in borsapy directly in a simple module)
        # Based on search: Nov 2025: 2.7%, Dec 2025 estimate: 2.7%
        us_inflation = {
            "yearly": 2.7,
            "monthly": 0.2,
            "date": "2025-11-01",
            "next_update": "2026-01-13"
        }
        
        return {
            "tufe": {
                "history": tufe_records,
                "latest": {
                    "date": str(latest_tufe.get("date", "")),
                    "yearly": float(latest_tufe.get("yearly_inflation", 0)),
                    "monthly": float(latest_tufe.get("monthly_inflation", 0))
                }
            },
            "ufe": {
                "history": ufe_records,
                "latest": latest_ufe
            },
            "us_cpi": us_inflation
        }
    except Exception as e:
        print(f"[API] Inflation error: {e}")
        return {"error": str(e)}

@router.get("/macro-indicators-legacy")
def get_macro_indicators():
    """
    Get comprehensive economic indicators for TR and US.
    """
    try:
        from borsapy import Inflation, TCMB
        from engine.data.tuik_api import get_macro_indicators as get_tuik_data
        
        inf = Inflation()
        latest_tufe = inf.latest()
        
        # Get TCMB policy rate dynamically.
        # borsapy currently returns 7.0 for `TCMB().policy_rate`, which is stale/incorrect for March 2026.
        # We treat implausibly low values as invalid and fall back to the last manually verified
        # one-week repo rate from TCMB's March 12, 2026 decision.
        try:
            tcmb = TCMB()
            policy_rate = float(getattr(tcmb, "policy_rate", 0) or 0)
            if policy_rate < 10:
                raise ValueError(f"implausible policy rate from borsapy: {policy_rate}")
        except Exception as e:
            print(f"[API] TCMB policy rate error: {e}")
            policy_rate = 37.0  # Last verified against TCMB policy decision on 2026-03-12
        
        # Get TÜİK data (unemployment, GDP)
        tuik_data = get_tuik_data()
        unemployment_data = tuik_data.get("unemployment", {})
        gdp_data = tuik_data.get("gdp", {})
        
        data = {
            "tr": {
                "inflation": {
                    "yearly": float(latest_tufe.get("yearly_inflation", 0)),
                    "monthly": float(latest_tufe.get("monthly_inflation", 0)),
                    "date": str(latest_tufe.get("date", ""))
                },
                "policy_rate": {
                    "value": float(policy_rate),
                    "date": "2026-03-12",
                    "trend": "stable"
                },
                "unemployment": {
                    "value": unemployment_data.get("value", 8.6),
                    "date": unemployment_data.get("date", "2025-11-01"),
                    "trend": unemployment_data.get("trend", "stable")
                },
                "gdp_growth": {
                    "value": gdp_data.get("value", 4.5),
                    "date": gdp_data.get("date", "2025-Q3"),
                    "trend": gdp_data.get("trend", "stable")
                }
            },
            "us": {
                "inflation": {
                    "yearly": 2.4,
                    "monthly": 0.5,
                    "date": "2026-03-01"
                },
                "fed_rate": {
                    "value": 4.5,
                    "date": "2025-12-18",
                    "trend": "down"
                },
                "unemployment": {
                    "value": 4.2,
                    "date": "2025-12-01",
                    "trend": "stable"
                }
            }
        }
        return data
    except Exception as e:
        print(f"[API] Macro indicators error: {e}")
        return {"error": str(e)}


@router.get("/macro-indicators")
def get_macro_indicators_cached():
    """
    Get comprehensive economic indicators for TR and US.
    Returns cached data immediately when available and refreshes in background.
    """
    try:
        global _macro_indicators_cache, _macro_indicators_cached_at
        now = datetime.now()
        cache_fresh = (
            _macro_indicators_cache is not None
            and _macro_indicators_cached_at is not None
            and _macro_indicators_cached_at >= (now - timedelta(hours=6))
        )

        if cache_fresh:
            return {
                **_macro_indicators_cache,
                "from_cache": True,
                "scan_in_progress": _macro_indicators_refreshing,
            }

        if _macro_indicators_cache is not None:
            _start_macro_indicators_refresh()
            return {
                **_macro_indicators_cache,
                "from_cache": True,
                "scan_in_progress": True,
            }

        _start_macro_indicators_refresh()
        return {
            **_default_macro_indicators_payload(),
            "from_cache": False,
            "scan_in_progress": True,
            "using_fallback": True,
        }
    except Exception as e:
        print(f"[API] Macro indicators cached error: {e}")
        return {
            **_default_macro_indicators_payload(),
            "error": str(e),
            "from_cache": False,
            "scan_in_progress": False,
            "using_fallback": True,
        }
