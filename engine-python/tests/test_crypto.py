import yfinance as yf
from datetime import datetime, timedelta

# Test crypto 5Y data
cryptos = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'BNB-USD']

print("=== CRYPTO 5Y CHECK ===\n")

for sym in cryptos:
    try:
        ticker = yf.Ticker(sym)
        h = ticker.history(period='max')
        
        if h is not None and not h.empty:
            current = float(h.iloc[-1]['Close'])
            current_date = h.index[-1]
            
            # Find price 5 years ago
            target_date = current_date - timedelta(days=1825)
            mask = h.index <= target_date
            
            if mask.any():
                past_data = h[mask]
                past_price = float(past_data.iloc[-1]['Close'])
                past_date = past_data.index[-1]
                change_pct = ((current - past_price) / past_price) * 100
                
                print(f"{sym}:")
                print(f"  Current: ${current:,.2f} ({current_date.date()})")
                print(f"  5Y Ago:  ${past_price:,.2f} ({past_date.date()})")
                print(f"  Change:  {change_pct:,.2f}%")
                print()
            else:
                print(f"{sym}: First data from {h.index[0].date()}, not enough history for 5Y")
                print(f"  Current: ${current:,.2f}")
                print()
    except Exception as e:
        print(f"{sym}: ERROR - {e}\n")
