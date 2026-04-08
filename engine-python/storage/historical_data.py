"""
Historical Data Storage - Persistent storage for BIST historical price data

This module provides:
1. One-time download of historical data (max available)
2. Incremental updates (only fetch new data since last update)
3. Fast period return calculations from local storage
4. No redundant API calls for historical data

Storage format: Parquet files (compressed, fast, pandas-native)
Location: storage/historical/{symbol}.parquet
"""

import os
import pandas as pd
import borsapy as bp
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Tuple
from pathlib import Path
import threading
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

# Storage directory
STORAGE_DIR = Path(__file__).parent.parent.parent / "storage" / "historical"
METADATA_FILE = STORAGE_DIR / "_metadata.json"

# Ensure directory exists
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class HistoricalDataStore:
    """
    Persistent storage for historical price data.
    
    - Stores data in Parquet format (fast, compressed)
    - Only fetches new data after last stored date
    - Thread-safe with locking
    """
    
    def __init__(self):
        self._lock = threading.Lock()
        self._memory_cache: Dict[str, pd.DataFrame] = {}  # In-memory cache
        self._metadata = self._load_metadata()
        print(f"[HistoricalDataStore] Initialized. Storage: {STORAGE_DIR}")
        print(f"[HistoricalDataStore] {len(self._metadata.get('symbols', {}))} symbols in storage")
    
    def _load_metadata(self) -> Dict:
        """Load metadata about stored symbols"""
        if METADATA_FILE.exists():
            try:
                with open(METADATA_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {"symbols": {}, "last_full_update": None}
    
    def _save_metadata(self):
        """Save metadata"""
        with open(METADATA_FILE, 'w') as f:
            json.dump(self._metadata, f, indent=2, default=str)
    
    def _get_parquet_path(self, symbol: str) -> Path:
        """Get parquet file path for symbol"""
        return STORAGE_DIR / f"{symbol}.parquet"
    
    def get_history(self, symbol: str, force_update: bool = False) -> Optional[pd.DataFrame]:
        """
        Get historical data for a symbol.
        
        1. Check memory cache
        2. Check parquet file
        3. Fetch from API if needed (incremental)
        """
        # Check memory cache first
        if symbol in self._memory_cache and not force_update:
            return self._memory_cache[symbol]
        
        parquet_path = self._get_parquet_path(symbol)
        
        with self._lock:
            # Load existing data if available
            existing_df = None
            if parquet_path.exists() and not force_update:
                try:
                    existing_df = pd.read_parquet(parquet_path)
                except Exception as e:
                    print(f"[HistoricalDataStore] Error reading {symbol}: {e}")
            
            # Check if we need to update
            needs_update = self._needs_update(symbol, existing_df)
            
            if needs_update:
                # Fetch new data
                new_df = self._fetch_incremental(symbol, existing_df)
                
                if new_df is not None and not new_df.empty:
                    # Save to parquet
                    new_df.to_parquet(parquet_path)
                    
                    # Update metadata
                    self._metadata["symbols"][symbol] = {
                        "last_update": datetime.now().isoformat(),
                        "rows": len(new_df),
                        "first_date": str(new_df.index.min()),
                        "last_date": str(new_df.index.max())
                    }
                    self._save_metadata()
                    
                    # Update memory cache
                    self._memory_cache[symbol] = new_df
                    return new_df
            
            # Return existing data
            if existing_df is not None:
                self._memory_cache[symbol] = existing_df
                return existing_df
            
            return None
    
    def _needs_update(self, symbol: str, existing_df: Optional[pd.DataFrame]) -> bool:
        """Check if symbol needs data update"""
        if existing_df is None or existing_df.empty:
            return True
        
        # Check last data date
        last_date = existing_df.index.max()
        if hasattr(last_date, 'date'):
            last_date = last_date.date()
        elif hasattr(last_date, 'to_pydatetime'):
            last_date = last_date.to_pydatetime().date()
        
        today = datetime.now().date()
        
        # If last data is more than 1 day old (accounting for weekends)
        days_diff = (today - last_date).days
        
        # If it's weekend, we might not have new data
        if today.weekday() >= 5:  # Saturday or Sunday
            return days_diff > 3
        else:
            return days_diff > 1
    
    def _fetch_incremental(self, symbol: str, existing_df: Optional[pd.DataFrame]) -> Optional[pd.DataFrame]:
        """
        Fetch only new data since last stored date.
        If no existing data, fetch full history.
        """
        try:
            if existing_df is None or existing_df.empty:
                # First time - fetch full history
                print(f"[HistoricalDataStore] {symbol}: Fetching full history...")
                return self._fetch_full_history(symbol)
            
            # Get last date
            last_date = existing_df.index.max()
            if hasattr(last_date, 'to_pydatetime'):
                last_date = last_date.to_pydatetime()
            
            # Fetch only new data
            start_date = (last_date + timedelta(days=1)).strftime('%Y-%m-%d')
            end_date = datetime.now().strftime('%Y-%m-%d')
            
            print(f"[HistoricalDataStore] {symbol}: Fetching {start_date} to {end_date}...")
            
            # Try borsapy first
            try:
                ticker = bp.Ticker(symbol)
                new_df = ticker.history(start=start_date, end=end_date)
                
                if new_df is not None and not new_df.empty:
                    # Normalize column names
                    new_df = self._normalize_columns(new_df)
                    
                    # Combine with existing
                    combined = pd.concat([existing_df, new_df])
                    combined = combined[~combined.index.duplicated(keep='last')]
                    combined = combined.sort_index()
                    
                    print(f"[HistoricalDataStore] {symbol}: Added {len(new_df)} new rows")
                    return combined
                    
            except Exception as bp_err:
                print(f"[HistoricalDataStore] {symbol}: borsapy error ({bp_err}), trying yfinance")
            
            # Fallback to yfinance
            try:
                yf_symbol = f"{symbol}.IS"
                yf_ticker = yf.Ticker(yf_symbol)
                new_df = yf_ticker.history(start=start_date, end=end_date)
                
                if new_df is not None and not new_df.empty:
                    new_df = self._normalize_columns(new_df)
                    combined = pd.concat([existing_df, new_df])
                    combined = combined[~combined.index.duplicated(keep='last')]
                    combined = combined.sort_index()
                    print(f"[HistoricalDataStore] {symbol}: Added {len(new_df)} new rows (yfinance)")
                    return combined
                    
            except Exception as yf_err:
                print(f"[HistoricalDataStore] {symbol}: yfinance also failed: {yf_err}")
            
            # No new data, return existing
            return existing_df
            
        except Exception as e:
            print(f"[HistoricalDataStore] {symbol}: Error in incremental fetch: {e}")
            return existing_df
    
    def _fetch_full_history(self, symbol: str) -> Optional[pd.DataFrame]:
        """Fetch full history for a symbol (first time only)"""
        # Try borsapy first
        try:
            ticker = bp.Ticker(symbol)
            df = ticker.history(period="max")
            
            if df is not None and not df.empty:
                df = self._normalize_columns(df)
                print(f"[HistoricalDataStore] {symbol}: Got {len(df)} rows from borsapy")
                return df
                
        except Exception as bp_err:
            print(f"[HistoricalDataStore] {symbol}: borsapy failed ({bp_err})")
        
        # Fallback to yfinance
        try:
            yf_symbol = f"{symbol}.IS"
            yf_ticker = yf.Ticker(yf_symbol)
            df = yf_ticker.history(period="max")
            
            if df is not None and not df.empty:
                df = self._normalize_columns(df)
                print(f"[HistoricalDataStore] {symbol}: Got {len(df)} rows from yfinance")
                return df
                
        except Exception as yf_err:
            print(f"[HistoricalDataStore] {symbol}: yfinance also failed: {yf_err}")
        
        return None
    
    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize column names to standard format"""
        column_map = {
            'open': 'Open',
            'high': 'High',
            'low': 'Low',
            'close': 'Close',
            'volume': 'Volume',
            'Open': 'Open',
            'High': 'High',
            'Low': 'Low',
            'Close': 'Close',
            'Volume': 'Volume'
        }
        
        df = df.rename(columns={k: v for k, v in column_map.items() if k in df.columns})
        
        # Keep only OHLCV columns
        keep_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
        df = df[[c for c in keep_cols if c in df.columns]]
        
        return df
    
    def calculate_period_returns(self, symbol: str) -> Dict[str, float]:
        """
        Calculate period returns from stored historical data.
        Much faster than fetching each time!
        """
        df = self.get_history(symbol)
        
        if df is None or df.empty or len(df) < 2:
            return {}
        
        returns = {}
        current_price = df['Close'].iloc[-1]
        today = datetime.now().date()
        
        try:
            # 1 Week (7 days ago)
            date_1w = today - timedelta(days=7)
            hist_1w = df[df.index.date <= date_1w]
            if len(hist_1w) > 0:
                price_1w = hist_1w['Close'].iloc[-1]
                returns['p1w'] = round(((current_price - price_1w) / price_1w) * 100, 2)
            
            # 1 Month (30 days ago)
            date_1m = today - timedelta(days=30)
            hist_1m = df[df.index.date <= date_1m]
            if len(hist_1m) > 0:
                price_1m = hist_1m['Close'].iloc[-1]
                returns['p1m'] = round(((current_price - price_1m) / price_1m) * 100, 2)
            
            # 3 Months (90 days ago)
            date_3m = today - timedelta(days=90)
            hist_3m = df[df.index.date <= date_3m]
            if len(hist_3m) > 0:
                price_3m = hist_3m['Close'].iloc[-1]
                returns['p3m'] = round(((current_price - price_3m) / price_3m) * 100, 2)
            
            # YTD (Year to Date)
            year_start = datetime(today.year, 1, 1).date()
            hist_ytd = df[df.index.date >= year_start]
            if len(hist_ytd) > 0:
                first_day_price = hist_ytd['Close'].iloc[0]
                returns['ytd'] = round(((current_price - first_day_price) / first_day_price) * 100, 2)
            
            # 1 Year (365 days ago)
            date_1y = today - timedelta(days=365)
            hist_1y = df[df.index.date <= date_1y]
            if len(hist_1y) > 0:
                price_1y = hist_1y['Close'].iloc[-1]
                returns['p1y'] = round(((current_price - price_1y) / price_1y) * 100, 2)
            
            # 5 Years (1825 days ago)
            date_5y = today - timedelta(days=1825)
            hist_5y = df[df.index.date <= date_5y]
            if len(hist_5y) > 0:
                price_5y = hist_5y['Close'].iloc[-1]
                returns['p5y'] = round(((current_price - price_5y) / price_5y) * 100, 2)
                
        except Exception as e:
            print(f"[HistoricalDataStore] {symbol}: Error calculating returns: {e}")
        
        return returns
    
    def preload_symbols(self, symbols: List[str], max_workers: int = 10):
        """
        Preload historical data for multiple symbols in parallel.
        Useful for initial setup or batch updates.
        """
        print(f"[HistoricalDataStore] Preloading {len(symbols)} symbols...")
        start_time = datetime.now()
        
        loaded = 0
        failed = 0
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self.get_history, sym): sym for sym in symbols}
            
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    result = future.result()
                    if result is not None:
                        loaded += 1
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1
                    print(f"[HistoricalDataStore] {symbol}: Preload error: {e}")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"[HistoricalDataStore] Preload complete: {loaded} loaded, {failed} failed in {elapsed:.1f}s")
    
    def get_storage_stats(self) -> Dict:
        """Get statistics about stored data"""
        total_files = len(list(STORAGE_DIR.glob("*.parquet")))
        total_size = sum(f.stat().st_size for f in STORAGE_DIR.glob("*.parquet"))
        
        return {
            "storage_dir": str(STORAGE_DIR),
            "total_symbols": total_files,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "metadata": self._metadata
        }
    
    def clear_cache(self):
        """Clear in-memory cache"""
        with self._lock:
            self._memory_cache.clear()
        print("[HistoricalDataStore] Memory cache cleared")
    
    def clear_storage(self):
        """Clear all stored data (use with caution!)"""
        with self._lock:
            for f in STORAGE_DIR.glob("*.parquet"):
                f.unlink()
            self._metadata = {"symbols": {}, "last_full_update": None}
            self._save_metadata()
            self._memory_cache.clear()
        print("[HistoricalDataStore] All storage cleared")


# Global instance
historical_store = HistoricalDataStore()


# Convenience functions
def get_period_returns(symbol: str) -> Dict[str, float]:
    """Get period returns for a symbol (uses persistent storage)"""
    return historical_store.calculate_period_returns(symbol)


def preload_all_bist_symbols():
    """Preload all BIST symbols (run once on startup or as background task)"""
    try:
        df = bp.screen_stocks()
        if df is not None and not df.empty:
            symbols = df['symbol'].tolist()
            historical_store.preload_symbols(symbols)
    except Exception as e:
        print(f"[HistoricalDataStore] Error preloading: {e}")
