"""
Verify borsapy 0.7.2 screener functionality using PUBLIC API.
Tests screen_stocks() and scan() functions.
"""
import sys
import os
import borsapy as bp

def test_screener():
    """Test borsapy 0.7.2 public screen_stocks API."""
    print("=" * 60)
    print("Testing borsapy 0.7.2 screen_stocks() PUBLIC API")
    print("=" * 60)
    
    # Test 1: Basic screen (all stocks)
    print("\n1. Basic screen (all stocks):")
    try:
        df = bp.screen_stocks()
        print(f"   Count: {len(df) if df is not None else 0}")
        if df is not None and not df.empty:
            print(f"   Columns: {list(df.columns)[:10]}...")
            print(f"   Sample:\n{df.head(3)}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 2: Screen with index filter
    print("\n2. Screen with index filter (XU100):")
    try:
        df = bp.screen_stocks(index="XU100")
        print(f"   Count: {len(df) if df is not None else 0}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 3: Screen with template
    print("\n3. Screen with template (high_dividend):")
    try:
        df = bp.screen_stocks(template="high_dividend")
        print(f"   Count: {len(df) if df is not None else 0}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 4: Technical scan
    print("\n4. Technical scan (RSI < 30):")
    try:
        df = bp.scan(index="BIST 100", condition="rsi < 30")
        print(f"   Count: {len(df) if df is not None else 0}")
        if df is not None and not df.empty:
            print(f"   Sample:\n{df.head(3)}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test 5: Index components
    print("\n5. Index components (XU030):")
    try:
        idx = bp.Index("XU030")
        components = idx.components
        print(f"   Count: {len(components) if components else 0}")
        if components:
            print(f"   Sample: {components[:3]}")
    except Exception as e:
        print(f"   Error: {e}")
    
    print("\n" + "=" * 60)
    print("Tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    test_screener()
