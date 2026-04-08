
import borsapy as bp

print("\n--- Screen Stocks ---")
try:
    # Try calling screen_stocks without args
    stocks = bp.screen_stocks()
    print(f"Stocks found: {len(stocks)}")
    print(stocks[:5])
except Exception as e:
    print(f"Screen Stocks Error: {e}")
