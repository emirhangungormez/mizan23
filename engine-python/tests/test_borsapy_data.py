"""Test borsapy data for debugging"""
import borsapy as bp

# Test THYAO
print("=== THYAO ===")
t = bp.Ticker("THYAO")
info = t.info
print(f"trailingPE: {info.get('trailingPE')}")
print(f"priceToBook: {info.get('priceToBook')}")
print(f"enterpriseToEbitda: {info.get('enterpriseToEbitda')}")
print(f"foreignRatio: {info.get('foreignRatio')}")
print(f"floatShares: {info.get('floatShares')}")
print(f"dividendYield: {info.get('dividendYield')}")

print("\n=== THYAO Analyst ===")
print(f"recommendations: {t.recommendations}")
print(f"analyst_price_targets: {t.analyst_price_targets}")
print(f"recommendations_summary: {t.recommendations_summary}")

print("\n=== THYAO TA ===")
ta = t.ta_signals()
if ta:
    print(f"RSI: {ta.get('oscillators', {}).get('values', {}).get('RSI')}")
    print(f"MACD: {ta.get('oscillators', {}).get('values', {}).get('MACD.macd')}")
    print(f"Summary: {ta.get('summary')}")

# Test GARAN
print("\n=== GARAN ===")
g = bp.Ticker("GARAN")
ginfo = g.info
print(f"trailingPE: {ginfo.get('trailingPE')}")
print(f"priceToBook: {ginfo.get('priceToBook')}")
print(f"enterpriseToEbitda: {ginfo.get('enterpriseToEbitda')}")
print(f"foreignRatio: {ginfo.get('foreignRatio')}")

print("\n=== GARAN Analyst ===")
print(f"recommendations: {g.recommendations}")
print(f"analyst_price_targets: {g.analyst_price_targets}")
print(f"recommendations_summary: {g.recommendations_summary}")

# Test SISE (to test EV/EBITDA for non-bank)
print("\n=== SISE ===")
s = bp.Ticker("SISE")
sinfo = s.info
print(f"trailingPE: {sinfo.get('trailingPE')}")
print(f"priceToBook: {sinfo.get('priceToBook')}")
print(f"enterpriseToEbitda: {sinfo.get('enterpriseToEbitda')}")
print(f"foreignRatio: {sinfo.get('foreignRatio')}")
