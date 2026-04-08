import borsapy as bp

# Test BIST index historical data availability
symbols = ['XU100', 'XU030', 'XUTUM', 'XU050', 'XBANK', 'XUSIN']

for sym in symbols:
    try:
        idx = bp.Index(sym)
        # Try different periods
        for period in ['1mo', '3mo', '6mo', '1y', '5y', 'max']:
            try:
                h = idx.history(period=period)
                if h is not None and not h.empty:
                    print(f"{sym} ({period}): {len(h)} rows, from {h.index[0].date()} to {h.index[-1].date()}")
                else:
                    print(f"{sym} ({period}): NO DATA")
            except Exception as e:
                print(f"{sym} ({period}): ERROR - {str(e)[:50]}")
    except Exception as e:
        print(f"{sym}: INIT ERROR - {str(e)[:50]}")
    print()
