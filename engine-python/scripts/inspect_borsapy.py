
import borsapy as bp
import inspect

def list_contents():
    print(f"Borsapy Version: {bp.__version__}")
    print("\n--- Available Classes/Functions in borsapy ---")
    for name, obj in inspect.getmembers(bp):
        if not name.startswith('_'):
            print(f"- {name}: {type(obj)}")
            if inspect.isclass(obj):
                # Print methods of the class
                methods = [m for m, _ in inspect.getmembers(obj) if not m.startswith('_')]
                if methods:
                    print(f"  Methods: {methods}")

if __name__ == "__main__":
    list_contents()
