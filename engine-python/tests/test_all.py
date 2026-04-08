import requests

print("=== TÜM VERİ KAYNAKLARI TESTİ ===\n")

# Test tüm semboller için tüm dönemler
test_cases = {
    "BIST": ["XU100", "XUTUM", "XU050"],
    "FX": ["USD", "EUR"],
    "Emtia TL": ["gram-altin", "gram-gumus"],
    "Emtia USD": ["BRENT", "CL", "NG"],
    "Kripto": ["BTC", "ETH", "SOL"],
    "ABD": ["^GSPC", "^DJI"]
}

periods = ["1d", "1w", "1m", "1y", "5y"]

for category, symbols in test_cases.items():
    print(f"\n{'='*50}")
    print(f"  {category}")
    print(f"{'='*50}")
    
    for period in periods:
        sym_str = ",".join(symbols)
        r = requests.get(f"http://localhost:8000/api/market/batch-changes?symbols={sym_str}&period={period}", timeout=60)
        d = r.json()
        
        print(f"\n  [{period.upper()}]")
        for item in d.get('results', []):
            source = item.get('source', 'N/A')
            pct = item.get('change_percent', 0)
            print(f"    {item['symbol']}: {pct:+.2f}% ({source})")
