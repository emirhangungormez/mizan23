"""
Portfolio API Endpoints

Portfolio management and analysis endpoints.
Portfolios are stored locally as JSON.
All calculations happen in Python.
"""

from fastapi import APIRouter, HTTPException
from typing import ClassVar
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import os
import math
from datetime import datetime
import uuid

from engine.data.market_fetch import market_fetcher
from scoring.score_engine import ScoreEngine
from storage.portfolio_learning import build_portfolio_learning_payload

router: ClassVar[APIRouter] = APIRouter()

# Storage path
# Point to the same file used by Next.js
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
PORTFOLIOS_FILE = os.path.join(STORAGE_DIR, "portfolios.json")

# Import the new portfolio features from borsapy
try:
    from borsapy.portfolio import Portfolio as BpPortfolio
except ImportError:
    BpPortfolio = None


# Pydantic Models
class Asset(BaseModel):
    symbol: str
    asset_type: str = Field(default="stock", description="stock, fx, crypto, fund")
    quantity: float = Field(default=1.0)
    avg_price: float = Field(default=0.0)
    weight: Optional[float] = None


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    assets: List[Asset] = []


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    assets: Optional[List[Asset]] = None


class Portfolio(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: str
    assets: List[Asset]


class RiskMetrics(BaseModel):
    volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    beta: float
    alpha: float
    var: float


class PerformancePoint(BaseModel):
    date: str
    value: float
    benchmark: Optional[float] = None


class PortfolioAnalysisResponse(BaseModel):
    portfolio_id: str
    portfolio_name: str
    total_value: float
    pnl: float
    pnl_pct: float
    risk_metrics: RiskMetrics
    equity_curve: List[PerformancePoint]
    allocation: List[dict]
    assets: List[dict]
    holding_decisions: List[dict] = []
    alerts: List[dict] = []
    recommendation_memory: dict = {}
    portfolio_report: dict = {}


# Helper functions
def ensure_storage():
    """Ensure storage directory and file exist"""
    os.makedirs(STORAGE_DIR, exist_ok=True)
    if not os.path.exists(PORTFOLIOS_FILE):
        with open(PORTFOLIOS_FILE, "w") as f:
            json.dump([], f)


def load_portfolios() -> List[dict]:
    """Load portfolios from JSON storage"""
    ensure_storage()
    try:
        with open(PORTFOLIOS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def save_portfolios(portfolios: List[dict]):
    """Save portfolios to JSON storage"""
    ensure_storage()
    with open(PORTFOLIOS_FILE, "w") as f:
        json.dump(portfolios, f, indent=2)


def _finite_float(value: float | int | None, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if math.isfinite(numeric) else default


# Endpoints
@router.get("/", response_model=List[Portfolio])
def  list_portfolios():
    """List all portfolios"""
    return load_portfolios()


@router.post("/", response_model=Portfolio)
def  create_portfolio(portfolio: PortfolioCreate):
    """Create a new portfolio"""
    portfolios = load_portfolios()
    
    new_portfolio = {
        "id": str(uuid.uuid4()),
        "name": portfolio.name,
        "created_at": datetime.now().isoformat(),
        "assets": [asset.model_dump() for asset in portfolio.assets]
    }
    
    portfolios.append(new_portfolio)
    save_portfolios(portfolios)
    
    return new_portfolio


@router.get("/{portfolio_id}", response_model=Portfolio)
def  get_portfolio(portfolio_id: str):
    """Get a specific portfolio"""
    portfolios = load_portfolios()
    
    for p in portfolios:
        if p["id"] == portfolio_id:
            return p
    
    raise HTTPException(status_code=404, detail="Portfolio not found")


@router.put("/{portfolio_id}", response_model=Portfolio)
def  update_portfolio(portfolio_id: str, update: PortfolioUpdate):
    """Update a portfolio"""
    portfolios = load_portfolios()
    
    for i, p in enumerate(portfolios):
        if p["id"] == portfolio_id:
            if update.name is not None:
                portfolios[i]["name"] = update.name
            if update.assets is not None:
                portfolios[i]["assets"] = [asset.model_dump() for asset in update.assets]
            
            save_portfolios(portfolios)
            return portfolios[i]
    
    raise HTTPException(status_code=404, detail="Portfolio not found")


@router.delete("/{portfolio_id}")
def  delete_portfolio(portfolio_id: str):
    """Delete a portfolio"""
    portfolios = load_portfolios()
    
    new_portfolios = [p for p in portfolios if p["id"] != portfolio_id]
    
    if len(new_portfolios) == len(portfolios):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    save_portfolios(new_portfolios)
    return {"status": "deleted", "portfolio_id": portfolio_id}


@router.post("/{portfolio_id}/analyze", response_model=PortfolioAnalysisResponse)
def  analyze_portfolio(portfolio_id: str):
    """
    Perform comprehensive analysis on a portfolio using borsapy.Portfolio.
    """
    portfolios = load_portfolios()
    
    portfolio_data = None
    for p in portfolios:
        if p["id"] == portfolio_id:
            portfolio_data = p
            break
    
    if not portfolio_data:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if not BpPortfolio:
        raise HTTPException(status_code=500, detail="Borsapy portfolio module not available")

    try:
        portfolio_assets = portfolio_data.get("assets", [])
        portfolio_transactions = portfolio_data.get("transactions", [])
        symbols = [str(asset.get("symbol") or "").upper() for asset in portfolio_assets if asset.get("symbol")]
        quote_results = market_fetcher.get_batch_quotes(symbols) if symbols else []
        quotes_by_symbol = {
            str(item.get("symbol") or "").upper(): item
            for item in quote_results
            if item and item.get("symbol")
        }
        learning_payload = build_portfolio_learning_payload(
            portfolio_id=portfolio_id,
            portfolio_name=portfolio_data["name"],
            assets=portfolio_assets,
            transactions=portfolio_transactions,
            quotes_by_symbol=quotes_by_symbol,
        )

        # Create borsapy portfolio instance
        bp_p = BpPortfolio()
        
        # Add assets
        for asset in portfolio_assets:
            # Map frontend types to borsapy types
            # frontend: stock, crypto, gold, fund, cash
            # bp: stock, fx, crypto, fund
            a_type = asset.get("asset_type") or asset.get("type") or "stock"
            if a_type == "gold": a_type = "fx"
            elif a_type == "cash": continue # Skip cash for now in bp.Portfolio
            
            bp_p.add(
                symbol=asset["symbol"],
                shares=asset.get("quantity", 1.0),
                cost=asset.get("avg_price", 0.0),
                asset_type=a_type
            )
        
        if bp_p.holdings is None or bp_p.holdings.empty:
            raise HTTPException(status_code=400, detail="Portfolio is empty or has no valid market data")
            
        bp_p.set_benchmark("XU100")
        
        # Get metrics
        metrics = bp_p.risk_metrics(period="1y")
        hist_df = bp_p.history(period="1y")
        
        # Round metrics
        rm = RiskMetrics(
            volatility=round(_finite_float(metrics.get("annualized_volatility")) / 100, 4), # Convert to decimal
            sharpe_ratio=round(_finite_float(metrics.get("sharpe_ratio")), 4),
            sortino_ratio=round(_finite_float(metrics.get("sortino_ratio")), 4),
            max_drawdown=round(_finite_float(metrics.get("max_drawdown")) / 100, 4), # Convert to decimal
            beta=round(_finite_float(metrics.get("beta")), 4),
            alpha=round(_finite_float(metrics.get("alpha")) / 100, 4), # Convert to decimal
            var=round(_finite_float(metrics.get("var")), 2)
        )
        
        # Map performance to equity curve
        equity_curve = []
        if not hist_df.empty:
            for date, row in hist_df.iterrows():
                equity_curve.append(PerformancePoint(
                    date=date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date),
                    value=float(row["Value"])
                ))
        
        # Allocation
        allocation = []
        bp_alloc = bp_p.weights
        if isinstance(bp_alloc, dict):
            for k, v in bp_alloc.items():
                allocation.append({"name": k, "value": v})
        
        # Assets analysis
        assets_res = []
        holdings_df = bp_p.holdings
        for _, h in holdings_df.iterrows():
            assets_res.append({
                "symbol": h["symbol"],
                "shares": h["shares"],
                "cost": h["cost"],
                "asset_type": h["asset_type"],
                "value": h["value"],
                "pnl": h["pnl"],
                "pnl_pct": h["pnl_pct"] / 100, # Convert to decimal
                "weight": h["weight"] / 100   # Convert to decimal
            })

        return PortfolioAnalysisResponse(
            portfolio_id=portfolio_id,
            portfolio_name=portfolio_data["name"],
            total_value=round(bp_p.value, 2),
            pnl=round(bp_p.pnl, 2),
            pnl_pct=round(bp_p.pnl_pct / 100, 4), # Convert to decimal
            risk_metrics=rm,
            equity_curve=equity_curve,
            allocation=allocation,
            assets=assets_res,
            holding_decisions=learning_payload.get("holding_decisions") or [],
            alerts=learning_payload.get("alerts") or [],
            recommendation_memory=learning_payload.get("recommendation_memory") or {},
            portfolio_report=learning_payload.get("portfolio_report") or {},
        )
        
    except Exception as e:
        print(f"Portfolio Analysis Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
def  analyze_portfolio_inline(portfolio: PortfolioCreate):
    """
    Analyze a portfolio without saving it.
    Useful for preview/simulation.
    """
    if not portfolio.assets:
        return {
            "aggregate_score": 0,
            "aggregate_volatility": 0,
            "aggregate_entropy": 0,
            "dominant_regime": "Unknown",
            "risk_band": "undefined",
            "assets": []
        }
    
    asset_analyses = []
    total_weight = 0
    weighted_score = 0
    weighted_volatility = 0
    weighted_entropy = 0
    regime_weights = {}
    
    for asset in portfolio.assets:
        try:
            data = market_fetcher.get_stock_data(asset.symbol, period="1y")
            
            if data is None or data.empty:
                continue
            
            metrics = ScoreEngine.generate_asset_score(data)
            
            prob_up = 0.5
            if metrics["hurst"] > 0.5:
                prob_up += 0.15
            if metrics["regime"] == "Bullish Trend":
                prob_up += 0.15
            elif metrics["regime"] == "Bearish Trend":
                prob_up -= 0.15
            
            prob_up = max(0.1, min(0.9, prob_up))
            
            asset_analyses.append({
                "symbol": asset.symbol,
                "weight": asset.weight,
                "score": metrics["score"],
                "entropy": metrics["entropy"],
                "hurst": metrics["hurst"],
                "volatility": metrics["volatility"],
                "regime": metrics["regime"],
                "probability_up": prob_up,
                "probability_down": 1 - prob_up
            })
            
            w = asset.weight
            total_weight += w
            weighted_score += metrics["score"] * w
            weighted_volatility += metrics["volatility"] * w
            weighted_entropy += metrics["entropy"] * w
            
            regime_weights[metrics["regime"]] = regime_weights.get(metrics["regime"], 0) + w
            
        except Exception as e:
            print(f"Error analyzing {asset.symbol}: {e}")
            continue
    
    if total_weight > 0:
        weighted_score /= total_weight
        weighted_volatility /= total_weight
        weighted_entropy /= total_weight
    
    dominant_regime = max(regime_weights, key=regime_weights.get) if regime_weights else "Unknown"
    
    if weighted_volatility < 0.15:
        risk_band = "low"
    elif weighted_volatility < 0.30:
        risk_band = "moderate"
    elif weighted_volatility < 0.50:
        risk_band = "elevated"
    else:
        risk_band = "high"
    
    return {
        "aggregate_score": round(weighted_score, 4),
        "aggregate_volatility": round(weighted_volatility, 4),
        "aggregate_entropy": round(weighted_entropy, 4),
        "dominant_regime": dominant_regime,
        "risk_band": risk_band,
        "assets": asset_analyses
    }
