
import borsapy as bp

print("\n--- Screen Funds ---")
try:
    # Try calling screen_funds without args or with default
    funds = bp.screen_funds()
    print(f"Funds found: {len(funds)}")
    print(funds[:5])
except Exception as e:
    print(f"Screen Funds Error: {e}")

print("\n--- Fund Detail (TCD) ---")
try:
    f = bp.Fund("TCD")
    print("Info:", f.info)
except Exception as e:
    print(f"Fund Detail Error: {e}")
