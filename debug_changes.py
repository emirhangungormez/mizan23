import sys
import os
import json

# Add engine-python to path
sys.path.append(os.path.join(os.getcwd(), "engine-python"))

from engine.data.market_fetch import MarketFetcher

def debug_changes():
    mf = MarketFetcher()
    test_symbols = ["THYAO", "TSLA"]
    periods = ["1w", "1m", "1y"]
    
    for p in periods:
        print(f"\n--- Batch Changes Results ({p}) ---")
        changes = mf.get_batch_changes(test_symbols, period=p)
        print(json.dumps(changes, indent=2))

if __name__ == "__main__":
    debug_changes()
