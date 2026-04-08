import requests
import json

def test_batch_quotes():
    url = "http://localhost:8000/api/market/batch-quotes"
    params = {"symbols": "THYAO,TSLA,USDTRY=X,BTC-USD"}
    
    try:
        response = requests.get(url, params=params)
        print(f"Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_batch_quotes()
