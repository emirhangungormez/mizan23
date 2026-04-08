"""
Pydantic Data Validation Schemas for Trade Intelligence

Features:
- Type validation for all data structures
- Automatic data cleaning and normalization
- Optional field handling
- Custom validators for financial data
- Serialization/deserialization support
"""

from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date
from enum import Enum
import pandas as pd
import numpy as np


# === Enums ===

class AssetType(str, Enum):
    STOCK = "stock"
    INDEX = "index"
    FX = "fx"
    CRYPTO = "crypto"
    FUND = "fund"
    COMMODITY = "commodity"
    BOND = "bond"


class TimeInterval(str, Enum):
    MINUTE_1 = "1m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"
    DAY_1 = "1d"
    WEEK_1 = "1w"
    MONTH_1 = "1mo"


class Period(str, Enum):
    DAY_1 = "1d"
    DAY_5 = "5d"
    MONTH_1 = "1mo"
    MONTH_3 = "3mo"
    MONTH_6 = "6mo"
    YEAR_1 = "1y"
    YEAR_2 = "2y"
    YEAR_5 = "5y"
    MAX = "max"


# === Base Models ===

class BaseSchema(BaseModel):
    """Base schema with common config"""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        validate_assignment=True,
    )


# === Market Data Schemas ===

class MarketQuote(BaseSchema):
    """Real-time stock quote data"""
    symbol: str
    name: Optional[str] = None
    last: float = Field(..., ge=0, description="Last price")
    change: Optional[float] = Field(default=0.0, description="Price change")
    change_percent: Optional[float] = Field(default=0.0, description="Percent change")
    volume: Optional[int] = Field(default=0, ge=0)
    bid: Optional[float] = Field(default=None, ge=0)
    ask: Optional[float] = Field(default=None, ge=0)
    high: Optional[float] = Field(default=None, ge=0)
    low: Optional[float] = Field(default=None, ge=0)
    open: Optional[float] = Field(default=None, ge=0)
    previous_close: Optional[float] = Field(default=None, ge=0)
    market_cap: Optional[float] = Field(default=None, ge=0)
    timestamp: Optional[datetime] = None
    
    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        return v.upper().strip()
    
    @field_validator('last', 'change', 'change_percent', 'volume', mode='before')
    @classmethod
    def clean_numeric(cls, v):
        if v is None:
            return 0
        if isinstance(v, str):
            v = v.replace(',', '').replace('%', '').strip()
            if not v:
                return 0
        try:
            result = float(v)
            if np.isnan(result) or np.isinf(result):
                return 0
            return result
        except (ValueError, TypeError):
            return 0


class OHLCVData(BaseSchema):
    """Single OHLCV candle data point"""
    date: Union[datetime, date, str]
    open: float = Field(..., ge=0)
    high: float = Field(..., ge=0)
    low: float = Field(..., ge=0)
    close: float = Field(..., ge=0)
    volume: int = Field(default=0, ge=0)
    
    @field_validator('date', mode='before')
    @classmethod
    def parse_date(cls, v):
        if isinstance(v, (datetime, date)):
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except:
                return datetime.strptime(v[:10], '%Y-%m-%d')
        return v
    
    @model_validator(mode='after')
    def validate_ohlc_logic(self):
        """Ensure OHLC values are logically consistent"""
        if self.high < self.low:
            # Swap if needed
            self.high, self.low = self.low, self.high
        if self.open > self.high:
            self.high = self.open
        if self.open < self.low:
            self.low = self.open
        if self.close > self.high:
            self.high = self.close
        if self.close < self.low:
            self.low = self.close
        return self


class OHLCVSeries(BaseSchema):
    """Collection of OHLCV data"""
    symbol: str
    period: str
    interval: str
    data: List[OHLCVData]
    count: int = 0
    
    @model_validator(mode='after')
    def set_count(self):
        self.count = len(self.data)
        return self


class StockInfo(BaseSchema):
    """Detailed stock information"""
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[float] = Field(default=None, ge=0)
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    dividend_yield: Optional[float] = Field(default=None, ge=0)
    eps: Optional[float] = None
    beta: Optional[float] = None
    fifty_two_week_high: Optional[float] = Field(default=None, ge=0)
    fifty_two_week_low: Optional[float] = Field(default=None, ge=0)
    average_volume: Optional[int] = Field(default=None, ge=0)
    shares_outstanding: Optional[int] = Field(default=None, ge=0)
    free_float: Optional[float] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None
    website: Optional[str] = None
    employees: Optional[int] = Field(default=None, ge=0)
    last_updated: Optional[datetime] = None
    
    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        return v.upper().strip()


class FinancialStatement(BaseSchema):
    """Financial statement data"""
    symbol: str
    period: str  # e.g., "2023-Q4", "2023-12"
    statement_type: str  # "income", "balance", "cash_flow"
    
    # Income Statement
    revenue: Optional[float] = None
    gross_profit: Optional[float] = None
    operating_income: Optional[float] = None
    net_income: Optional[float] = None
    ebitda: Optional[float] = None
    
    # Balance Sheet
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    total_equity: Optional[float] = None
    cash_and_equivalents: Optional[float] = None
    total_debt: Optional[float] = None
    
    # Cash Flow
    operating_cash_flow: Optional[float] = None
    investing_cash_flow: Optional[float] = None
    financing_cash_flow: Optional[float] = None
    free_cash_flow: Optional[float] = None
    
    # Ratios (calculated)
    profit_margin: Optional[float] = None
    return_on_equity: Optional[float] = None
    return_on_assets: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None


# === Portfolio Schemas ===

class PortfolioAsset(BaseSchema):
    """Single asset in portfolio"""
    symbol: str
    asset_type: AssetType = AssetType.STOCK
    quantity: float = Field(..., gt=0)
    avg_price: float = Field(..., ge=0)
    current_price: Optional[float] = Field(default=None, ge=0)
    weight: Optional[float] = Field(default=None, ge=0, le=100)
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    
    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        return v.upper().strip()
    
    @model_validator(mode='after')
    def calculate_pnl(self):
        if self.current_price is not None and self.avg_price > 0:
            self.pnl = (self.current_price - self.avg_price) * self.quantity
            self.pnl_percent = ((self.current_price - self.avg_price) / self.avg_price) * 100
        return self


class PortfolioData(BaseSchema):
    """Complete portfolio data"""
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    assets: List[PortfolioAsset] = []
    total_value: Optional[float] = Field(default=None, ge=0)
    total_pnl: Optional[float] = None
    total_pnl_percent: Optional[float] = None
    
    @model_validator(mode='after')
    def calculate_totals(self):
        if self.assets:
            total_cost = sum(a.avg_price * a.quantity for a in self.assets)
            if self.total_value is None:
                self.total_value = sum(
                    (a.current_price or a.avg_price) * a.quantity 
                    for a in self.assets
                )
            if total_cost > 0:
                self.total_pnl = self.total_value - total_cost
                self.total_pnl_percent = (self.total_pnl / total_cost) * 100
        return self


# === Fund Schemas ===

class FundData(BaseSchema):
    """Investment fund data"""
    symbol: str
    name: Optional[str] = None
    fund_type: Optional[str] = None
    last: float = Field(..., ge=0)
    change_percent: float = Field(default=0.0)
    return_1m: Optional[float] = None
    return_3m: Optional[float] = None
    return_6m: Optional[float] = None
    return_ytd: Optional[float] = None
    return_1y: Optional[float] = None
    aum: Optional[float] = Field(default=None, ge=0, description="Assets Under Management")
    expense_ratio: Optional[float] = Field(default=None, ge=0)
    
    @field_validator('change_percent', 'return_1m', 'return_3m', 'return_6m', 'return_ytd', 'return_1y', mode='before')
    @classmethod
    def clean_percentage(cls, v):
        if v is None:
            return None
        try:
            result = float(v)
            if np.isnan(result) or np.isinf(result):
                return None
            return result
        except:
            return None


# === Analysis Schemas ===

class TechnicalScores(BaseSchema):
    """Technical analysis scores"""
    momentum: float = Field(default=50, ge=0, le=100)
    volatility: float = Field(default=50, ge=0, le=100)
    trend_strength: float = Field(default=50, ge=0, le=100)
    risk_score: float = Field(default=50, ge=0, le=100)
    overall: Optional[float] = Field(default=None, ge=0, le=100)
    
    @model_validator(mode='after')
    def calculate_overall(self):
        if self.overall is None:
            self.overall = (self.momentum + self.trend_strength - self.volatility * 0.5) / 2.5 * 100
            self.overall = max(0, min(100, self.overall))
        return self


class Probabilities(BaseSchema):
    """Directional probabilities"""
    up: float = Field(default=33.33, ge=0, le=100)
    down: float = Field(default=33.33, ge=0, le=100)
    sideways: float = Field(default=33.34, ge=0, le=100)
    
    @model_validator(mode='after')
    def normalize_probabilities(self):
        total = self.up + self.down + self.sideways
        if total > 0 and abs(total - 100) > 0.1:
            self.up = (self.up / total) * 100
            self.down = (self.down / total) * 100
            self.sideways = (self.sideways / total) * 100
        return self


class AnalysisResult(BaseSchema):
    """Complete analysis result for an asset"""
    symbol: str
    timestamp: datetime = Field(default_factory=datetime.now)
    technical_scores: TechnicalScores = Field(default_factory=TechnicalScores)
    probabilities: Probabilities = Field(default_factory=Probabilities)
    support_levels: List[float] = []
    resistance_levels: List[float] = []
    recommendation: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=100)


# === Dashboard Schemas ===

class MarketSummary(BaseSchema):
    """Market summary data"""
    index_name: str
    value: float
    change: float = 0.0
    change_percent: float = 0.0


class DashboardData(BaseSchema):
    """Dashboard aggregated data"""
    timestamp: datetime = Field(default_factory=datetime.now)
    market_summary: List[MarketSummary] = []
    top_gainers: List[MarketQuote] = []
    top_losers: List[MarketQuote] = []
    most_active: List[MarketQuote] = []
    market_breadth: Optional[Dict[str, int]] = None
    sector_performance: Optional[Dict[str, float]] = None


# === Batch Operation Schemas ===

class BatchChangeResult(BaseSchema):
    """Result of batch change calculation"""
    symbol: str
    change_percent: float = 0.0
    source: str = "unknown"
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class BatchOperationResult(BaseSchema):
    """Result of a batch operation"""
    total_requested: int
    successful: int
    failed: int
    results: List[BatchChangeResult] = []
    duration_ms: float = 0.0


# === Validation Functions ===

def validate_ohlcv_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validate and clean an OHLCV DataFrame
    
    Args:
        df: DataFrame with OHLCV data
        
    Returns:
        Cleaned DataFrame
    """
    if df is None or df.empty:
        return pd.DataFrame()
    
    # Ensure required columns exist
    required_cols = ['Open', 'High', 'Low', 'Close']
    col_map = {c.lower(): c for c in df.columns}
    
    for req in required_cols:
        if req.lower() not in col_map:
            if req not in df.columns:
                raise ValueError(f"Missing required column: {req}")
    
    # Standardize column names
    df.columns = [str(c).title() for c in df.columns]
    
    # Remove rows with all NaN values
    df = df.dropna(how='all')
    
    # Fill NaN in volume with 0
    if 'Volume' in df.columns:
        df['Volume'] = df['Volume'].fillna(0).astype(int)
    
    # Forward fill price columns
    for col in ['Open', 'High', 'Low', 'Close']:
        if col in df.columns:
            df[col] = df[col].ffill()
    
    # Remove rows with any remaining NaN in OHLC
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close'])
    
    # Ensure High >= Low
    mask = df['High'] < df['Low']
    if mask.any():
        df.loc[mask, ['High', 'Low']] = df.loc[mask, ['Low', 'High']].values
    
    # Ensure OHLC consistency
    df['High'] = df[['Open', 'High', 'Low', 'Close']].max(axis=1)
    df['Low'] = df[['Open', 'High', 'Low', 'Close']].min(axis=1)
    
    return df


def validate_quote_data(data: Dict[str, Any]) -> MarketQuote:
    """
    Validate and clean quote data
    
    Args:
        data: Raw quote data dict
        
    Returns:
        Validated MarketQuote object
    """
    # Handle various key formats
    normalized = {}
    key_map = {
        'symbol': ['symbol', 'ticker', 'code'],
        'name': ['name', 'shortName', 'longName', 'title'],
        'last': ['last', 'price', 'lastPrice', 'regularMarketPrice', 'close'],
        'change': ['change', 'priceChange', 'regularMarketChange'],
        'change_percent': ['change_percent', 'changePercent', 'percentChange', 'regularMarketChangePercent'],
        'volume': ['volume', 'regularMarketVolume', 'avgVolume'],
        'high': ['high', 'dayHigh', 'regularMarketDayHigh'],
        'low': ['low', 'dayLow', 'regularMarketDayLow'],
        'open': ['open', 'regularMarketOpen'],
    }
    
    for target_key, source_keys in key_map.items():
        for sk in source_keys:
            if sk in data and data[sk] is not None:
                normalized[target_key] = data[sk]
                break
    
    return MarketQuote(**normalized)
