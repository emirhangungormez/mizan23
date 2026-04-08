import requests
import json

def test_batch_changes():
    url = "http://localhost:8000/api/market/batch-changes"
    # Testing different timeframes
    for tf in ["1w", "1m", "1y"]:
        params = {"symbols": "THYAO,TSLA", "period": tf}
        try:
            response = requests.get(url, params=params)
            print(f"--- Timeframe: {tf} ---")
            print(f"Status: {response.status_code}")
            print(json.dumps(response.json(), indent=2))
        except Exception as e:
            print(f"Error for {tf}: {e}")

if __name__ == "__main__":
    test_batch_changes()
