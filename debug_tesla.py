import json
import os
import sys

# Add the engine-python directory to sys.path so we can import from it
sys.path.append(os.path.join(os.getcwd(), "engine-python"))

from engine.data.market_fetch import market_fetcher
import borsapy as bp
from borsapy.portfolio import Portfolio as BpPortfolio

def debug_portfolio(portfolio_id):
    # Load portfolios
    data_path = os.path.join("data", "portfolios.json")
    with open(data_path, "r", encoding="utf-8") as f:
        portfolios = json.load(f)
    
    portfolio_data = next((p for p in portfolios if p["id"] == portfolio_id), None)
    if not portfolio_data:
        print(f"Portfolio {portfolio_id} not found")
        return

    bp_p = BpPortfolio()
    
    _ASSET_CACHE = {} # Mock if needed or import
    
    usd_try = 35.0
    try:
        from borsapy.fx import FX
        usd_try = FX("USD").current.get("last", 35.0)
    except:
        pass
    
    print(f"Using USDTRY: {usd_try}")

    for asset in portfolio_data.get("assets", []):
        symbol = asset["symbol"]
        a_type = asset.get("type", "stock")
        
        # Simulating my resolve logic
        if ":" not in symbol and a_type == "stock":
             if symbol == "TSLA": symbol = "NASDAQ:TSLA"
        
        print(f"Adding asset: {symbol}, Type: {a_type}, Quantity: {asset['quantity']}, Cost: {asset['avg_price']}")
        bp_p.add(
            symbol=symbol,
            shares=asset["quantity"],
            cost=asset["avg_price"],
            asset_type=a_type if a_type != "gold" else "fx"
        )
    
    print("\n--- BpPortfolio State ---")
    print(f"Total Value (Native?): {bp_p.value}")
    print(f"Total Cost (Native?): {bp_p.cost}")
    print(f"PnL (Native?): {bp_p.pnl}")
    print(f"PnL %: {bp_p.pnl_pct}")
    
    print("\n--- Holdings ---")
    print(bp_p.holdings)

if __name__ == "__main__":
    debug_portfolio("817377c3-b171-4f0a-b702-9ac1779769b6")
