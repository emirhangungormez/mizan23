from engine.data.market_fetch import market_fetcher
import json
import pandas as pd

def test_asset(symbol):
    print(f"\nTesting {symbol}...")
    try:
        details = market_fetcher.get_asset_details(symbol)
        print(f"Details keys: {details.keys()}")
        print(f"History count: {len(details['history'])}")
        if len(details['history']) > 0:
            print(f"First history sample: {details['history'][0]}")
        else:
            print("EMPTY HISTORY!")
    except Exception as e:
        print(f"Error test_asset: {e}")

if __name__ == "__main__":
    test_asset("THYAO")
    test_asset("XU100")
    test_asset("USD")
    test_asset("BTCUSDT")
