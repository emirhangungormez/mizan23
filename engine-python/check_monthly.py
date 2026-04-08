import borsapy as bp
from datetime import datetime, timedelta
import pandas as pd

def calculate_change(symbol, period='1mo', asset_type='fx'):
    try:
        if asset_type == 'fx':
            obj = bp.FX(symbol)
        elif asset_type == 'index':
            obj = bp.Index(symbol)
        else:
            return None
            
        hist = obj.history(period=period)
        if hist is not None and len(hist) >= 2:
            first = hist['Close'].iloc[0]
            last = hist['Close'].iloc[-1]
            change = ((last - first) / first) * 100
            return round(change, 2)
    except Exception as e:
        print(f"Error fetching {symbol}: {e}")
    return None

print("Real Monthly Changes (Last 30 days):")
print("-" * 30)

usd_change = calculate_change('USD', '1mo', 'fx')
eur_change = calculate_change('EUR', '1mo', 'fx')
gold_change = calculate_change('gram-altin', '1mo', 'fx')
bist_change = calculate_change('XU100', '1mo', 'index')

print(f"USD: {usd_change}%")
print(f"EUR: {eur_change}%")
print(f"Gold: {gold_change}%")
print(f"BIST 100: {bist_change}%")

inf = bp.Inflation()
latest = inf.latest()
print(f"Inflation (Monthly): {latest.get('monthly_inflation', 'N/A')}%")
print(f"Inflation (Yearly): {latest.get('yearly_inflation', 'N/A')}%")

policy = bp.TCMB().policy_rate
print(f"Policy Rate (Yearly): {policy}%")
print(f"Policy Rate (Monthly): {round(float(policy)/12, 2)}%")
