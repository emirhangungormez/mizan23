import requests
r = requests.get("http://localhost:8000/api/market/dashboard", timeout=60)
d = r.json()

# Find BTC, ETH in crypto
print("Looking for major coins in dashboard crypto data:")
for x in d.get('crypto', []):
    name = x.get('name', '').upper()
    sym = x.get('symbol', '').upper()
    if any(coin in name or coin in sym for coin in ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB']):
        print(f"  symbol={x.get('symbol')}, name={x.get('name')}, last={x.get('last')}, change_pct={x.get('change_percent')}")
