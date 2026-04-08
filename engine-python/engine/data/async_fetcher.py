"""
Async Data Fetcher with Parallel Processing

Features:
- Asyncio-based parallel data fetching
- Connection pooling for HTTP requests
- Batch operations with rate limiting
- Concurrent borsapy/yfinance calls
- Progress tracking
"""

import asyncio
import aiohttp
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Callable, Tuple
from dataclasses import dataclass
from datetime import datetime
import time
import threading

# Import sync libraries (will run in thread pool)
import borsapy as bp
from borsapy import Ticker, Index
import yfinance as yf
import pandas as pd

from engine.utils.logger import logger
from engine.utils.retry import retry, async_retry
from engine.cache import cache_manager


@dataclass
class FetchResult:
    """Result of a single fetch operation"""
    symbol: str
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    source: str = "unknown"
    duration_ms: float = 0.0


@dataclass
class BatchFetchResult:
    """Result of a batch fetch operation"""
    total: int
    successful: int
    failed: int
    results: List[FetchResult]
    duration_ms: float
    
    @property
    def success_rate(self) -> float:
        return (self.successful / self.total * 100) if self.total > 0 else 0


class AsyncDataFetcher:
    """
    High-performance async data fetcher for market data
    
    Uses thread pool for sync libraries (borsapy, yfinance)
    and asyncio for coordination and rate limiting.
    """
    
    # Rate limiting configuration
    MAX_CONCURRENT_REQUESTS = 10
    REQUEST_DELAY_MS = 100  # Delay between batches
    BATCH_SIZE = 20
    
    # BIST indices list
    BIST_INDICES = ["XU100", "XU030", "XUTUM", "XBANK", "XUSIN", "XU050"]
    
    def __init__(self, max_workers: int = 10):
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_REQUESTS)
        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = threading.Lock()
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=30, connect=10)
            connector = aiohttp.TCPConnector(
                limit=self.MAX_CONCURRENT_REQUESTS,
                limit_per_host=5,
                ttl_dns_cache=300
            )
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                connector=connector
            )
        return self._session
    
    async def close(self):
        """Close session and executor"""
        if self._session and not self._session.closed:
            await self._session.close()
        self._executor.shutdown(wait=False)
    
    def _is_bist(self, symbol: str) -> bool:
        """Check if symbol is BIST"""
        s = symbol.upper()
        if s in self.BIST_INDICES:
            return True
        if s.startswith("^") or "=" in s:
            return False
        return len(s) >= 4 and len(s) <= 6
    
    def _normalize_symbol(self, symbol: str) -> str:
        """Normalize symbol for yfinance"""
        if symbol.startswith("^") or ".IS" in symbol or "=" in symbol:
            return symbol
        return f"{symbol}.IS"
    
    # === Sync Fetch Functions (run in thread pool) ===
    
    def _fetch_quote_sync(self, symbol: str) -> FetchResult:
        """Synchronous quote fetch (runs in thread pool)"""
        start = time.perf_counter()
        
        try:
            # Try cache first
            cached = cache_manager.get_quote(symbol)
            if cached:
                return FetchResult(
                    symbol=symbol,
                    success=True,
                    data=cached,
                    source="cache",
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            data = None
            source = "unknown"
            
            if self._is_bist(symbol):
                try:
                    if symbol.upper() in self.BIST_INDICES:
                        idx = Index(symbol)
                        info = idx.info
                    else:
                        t = Ticker(symbol)
                        info = t.fast_info
                    
                    if info:
                        data = {
                            "symbol": symbol.upper(),
                            "last": float(info.get("price", 0) or info.get("last", 0) or 0),
                            "change_percent": float(info.get("daily_change_percent", 0) or info.get("change_percent", 0) or 0),
                            "volume": int(info.get("volume", 0) or 0),
                            "high": float(info.get("high", 0) or 0),
                            "low": float(info.get("low", 0) or 0),
                        }
                        source = "borsapy"
                except Exception as e:
                    logger.warning(f"Borsapy quote failed for {symbol}: {e}")
            
            # Fallback to yfinance
            if not data:
                try:
                    yf_sym = self._normalize_symbol(symbol)
                    ticker = yf.Ticker(yf_sym)
                    info = ticker.fast_info
                    
                    data = {
                        "symbol": symbol.upper(),
                        "last": float(getattr(info, 'last_price', 0) or 0),
                        "change_percent": 0,  # yfinance fast_info doesn't have this
                        "volume": int(getattr(info, 'last_volume', 0) or 0),
                        "market_cap": float(getattr(info, 'market_cap', 0) or 0),
                    }
                    source = "yfinance"
                except Exception as e:
                    logger.warning(f"yfinance quote failed for {symbol}: {e}")
            
            if data:
                # Cache the result
                cache_manager.set_quote(symbol, data)
                
                return FetchResult(
                    symbol=symbol,
                    success=True,
                    data=data,
                    source=source,
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            return FetchResult(
                symbol=symbol,
                success=False,
                error="No data available",
                duration_ms=(time.perf_counter() - start) * 1000
            )
            
        except Exception as e:
            return FetchResult(
                symbol=symbol,
                success=False,
                error=str(e),
                duration_ms=(time.perf_counter() - start) * 1000
            )
    
    def _fetch_history_sync(
        self, 
        symbol: str, 
        period: str = "1y", 
        interval: str = "1d"
    ) -> FetchResult:
        """Synchronous history fetch (runs in thread pool)"""
        start = time.perf_counter()
        
        try:
            # Try cache first
            cached = cache_manager.get_history(symbol, period, interval)
            if cached is not None:
                return FetchResult(
                    symbol=symbol,
                    success=True,
                    data=cached,
                    source="cache",
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            df = None
            source = "unknown"
            
            if self._is_bist(symbol):
                try:
                    if symbol.upper() in self.BIST_INDICES:
                        df = Index(symbol).history(period=period, interval=interval)
                    else:
                        df = Ticker(symbol).history(period=period, interval=interval)
                    source = "borsapy"
                except Exception as e:
                    logger.warning(f"Borsapy history failed for {symbol}: {e}")
            
            if df is None or df.empty:
                try:
                    yf_sym = self._normalize_symbol(symbol)
                    df = yf.Ticker(yf_sym).history(period=period, interval=interval)
                    source = "yfinance"
                except Exception as e:
                    logger.warning(f"yfinance history failed for {symbol}: {e}")
            
            if df is not None and not df.empty:
                # Standardize columns
                df.columns = [str(c).title() for c in df.columns]
                
                # Cache the result (convert to list of dicts for caching)
                cache_data = df.reset_index().to_dict(orient='records')
                cache_manager.set_history(symbol, period, interval, cache_data)
                
                return FetchResult(
                    symbol=symbol,
                    success=True,
                    data=df,
                    source=source,
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            return FetchResult(
                symbol=symbol,
                success=False,
                error="No history data",
                duration_ms=(time.perf_counter() - start) * 1000
            )
            
        except Exception as e:
            return FetchResult(
                symbol=symbol,
                success=False,
                error=str(e),
                duration_ms=(time.perf_counter() - start) * 1000
            )
    
    def _fetch_change_sync(self, symbol: str, period: str = "1d") -> FetchResult:
        """Fetch change percent for a symbol"""
        start = time.perf_counter()
        
        try:
            # Map period to days
            period_days = {
                "1d": 1, "1w": 7, "1m": 30, "1y": 365, "5y": 1825
            }
            days = period_days.get(period, 1)
            
            # Get history
            hist_result = self._fetch_history_sync(symbol, period="1mo" if days <= 30 else "2y", interval="1d")
            
            if not hist_result.success or hist_result.data is None:
                return FetchResult(
                    symbol=symbol,
                    success=False,
                    error="No history data for change calc",
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            df = hist_result.data
            if isinstance(df, list):
                df = pd.DataFrame(df)
            
            if len(df) < 2:
                return FetchResult(
                    symbol=symbol,
                    success=False,
                    error="Insufficient data points",
                    duration_ms=(time.perf_counter() - start) * 1000
                )
            
            # Calculate change
            close_col = 'Close' if 'Close' in df.columns else 'close'
            current = float(df[close_col].iloc[-1])
            
            if days == 1 and len(df) >= 2:
                previous = float(df[close_col].iloc[-2])
            else:
                idx = min(days, len(df) - 1)
                previous = float(df[close_col].iloc[-idx - 1])
            
            if previous > 0:
                change_pct = ((current - previous) / previous) * 100
            else:
                change_pct = 0
            
            return FetchResult(
                symbol=symbol,
                success=True,
                data={"change_percent": round(change_pct, 2), "source": hist_result.source},
                source=hist_result.source,
                duration_ms=(time.perf_counter() - start) * 1000
            )
            
        except Exception as e:
            return FetchResult(
                symbol=symbol,
                success=False,
                error=str(e),
                duration_ms=(time.perf_counter() - start) * 1000
            )
    
    # === Async Batch Operations ===
    
    async def _run_in_executor(self, func: Callable, *args) -> Any:
        """Run sync function in thread pool"""
        loop = asyncio.get_event_loop()
        async with self._semaphore:
            return await loop.run_in_executor(self._executor, func, *args)
    
    async def fetch_quotes_batch(self, symbols: List[str]) -> BatchFetchResult:
        """Fetch quotes for multiple symbols in parallel"""
        start = time.perf_counter()
        
        if not symbols:
            return BatchFetchResult(0, 0, 0, [], 0)
        
        # Create tasks
        tasks = [
            self._run_in_executor(self._fetch_quote_sync, symbol)
            for symbol in symbols
        ]
        
        # Execute with rate limiting between batches
        results = []
        for i in range(0, len(tasks), self.BATCH_SIZE):
            batch = tasks[i:i + self.BATCH_SIZE]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)
            
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    results.append(FetchResult(
                        symbol=symbols[i + j],
                        success=False,
                        error=str(result)
                    ))
                else:
                    results.append(result)
            
            # Rate limiting between batches
            if i + self.BATCH_SIZE < len(tasks):
                await asyncio.sleep(self.REQUEST_DELAY_MS / 1000)
        
        successful = sum(1 for r in results if r.success)
        
        return BatchFetchResult(
            total=len(symbols),
            successful=successful,
            failed=len(symbols) - successful,
            results=results,
            duration_ms=(time.perf_counter() - start) * 1000
        )
    
    async def fetch_changes_batch(
        self, 
        symbols: List[str], 
        period: str = "1d"
    ) -> BatchFetchResult:
        """Fetch change percentages for multiple symbols"""
        start = time.perf_counter()
        
        if not symbols:
            return BatchFetchResult(0, 0, 0, [], 0)
        
        # Check cache first and separate cached vs non-cached
        cached_results = []
        symbols_to_fetch = []
        
        for symbol in symbols:
            cached = cache_manager.get(
                "batch_changes", 
                f"{symbol.upper()}:{period}"
            )
            if cached:
                cached_results.append(FetchResult(
                    symbol=symbol,
                    success=True,
                    data=cached,
                    source="cache"
                ))
            else:
                symbols_to_fetch.append(symbol)
        
        # Fetch non-cached symbols
        fetch_results = []
        if symbols_to_fetch:
            tasks = [
                self._run_in_executor(self._fetch_change_sync, symbol, period)
                for symbol in symbols_to_fetch
            ]
            
            for i in range(0, len(tasks), self.BATCH_SIZE):
                batch = tasks[i:i + self.BATCH_SIZE]
                batch_results = await asyncio.gather(*batch, return_exceptions=True)
                
                for j, result in enumerate(batch_results):
                    if isinstance(result, Exception):
                        fetch_results.append(FetchResult(
                            symbol=symbols_to_fetch[i + j],
                            success=False,
                            error=str(result)
                        ))
                    else:
                        # Cache successful results
                        if result.success:
                            cache_manager.set(
                                "batch_changes",
                                f"{result.symbol.upper()}:{period}",
                                result.data,
                                ttl=300  # 5 minutes
                            )
                        fetch_results.append(result)
                
                if i + self.BATCH_SIZE < len(tasks):
                    await asyncio.sleep(self.REQUEST_DELAY_MS / 1000)
        
        # Combine results
        all_results = cached_results + fetch_results
        successful = sum(1 for r in all_results if r.success)
        
        return BatchFetchResult(
            total=len(symbols),
            successful=successful,
            failed=len(symbols) - successful,
            results=all_results,
            duration_ms=(time.perf_counter() - start) * 1000
        )
    
    async def fetch_histories_batch(
        self,
        symbols: List[str],
        period: str = "1y",
        interval: str = "1d"
    ) -> BatchFetchResult:
        """Fetch historical data for multiple symbols"""
        start = time.perf_counter()
        
        if not symbols:
            return BatchFetchResult(0, 0, 0, [], 0)
        
        tasks = [
            self._run_in_executor(self._fetch_history_sync, symbol, period, interval)
            for symbol in symbols
        ]
        
        results = []
        for i in range(0, len(tasks), self.BATCH_SIZE):
            batch = tasks[i:i + self.BATCH_SIZE]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)
            
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    results.append(FetchResult(
                        symbol=symbols[i + j],
                        success=False,
                        error=str(result)
                    ))
                else:
                    results.append(result)
            
            if i + self.BATCH_SIZE < len(tasks):
                await asyncio.sleep(self.REQUEST_DELAY_MS / 1000)
        
        successful = sum(1 for r in results if r.success)
        
        return BatchFetchResult(
            total=len(symbols),
            successful=successful,
            failed=len(symbols) - successful,
            results=results,
            duration_ms=(time.perf_counter() - start) * 1000
        )


# === Sync Wrapper Functions ===

def fetch_quotes_parallel(symbols: List[str], max_workers: int = 10) -> List[Dict]:
    """
    Synchronous wrapper for parallel quote fetching
    
    Usage:
        results = fetch_quotes_parallel(["THYAO", "ASELS", "GARAN"])
    """
    async def _run():
        fetcher = AsyncDataFetcher(max_workers=max_workers)
        try:
            result = await fetcher.fetch_quotes_batch(symbols)
            return [r.data for r in result.results if r.success]
        finally:
            await fetcher.close()
    
    return asyncio.run(_run())


def fetch_changes_parallel(
    symbols: List[str], 
    period: str = "1d",
    max_workers: int = 10
) -> Dict[str, float]:
    """
    Synchronous wrapper for parallel change fetching
    
    Usage:
        changes = fetch_changes_parallel(["THYAO", "ASELS"], period="1d")
        # Returns: {"THYAO": 2.5, "ASELS": -1.2}
    """
    async def _run():
        fetcher = AsyncDataFetcher(max_workers=max_workers)
        try:
            result = await fetcher.fetch_changes_batch(symbols, period)
            return {
                r.symbol: r.data.get("change_percent", 0) 
                for r in result.results 
                if r.success and r.data
            }
        finally:
            await fetcher.close()
    
    return asyncio.run(_run())


# Global fetcher instance (lazy initialized)
_async_fetcher: Optional[AsyncDataFetcher] = None
_fetcher_lock = threading.Lock()


def get_async_fetcher() -> AsyncDataFetcher:
    """Get global async fetcher instance"""
    global _async_fetcher
    with _fetcher_lock:
        if _async_fetcher is None:
            _async_fetcher = AsyncDataFetcher()
    return _async_fetcher
