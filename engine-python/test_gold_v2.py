import borsapy as bp
from borsapy import FX

# Try variations for the failing ones
variations = ["cumhuriyet", "cumhuriyet-altin", "resat", "22-ayar", "ayarikibilesik", "ons-altin"]

for v in variations:
    try:
        f = FX(v)
        info = f.info
        print(f"{v}: {info.get('last')} {info.get('update_time')}")
    except:
        pass
