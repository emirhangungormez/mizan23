
import borsapy as bp
import inspect

def inspect_portfolio():
    print(f"Borsapy Version: {bp.__version__}")
    if hasattr(bp, 'portfolio'):
        print("\n--- Portfolio Module Contents ---")
        for name, obj in inspect.getmembers(bp.portfolio):
            if not name.startswith('_'):
                print(f"- {name}: {type(obj)}")
                if inspect.isclass(obj):
                    methods = [m for m, _ in inspect.getmembers(obj) if not m.startswith('_')]
                    print(f"  Methods: {methods}")
                if inspect.isfunction(obj):
                    # Try to see arguments
                    try:
                        sig = inspect.signature(obj)
                        print(f"  Signature: {sig}")
                    except:
                        pass
    else:
        print("Portfolio module NOT found in borsapy.")

if __name__ == "__main__":
    inspect_portfolio()
