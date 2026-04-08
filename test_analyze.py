import requests
import json

URL = "http://localhost:8000/api/portfolio/817377c3-b171-4f0a-b702-9ac1779769b6/analyze"
try:
    response = requests.post(URL)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Total Value: {data['total_value']}")
        print(f"PnL: {data['pnl']}")
        print(f"PnL %: {data['pnl_pct']}")
        for asset in data['assets']:
            print(f"Asset: {asset['symbol']}, Price: {asset.get('current_price')}, Value: {asset['value']}, PnL: {asset['pnl']}")
    else:
        print(response.text)
except Exception as e:
    print(f"Error: {e}")
