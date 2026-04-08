import yfinance as yf
import json

def test_yf():
    syms = ["TSLA", "AAPL", "BTC-USD", "GC=F"]
    results = {}
    for s in syms:
        try:
            print(f"Fetching {s}...")
            t = yf.Ticker(s)
            h = t.history(period="1mo")
            if not h.empty:
                results[s] = {
                    "last": float(h.iloc[-1]["Close"]),
                    "date": str(h.index[-1])
                }
            else:
                results[s] = "EMPTY"
        except Exception as e:
            results[s] = f"ERROR: {e}"
            
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    test_yf()
