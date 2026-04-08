"""
Professional In-Memory Cache Layer with TTL and LRU Support

Features:
- TTL (Time-To-Live) based expiration
- LRU (Least Recently Used) eviction
- Thread-safe operations
- Namespace support for different data types
- Memory limit protection
- Cache statistics and monitoring
"""

import threading
import time
from collections import OrderedDict
from typing import Any, Optional, Dict, Callable, TypeVar, Generic
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import wraps
import json
import hashlib

T = TypeVar('T')


@dataclass
class CacheEntry:
    """Single cache entry with metadata"""
    value: Any
    created_at: float
    expires_at: float
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    size_bytes: int = 0
    
    def is_expired(self) -> bool:
        return time.time() > self.expires_at
    
    def touch(self):
        """Update access metadata"""
        self.access_count += 1
        self.last_accessed = time.time()


@dataclass
class CacheStats:
    """Cache statistics for monitoring"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    expirations: int = 0
    total_entries: int = 0
    memory_bytes: int = 0
    
    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return (self.hits / total * 100) if total > 0 else 0.0
    
    def to_dict(self) -> dict:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{self.hit_rate:.1f}%",
            "evictions": self.evictions,
            "expirations": self.expirations,
            "total_entries": self.total_entries,
            "memory_mb": round(self.memory_bytes / 1024 / 1024, 2)
        }


class LRUCache:
    """Thread-safe LRU Cache with TTL support"""
    
    def __init__(self, maxsize: int = 1000, default_ttl: int = 300):
        """
        Initialize LRU Cache
        
        Args:
            maxsize: Maximum number of entries (default: 1000)
            default_ttl: Default TTL in seconds (default: 300 = 5 minutes)
        """
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
        self._maxsize = maxsize
        self._default_ttl = default_ttl
        self._stats = CacheStats()
    
    def _estimate_size(self, value: Any) -> int:
        """Estimate memory size of a value"""
        try:
            return len(json.dumps(value, default=str).encode('utf-8'))
        except:
            return 1024  # Default estimate
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._stats.misses += 1
                return None
            
            if entry.is_expired():
                self._remove(key)
                self._stats.expirations += 1
                self._stats.misses += 1
                return None
            
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            self._stats.hits += 1
            return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL"""
        with self._lock:
            ttl = ttl or self._default_ttl
            now = time.time()
            
            # Remove existing entry if present
            if key in self._cache:
                self._remove(key)
            
            # Evict LRU entries if at capacity
            while len(self._cache) >= self._maxsize:
                self._evict_lru()
            
            # Create new entry
            size = self._estimate_size(value)
            entry = CacheEntry(
                value=value,
                created_at=now,
                expires_at=now + ttl,
                size_bytes=size
            )
            
            self._cache[key] = entry
            self._stats.total_entries = len(self._cache)
            self._stats.memory_bytes += size
    
    def delete(self, key: str) -> bool:
        """Delete entry from cache"""
        with self._lock:
            return self._remove(key)
    
    def _remove(self, key: str) -> bool:
        """Internal remove without lock"""
        if key in self._cache:
            entry = self._cache.pop(key)
            self._stats.memory_bytes -= entry.size_bytes
            self._stats.total_entries = len(self._cache)
            return True
        return False
    
    def _evict_lru(self) -> None:
        """Evict least recently used entry"""
        if self._cache:
            key, entry = self._cache.popitem(last=False)
            self._stats.memory_bytes -= entry.size_bytes
            self._stats.evictions += 1
    
    def clear(self) -> None:
        """Clear all entries"""
        with self._lock:
            self._cache.clear()
            self._stats.memory_bytes = 0
            self._stats.total_entries = 0
    
    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        removed = 0
        with self._lock:
            expired_keys = [
                key for key, entry in self._cache.items() 
                if entry.is_expired()
            ]
            for key in expired_keys:
                self._remove(key)
                self._stats.expirations += 1
                removed += 1
        return removed
    
    @property
    def stats(self) -> CacheStats:
        return self._stats
    
    def __len__(self) -> int:
        return len(self._cache)
    
    def __contains__(self, key: str) -> bool:
        with self._lock:
            entry = self._cache.get(key)
            if entry and not entry.is_expired():
                return True
            return False


class CacheManager:
    """
    Centralized Cache Manager with Namespace Support
    
    Namespaces:
    - quotes: Real-time stock quotes (30s TTL)
    - history: Historical OHLCV data (5min TTL)
    - metadata: Company info, financials (1hr TTL)
    - dashboard: Dashboard aggregated data (2min TTL)
    - funds: Fund list and details (5min TTL)
    - analysis: Technical analysis results (1min TTL)
    """
    
    # TTL configurations in seconds
    TTL_CONFIG = {
        "quotes": 30,           # Real-time quotes: 30 seconds
        "history": 300,         # Historical data: 5 minutes
        "metadata": 3600,       # Company metadata: 1 hour
        "dashboard": 120,       # Dashboard data: 2 minutes
        "funds": 300,           # Funds: 5 minutes
        "analysis": 60,         # Analysis: 1 minute
        "screener": 180,        # Screener results: 3 minutes
        "batch_changes": 300,   # Batch changes: 5 minutes
        "default": 300          # Default: 5 minutes
    }
    
    # Size limits per namespace
    SIZE_CONFIG = {
        "quotes": 500,
        "history": 200,
        "metadata": 500,
        "dashboard": 50,
        "funds": 100,
        "analysis": 300,
        "screener": 100,
        "batch_changes": 50,
        "default": 200
    }
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._namespaces: Dict[str, LRUCache] = {}
        self._global_lock = threading.RLock()
        self._initialized = True
        
        # Start background cleanup thread
        self._start_cleanup_thread()
        
        print("[CacheManager] Initialized with namespace support")
    
    def _get_namespace(self, namespace: str) -> LRUCache:
        """Get or create namespace cache"""
        if namespace not in self._namespaces:
            with self._global_lock:
                if namespace not in self._namespaces:
                    ttl = self.TTL_CONFIG.get(namespace, self.TTL_CONFIG["default"])
                    size = self.SIZE_CONFIG.get(namespace, self.SIZE_CONFIG["default"])
                    self._namespaces[namespace] = LRUCache(maxsize=size, default_ttl=ttl)
        return self._namespaces[namespace]
    
    def _make_key(self, *args, **kwargs) -> str:
        """Create cache key from arguments"""
        key_parts = [str(arg) for arg in args]
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
        key_str = ":".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()[:16]
    
    def get(self, namespace: str, key: str) -> Optional[Any]:
        """Get value from namespace cache"""
        cache = self._get_namespace(namespace)
        return cache.get(key)
    
    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in namespace cache"""
        cache = self._get_namespace(namespace)
        cache.set(key, value, ttl)
    
    def delete(self, namespace: str, key: str) -> bool:
        """Delete value from namespace cache"""
        cache = self._get_namespace(namespace)
        return cache.delete(key)
    
    def clear_namespace(self, namespace: str) -> None:
        """Clear all entries in a namespace"""
        if namespace in self._namespaces:
            self._namespaces[namespace].clear()
    
    def clear_all(self) -> None:
        """Clear all caches"""
        with self._global_lock:
            for cache in self._namespaces.values():
                cache.clear()
    
    def get_stats(self) -> Dict[str, dict]:
        """Get statistics for all namespaces"""
        stats = {}
        for name, cache in self._namespaces.items():
            stats[name] = cache.stats.to_dict()
        return stats
    
    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""
        def cleanup_loop():
            while True:
                time.sleep(60)  # Run every minute
                try:
                    total_removed = 0
                    for cache in self._namespaces.values():
                        total_removed += cache.cleanup_expired()
                    if total_removed > 0:
                        print(f"[CacheManager] Cleaned up {total_removed} expired entries")
                except Exception as e:
                    print(f"[CacheManager] Cleanup error: {e}")
        
        thread = threading.Thread(target=cleanup_loop, daemon=True)
        thread.start()
    
    # === Convenience Methods ===
    
    def get_quote(self, symbol: str) -> Optional[dict]:
        """Get cached quote"""
        return self.get("quotes", symbol.upper())
    
    def set_quote(self, symbol: str, data: dict) -> None:
        """Cache quote data"""
        self.set("quotes", symbol.upper(), data)
    
    def get_history(self, symbol: str, period: str, interval: str) -> Optional[Any]:
        """Get cached history"""
        key = f"{symbol.upper()}:{period}:{interval}"
        return self.get("history", key)
    
    def set_history(self, symbol: str, period: str, interval: str, data: Any) -> None:
        """Cache history data"""
        key = f"{symbol.upper()}:{period}:{interval}"
        self.set("history", key, data)
    
    def get_metadata(self, symbol: str) -> Optional[dict]:
        """Get cached metadata"""
        return self.get("metadata", symbol.upper())
    
    def set_metadata(self, symbol: str, data: dict) -> None:
        """Cache metadata"""
        self.set("metadata", symbol.upper(), data)


def cached(namespace: str, ttl: Optional[int] = None, key_func: Optional[Callable] = None):
    """
    Decorator for caching function results
    
    Usage:
        @cached("quotes", ttl=30)
        def get_stock_price(symbol: str) -> float:
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = cache_manager._make_key(func.__name__, *args, **kwargs)
            
            # Try cache first
            cached_value = cache_manager.get(namespace, cache_key)
            if cached_value is not None:
                return cached_value
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Cache result
            if result is not None:
                cache_manager.set(namespace, cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


# Global singleton instance
cache_manager = CacheManager()
