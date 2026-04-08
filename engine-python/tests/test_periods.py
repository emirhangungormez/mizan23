import requests

# Test all periods
periods = ['1d', '1w', '1m', '1y', '5y']
symbols = 'XU100,XUTUM,XU050,gram-altin,ons-altin,USD,EUR,BRENT'

for period in periods:
    print(f"\n=== {period.upper()} PERIOD ===")
    r = requests.get(f"http://localhost:8000/api/market/batch-changes?symbols={symbols}&period={period}", timeout=30)
    d = r.json()
    for item in d.get('results', []):
        print(f"  {item['symbol']}: {item['change_percent']:.2f}% ({item.get('source', 'N/A')})")
