
try:
    from engine.data.market_fetch import MarketFetcher
    print("Import Successful")
    m = MarketFetcher()
    print("Init Successful")
except Exception as e:
    print(f"Error: {e}")
