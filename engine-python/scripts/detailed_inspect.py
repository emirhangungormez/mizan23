
import borsapy as bp
import inspect

def detailed_inspect(cls):
    print(f"\n--- Class: {cls.__name__} ---")
    
    # Get all members
    for name, obj in inspect.getmembers(cls):
        if not name.startswith('_'):
            if callable(obj):
                try:
                    sig = inspect.signature(obj)
                    print(f"- [METHOD] {name}{sig}")
                except:
                    print(f"- [METHOD] {name}(?)")
            else:
                print(f"- [ATTR/PROP] {name}")

if hasattr(bp, 'portfolio'):
    if hasattr(bp.portfolio, 'Portfolio'):
        detailed_inspect(bp.portfolio.Portfolio)
