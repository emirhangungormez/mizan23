import borsapy as bp

print("Testing Economic Calendar...")

try:
    cal = bp.EconomicCalendar()
    
    # Try different periods
    for period in ['today', '1w', '1ay']:
        try:
            df = cal.events(period=period)
            print(f"\nPeriod '{period}': {len(df)} events")
            if not df.empty:
                print(df.head(10))
                print("\nColumns:", df.columns.tolist())
                # Check for TR events
                tr_events = df[df['Country'].str.contains('TR|Turkey|Türkiye', case=False, na=False)]
                print(f"TR Events: {len(tr_events)}")
                if not tr_events.empty:
                    print(tr_events[['Event', 'Actual', 'Country']].head())
        except Exception as e:
            print(f"Error with period '{period}': {e}")
            
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
