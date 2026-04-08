
import borsapy as bp
import inspect
import os

def list_contents():
    print(f"Borsapy Version: {bp.__version__}")
    print(f"Borsapy Path: {os.path.dirname(bp.__file__)}")
    
    if hasattr(bp, 'portfolio'):
        print(f"Portfolio Module Type: {type(bp.portfolio)}")
        if hasattr(bp.portfolio, '__file__'):
            print(f"Portfolio Module Path: {bp.portfolio.__file__}")
        
        print("\n--- Portfolio Module Members ---")
        for name, obj in inspect.getmembers(bp.portfolio):
            if not name.startswith('_'):
                print(f"- {name}: {type(obj)}")

if __name__ == "__main__":
    list_contents()
