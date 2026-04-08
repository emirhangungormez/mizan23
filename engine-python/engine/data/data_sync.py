import os
import pandas as pd
import yfinance as yf
from datetime import datetime
import time
from typing import List
import borsapy as bp

def sync_historical_data(symbols: List[str], output_dir: str = "data_store/historical"):
    """
    Downloads and stores historical data for a list of symbols.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    print(f"Starting sync for {len(symbols)} symbols...")
    
    success_count = 0
    fail_count = 0
    
    for symbol in symbols:
        try:
            # Smart normalization for yfinance
            if ":" in symbol:
                yf_sym = symbol.split(":")[-1]
            elif symbol.startswith("^") or symbol.endswith(".IS") or "=" in symbol:
                yf_sym = symbol
            elif len(symbol) >= 4 and len(symbol) <= 6 and symbol not in ["AAPL", "TSLA", "MSFT", "GOOG", "AMZN", "NVDA", "META"]:
                yf_sym = f"{symbol}.IS"
            else:
                yf_sym = symbol
            print(f"Syncing {yf_sym}...", end=" ", flush=True)
            
            ticker = yf.Ticker(yf_sym)
            df = ticker.history(period="max")
            
            if not df.empty:
                filename = f"{symbol.replace('.', '_').replace('^', '')}.csv"
                filepath = os.path.join(output_dir, filename)
                df.to_csv(filepath)
                print(f"DONE ({len(df)} points)")
                success_count += 1
            else:
                print("FAILED (No data)")
                fail_count += 1
                
            # Throttle to avoid rate limiting
            time.sleep(0.5)
            
        except Exception as e:
            print(f"ERROR: {e}")
            fail_count += 1
            
    print(f"\nSync Complete!")
    print(f"Successful: {success_count}")
    print(f"Failed: {fail_count}")

if __name__ == "__main__":
    # Example: Sync BIST 30
    b30 = ["AKBNK", "ARCLK", "ASELS", "BIMAS", "BRSAN", "DOAS", "EKGYO", "ENKAI", 
           "EREGL", "FROTO", "GARAN", "GUBRF", "HEKTS", "ISCTR", "KCHOL", "KOZAA", 
           "KOZAL", "KRDMD", "PETKM", "PGSUS", "SAHOL", "SASA", "SISE", "TAVHL", 
           "TCELL", "THYAO", "TOASO", "TUPRS", "VAKBN", "YKBNK"]
           
    sync_historical_data(b30)
