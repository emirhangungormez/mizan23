"""Test all borsapy features for a stock"""
import borsapy as bp
import json

def test_ticker(symbol: str):
    print(f"\n{'='*60}")
    print(f"Testing {symbol}")
    print('='*60)
    
    t = bp.Ticker(symbol)
    
    # 1. INFO
    print("\n--- INFO ---")
    try:
        info = t.info
        if hasattr(info, '__dict__'):
            for k, v in info.__dict__.items():
                if not k.startswith('_'):
                    print(f"  {k}: {v}")
        elif isinstance(info, dict):
            for k, v in info.items():
                print(f"  {k}: {v}")
        else:
            print(f"  Type: {type(info)}")
            print(f"  Value: {info}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 2. FAST_INFO
    print("\n--- FAST_INFO ---")
    try:
        fi = t.fast_info
        if fi:
            for k, v in fi.items():
                print(f"  {k}: {v}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 3. TA_SIGNALS
    print("\n--- TA_SIGNALS ---")
    try:
        ta = t.ta_signals()
        if ta:
            print(f"  summary: {ta.get('summary')}")
            osc = ta.get('oscillators', {})
            print(f"  oscillators_rec: {osc.get('recommendation')}")
            vals = osc.get('values', {})
            print(f"  RSI: {vals.get('RSI')}")
            print(f"  MACD: {vals.get('MACD.macd')}")
            print(f"  Stoch.K: {vals.get('Stoch.K')}")
            print(f"  CCI20: {vals.get('CCI20')}")
            print(f"  ADX: {vals.get('ADX')}")
            ma = ta.get('moving_averages', {})
            print(f"  ma_rec: {ma.get('recommendation')}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 4. RECOMMENDATIONS
    print("\n--- RECOMMENDATIONS ---")
    try:
        rec = t.recommendations
        if rec:
            print(f"  {rec}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 5. ANALYST_PRICE_TARGETS
    print("\n--- ANALYST_PRICE_TARGETS ---")
    try:
        apt = t.analyst_price_targets
        if apt:
            print(f"  {apt}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 6. RECOMMENDATIONS_SUMMARY
    print("\n--- RECOMMENDATIONS_SUMMARY ---")
    try:
        rs = t.recommendations_summary
        if rs:
            print(f"  {rs}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 7. FINANCIALS - Balance Sheet
    print("\n--- BALANCE_SHEET ---")
    try:
        bs = t.balance_sheet
        if bs is not None and not bs.empty:
            print(f"  Columns: {list(bs.columns)[:5]}...")
            print(f"  Index: {list(bs.index)[:5]}...")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 8. INCOME_STMT
    print("\n--- INCOME_STMT ---")
    try:
        inc = t.income_stmt
        if inc is not None and not inc.empty:
            print(f"  Columns: {list(inc.columns)[:5]}...")
            print(f"  Index: {list(inc.index)[:5]}...")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 9. DIVIDENDS
    print("\n--- DIVIDENDS ---")
    try:
        div = t.dividends
        if div is not None:
            print(f"  {div}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # 10. SUPERTREND
    print("\n--- SUPERTREND ---")
    try:
        st = t.supertrend()
        if st:
            print(f"  {st}")
    except Exception as e:
        print(f"  Error: {e}")

if __name__ == "__main__":
    test_ticker("THYAO")
