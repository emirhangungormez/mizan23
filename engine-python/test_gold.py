import borsapy as bp
from borsapy import FX

symbols = ["gram-altin", "ceyrek-altin", "yarim-altin", "tam-altin", "cumhuriyet-altini", "ata-altin", "resat-altin", "22-ayar-bilezik"]

for s in symbols:
    try:
        f = FX(s)
        info = f.info
        print(f"{s}: {info.get('last')} {info.get('update_time')}")
    except Exception as e:
        print(f"{s}: ERROR {e}")
