
import borsapy as bp
import pandas as pd

def explore(symbol):
    print(f"--- Exploring {symbol} ---")
    
    try:
        t = bp.ticker(symbol)
        print("\n--- TICKER ---")
        attrs = [attr for attr in dir(t) if not attr.startswith('_')]
        print("Attributes:", attrs)
        for attr in attrs:
            try:
                val = getattr(t, attr)
                if not callable(val):
                    print(f"{attr}: {str(val)[:100]}...")
                elif attr in ['financials', 'balance_sheet', 'income_statement', 'cash_flow']:
                    print(f"{attr}: (callable)")
            except:
                pass
    except Exception as e:
        print(f"Ticker Error: {e}")

    try:
        # Check search_companies
        print("\n--- SEARCH COMPANIES ---")
        res = bp.search_companies(symbol)
        print(res)
    except Exception as e:
        print(f"Search Error: {e}")

if __name__ == "__main__":
    explore("ASELS")
