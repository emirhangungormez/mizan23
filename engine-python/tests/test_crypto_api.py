import requests

# Test crypto changes from API
cryptos = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB']
symbols = ','.join(cryptos)

for period in ['1d', '1w', '1m', '1y', '5y']:
    print(f"\n=== {period.upper()} ===")
    r = requests.get(f"http://localhost:8000/api/market/batch-changes?symbols={symbols}&period={period}", timeout=60)
    d = r.json()
    for item in d.get('results', []):
        print(f"  {item['symbol']}: {item['change_percent']:.2f}% ({item.get('source', 'N/A')})")
    if not d.get('results'):
        print(f"  No results!")
