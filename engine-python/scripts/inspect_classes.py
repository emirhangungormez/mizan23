
import borsapy as bp
import inspect

def inspect_class(cls):
    print(f"\n--- Class: {cls.__name__} ---")
    try:
        sig = inspect.signature(cls.__init__)
        print(f"  Init Signature: {sig}")
    except:
        pass
    
    methods = [m for m, obj in inspect.getmembers(cls) if not m.startswith('_') and callable(obj)]
    print(f"  Methods: {methods}")
    
    # Try to see class docstring
    if cls.__doc__:
        print(f"  Doc: {cls.__doc__}")

if hasattr(bp, 'portfolio'):
    if hasattr(bp.portfolio, 'Portfolio'):
        inspect_class(bp.portfolio.Portfolio)
    if hasattr(bp.portfolio, 'Holding'):
        inspect_class(bp.portfolio.Holding)
else:
    print("No portfolio module.")
