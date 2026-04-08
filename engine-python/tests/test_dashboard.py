import requests
import json

r = requests.get("http://localhost:8000/api/market/dashboard", timeout=60)
d = r.json()

print("=== INDICES ===")
for x in d.get('indices', []):
    print(f"  {x['symbol']}: {x['name']} = {x.get('last', 0):.2f} ({x.get('change_percent', 0):.2f}%)")

print("\n=== FX ===")
for x in d.get('fx', []):
    print(f"  {x['symbol']}: {x['name']} = {x.get('last', 0):.4f} ({x.get('change_percent', 0):.2f}%)")

print("\n=== COMMODITIES ===")
for x in d.get('commodities', []):
    print(f"  {x['symbol']}: {x['name']} = {x.get('last', 0):.2f} ({x.get('change_percent', 0):.2f}%)")

print("\n=== US MARKETS ===")
for x in d.get('us_markets', []):
    print(f"  {x['symbol']}: {x['name']} = {x.get('last', 0):.2f} ({x.get('change_percent', 0):.2f}%)")
