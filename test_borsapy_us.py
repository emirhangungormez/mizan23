import borsapy as bp
try:
    stock = bp.Ticker("AAPL")
    print(f"Price for AAPL (BIST default): {stock.fast_info.last_price}")
except Exception as e:
    print(f"Error for AAPL (BIST default): {e}")

try:
    # Testing if we can use a different exchange if we knew how
    # But for now, let's see if we can use a symbol like NASDAQ:AAPL
    stock = bp.Ticker("NASDAQ:AAPL")
    print(f"Price for NASDAQ:AAPL: {stock.fast_info.last_price}")
except Exception as e:
    print(f"Error for NASDAQ:AAPL: {e}")
