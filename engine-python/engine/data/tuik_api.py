"""
Makro Ekonomik Veri API Entegrasyonu

Bu modül işsizlik ve GSYH verilerini çeşitli kaynaklardan çeker:
1. World Bank API (birincil - ücretsiz, güvenilir)
2. TÜİK BIRUNI (yedek)

Veri Kaynakları:
- World Bank: https://api.worldbank.org/v2/
- İşsizlik Kodu: SL.UEM.TOTL.ZS
- GSYH Büyüme Kodu: NY.GDP.MKTP.KD.ZG
"""

import requests
from typing import Dict, Any, Optional
from datetime import datetime
import json

# API Base URLs
WORLD_BANK_API = "https://api.worldbank.org/v2"
TUIK_API_BASE = "https://data.tuik.gov.tr/api"
BIRUNI_API_BASE = "https://biruni.tuik.gov.tr/DIESS"

# Cache for API responses
_cache: Dict[str, Any] = {}
_cache_time: Dict[str, datetime] = {}
CACHE_DURATION_HOURS = 6  # Cache for 6 hours


def _get_cached(key: str) -> Optional[Any]:
    """Get cached data if still valid."""
    if key in _cache and key in _cache_time:
        age = (datetime.now() - _cache_time[key]).total_seconds() / 3600
        if age < CACHE_DURATION_HOURS:
            return _cache[key]
    return None


def _set_cache(key: str, value: Any):
    """Set cache value."""
    _cache[key] = value
    _cache_time[key] = datetime.now()


def _fetch_worldbank_indicator(indicator_code: str, country: str = "TR") -> Optional[Dict[str, Any]]:
    """
    Fetch data from World Bank API.
    
    Args:
        indicator_code: World Bank indicator code
        country: Country ISO code (default: TR for Turkey)
    
    Returns:
        Latest available data point or None
    """
    try:
        url = f"{WORLD_BANK_API}/country/{country}/indicator/{indicator_code}?format=json&per_page=5&mrv=1"
        headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            # World Bank returns [metadata, data_array]
            if isinstance(data, list) and len(data) > 1 and data[1]:
                latest = data[1][0]  # Most recent value
                return {
                    "value": float(latest.get("value", 0)) if latest.get("value") else None,
                    "date": latest.get("date", ""),
                    "country": latest.get("country", {}).get("value", ""),
                    "indicator": latest.get("indicator", {}).get("value", ""),
                    "source": "World Bank"
                }
    except requests.exceptions.Timeout:
        print(f"[World Bank] Timeout for {indicator_code}")
    except Exception as e:
        print(f"[World Bank] Error fetching {indicator_code}: {e}")
    return None


def get_unemployment_rate() -> Dict[str, Any]:
    """
    Güncel işsizlik oranını çeker (World Bank > TÜİK > Fallback).
    
    Returns:
        Dict with unemployment data:
        - value: İşsizlik oranı (%)
        - date: Veri tarihi
        - period: Dönem bilgisi
        - source: Kaynak
    """
    cache_key = "unemployment_rate"
    cached = _get_cached(cache_key)
    if cached:
        return cached
    
    try:
        # 1. Try World Bank API first (most reliable)
        wb_data = _fetch_worldbank_indicator("SL.UEM.TOTL.ZS")  # Unemployment rate
        if wb_data and wb_data.get("value"):
            result = {
                "value": round(wb_data["value"], 1),
                "date": f"{wb_data['date']}-12-31",
                "period": wb_data["date"],
                "source": "World Bank",
                "trend": "stable"
            }
            _set_cache(cache_key, result)
            return result
        
        # 2. Try TÜİK BIRUNI
        result = _fetch_unemployment_biruni()
        if result:
            _set_cache(cache_key, result)
            return result
        
        # 3. Fallback to latest known value
        return _get_fallback_unemployment()
        
    except Exception as e:
        print(f"[Macro API] Unemployment fetch error: {e}")
        return _get_fallback_unemployment()


def _fetch_unemployment_biruni() -> Optional[Dict[str, Any]]:
    """Fetch from BIRUNI system."""
    try:
        # TÜİK BIRUNI JSON servisi
        url = f"{BIRUNI_API_BASE}/HHIApp/HHI_Gosterge.json"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://data.tuik.gov.tr/"
        }
        
        response = requests.get(url, headers=headers, timeout=3)  # Short timeout
        if response.status_code == 200:
            data = response.json()
            # Parse the response based on TÜİK format
            if isinstance(data, list) and len(data) > 0:
                latest = data[-1]  # Get latest data point
                return {
                    "value": float(latest.get("IsizlikOrani", 0)),
                    "date": latest.get("Donem", ""),
                    "period": latest.get("DonemAdi", ""),
                    "source": "TÜİK BIRUNI",
                    "trend": "stable"
                }
    except requests.exceptions.Timeout:
        print(f"[TÜİK] BIRUNI timeout - using fallback")
    except Exception as e:
        print(f"[TÜİK] BIRUNI fetch error: {e}")
    return None


def _fetch_unemployment_alternative() -> Optional[Dict[str, Any]]:
    """Alternative fetch method using public data endpoints."""
    try:
        # Try TÜİK data portal API
        url = "https://data.tuik.gov.tr/api/datas/get/table/45654"
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json"
        }
        
        response = requests.get(url, headers=headers, timeout=3)  # Short timeout
        if response.status_code == 200:
            data = response.json()
            if data and "data" in data:
                # Parse latest unemployment rate
                latest = data["data"][-1] if data["data"] else None
                if latest:
                    return {
                        "value": float(latest.get("value", 0)),
                        "date": latest.get("period", ""),
                        "period": latest.get("periodName", ""),
                        "source": "TÜİK Data Portal",
                        "trend": "stable"
                    }
    except requests.exceptions.Timeout:
        print(f"[TÜİK] Alternative fetch timeout - using fallback")
    except Exception as e:
        print(f"[TÜİK] Alternative fetch error: {e}")
    return None


def _get_fallback_unemployment() -> Dict[str, Any]:
    """Return fallback unemployment data (latest known)."""
    # TÜİK Aralık 2025 verisi (en son bilinen)
    return {
        "value": 8.6,
        "date": "2025-12-01",
        "period": "Aralık 2025",
        "source": "TÜİK (Fallback)",
        "trend": "down"
    }


def get_gdp_growth() -> Dict[str, Any]:
    """
    GSYH büyüme oranını çeker (World Bank > TÜİK > Fallback).
    
    Returns:
        Dict with GDP growth data:
        - value: GSYH büyüme oranı (%)
        - date: Veri tarihi
        - period: Dönem bilgisi (çeyrek)
        - source: Kaynak
    """
    cache_key = "gdp_growth"
    cached = _get_cached(cache_key)
    if cached:
        return cached
    
    try:
        # 1. Try World Bank API first (most reliable)
        wb_data = _fetch_worldbank_indicator("NY.GDP.MKTP.KD.ZG")  # GDP growth rate
        if wb_data and wb_data.get("value"):
            result = {
                "value": round(wb_data["value"], 1),
                "date": f"{wb_data['date']}-12-31",
                "period": wb_data["date"],
                "source": "World Bank",
                "trend": "stable"
            }
            _set_cache(cache_key, result)
            return result
        
        # 2. Try TÜİK BIRUNI
        result = _fetch_gdp_biruni()
        if result:
            _set_cache(cache_key, result)
            return result
        
        # 3. Try alternative
        result = _fetch_gdp_alternative()
        if result:
            _set_cache(cache_key, result)
            return result
        
        return _get_fallback_gdp()
        
    except Exception as e:
        print(f"[TÜİK API] GDP fetch error: {e}")
        return _get_fallback_gdp()


def _fetch_gdp_biruni() -> Optional[Dict[str, Any]]:
    """Fetch GDP from BIRUNI system."""
    try:
        url = f"{BIRUNI_API_BASE}/SNAApp/SNA_Gosterge.json"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }
        
        response = requests.get(url, headers=headers, timeout=3)  # Short timeout
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                latest = data[-1]
                return {
                    "value": float(latest.get("BuyumeOrani", 0)),
                    "date": latest.get("Donem", ""),
                    "period": latest.get("DonemAdi", ""),
                    "source": "TÜİK BIRUNI",
                    "trend": "stable"
                }
    except requests.exceptions.Timeout:
        print(f"[TÜİK] GDP BIRUNI timeout - using fallback")
    except Exception as e:
        print(f"[TÜİK] GDP BIRUNI fetch error: {e}")
    return None


def _fetch_gdp_alternative() -> Optional[Dict[str, Any]]:
    """Alternative fetch for GDP data."""
    try:
        # Try public API endpoint
        url = "https://data.tuik.gov.tr/api/datas/get/table/21521"
        headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        
        response = requests.get(url, headers=headers, timeout=3)  # Short timeout
        if response.status_code == 200:
            data = response.json()
            if data and "data" in data:
                latest = data["data"][-1] if data["data"] else None
                if latest:
                    return {
                        "value": float(latest.get("value", 0)),
                        "date": latest.get("period", ""),
                        "period": latest.get("periodName", ""),
                        "source": "TÜİK Data Portal",
                        "trend": "stable"
                    }
    except requests.exceptions.Timeout:
        print(f"[TÜİK] GDP alternative timeout - using fallback")
    except Exception as e:
        print(f"[TÜİK] GDP alternative fetch error: {e}")
    return None


def _get_fallback_gdp() -> Dict[str, Any]:
    """Return fallback GDP data (latest known)."""
    # TÜİK Q3 2025 GSYH büyümesi (en son bilinen)
    return {
        "value": 4.5,
        "date": "2025-09-30",
        "period": "Q3 2025",
        "source": "TÜİK (Fallback)",
        "trend": "stable"
    }


def get_macro_indicators() -> Dict[str, Any]:
    """
    Get all macro indicators from TÜİK.
    
    Returns:
        Dict containing unemployment and GDP data
    """
    return {
        "unemployment": get_unemployment_rate(),
        "gdp_growth": get_gdp_growth()
    }


# For testing
if __name__ == "__main__":
    print("=== TÜİK API Test ===")
    
    print("\n📊 İşsizlik Oranı:")
    unemployment = get_unemployment_rate()
    print(f"  Değer: %{unemployment['value']}")
    print(f"  Dönem: {unemployment['period']}")
    print(f"  Kaynak: {unemployment['source']}")
    
    print("\n📈 GSYH Büyüme:")
    gdp = get_gdp_growth()
    print(f"  Değer: %{gdp['value']}")
    print(f"  Dönem: {gdp['period']}")
    print(f"  Kaynak: {gdp['source']}")
