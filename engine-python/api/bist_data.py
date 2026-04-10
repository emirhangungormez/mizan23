"""
BIST Stock Data API - Background Refresh with borsapy

Strategy:
- Background thread refreshes ALL stocks every 15 minutes
- Each stock fetched with 1.5s delay to avoid rate limits  
- 584 stocks x 1.5s = ~15 minutes for full refresh
- API serves data from cache (instant response)
- No yfinance fallback - only borsapy
"""

from fastapi import APIRouter, Query, HTTPException, Body
from typing import ClassVar
from typing import Optional, List, Dict, Any
from pathlib import Path
from itertools import combinations
import json
import borsapy as bp
import pandas as pd
import time
import unicodedata
from datetime import date, datetime, timedelta
from statistics import median
import threading
from engine.utils.logger import logger
from engine.utils.retry import retry_external_service
from engine.data.borsapy_v072_extensions import get_index_components
from scoring import compute_proprietary_scores, derive_probability_action, estimate_probability_fields, get_global_reference_snapshot
from storage.proprietary_snapshots import save_bist_proprietary_snapshot, load_latest_bist_proprietary_snapshot
from storage.proprietary_outcomes import build_bist_outcome_report

router = APIRouter()


def _normalize_search_text(value: Optional[str]) -> str:
    """Normalize Turkish characters and punctuation for search matching."""
    if not value:
        return ""
    normalized = (
        str(value)
        .replace("ı", "i")
        .replace("İ", "i")
        .replace("I", "i")
        .replace("ş", "s")
        .replace("Ş", "s")
        .replace("ğ", "g")
        .replace("Ğ", "g")
        .replace("ü", "u")
        .replace("Ü", "u")
        .replace("ö", "o")
        .replace("Ö", "o")
        .replace("ç", "c")
        .replace("Ç", "c")
        .replace(".", "")
        .replace(" ", "")
        .lower()
    )
    return normalized


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _normalize_dividend_yield(value: Any) -> float | None:
    """Keep borsapy dividend yield values in their original percent scale."""
    parsed = _safe_float(value)
    if parsed is None:
        return None
    return parsed


def _calculate_dividend_window_stats(
    dividend_items: List[Dict[str, Any]],
    *,
    months: int = 60,
    reference_date: Optional[date] = None,
) -> Dict[str, float]:
    now_date = reference_date or datetime.now().date()
    months = max(1, int(months))
    target_years = max(1, months // 12)
    recent_dates: List[datetime.date] = []

    for item in dividend_items:
        raw_date = item.get("date")
        if not raw_date:
            continue
        try:
            dividend_date = datetime.fromisoformat(str(raw_date)).date()
        except ValueError:
            continue
        if dividend_date > now_date:
            continue
        months_ago = (now_date.year - dividend_date.year) * 12 + (now_date.month - dividend_date.month)
        if 0 <= months_ago < months:
            recent_dates.append(dividend_date)

    payout_years = {item.year for item in recent_dates}
    consistency_score = round(min(len(payout_years), target_years) / target_years * 100, 2)
    return {
        "event_count": float(len(recent_dates)),
        "payout_years": float(len(payout_years)),
        "consistency_score": consistency_score,
    }


def _normalize_financial_label(value: Any) -> str:
    text = str(value or "").strip()
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def _extract_series_value(series: pd.Series, candidates: List[str], aggregate: str = "first") -> float | None:
    if series is None or len(series) == 0:
        return None

    normalized_targets = [_normalize_financial_label(candidate) for candidate in candidates]
    matches: List[float] = []

    for idx, raw_value in series.items():
        idx_normalized = _normalize_financial_label(idx)
        if not any(target and target in idx_normalized for target in normalized_targets):
            continue

        parsed = _safe_float(raw_value)
        if parsed is None:
            continue
        matches.append(parsed)

    if not matches:
        return None

    if aggregate == "sum":
        return float(sum(matches))
    if aggregate == "last":
        return float(matches[-1])
    return float(matches[0])


def _coerce_date_string(value: Any) -> str | None:
    if value is None:
        return None
    try:
        parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    except Exception:
        return None
    if parsed is None or pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _extract_dividend_amount(value: Any) -> float | None:
    if isinstance(value, pd.Series):
        for key in ("Amount", "amount", "NetRate", "net_rate", "GrossRate", "gross_rate"):
            if key in value.index:
                parsed = _safe_float(value.get(key))
                if parsed is not None:
                    return parsed
        return None
    return _safe_float(value)


def _prepare_dividend_items(raw_items: List[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    normalized_items: List[Dict[str, Any]] = []
    if not raw_items:
        return normalized_items

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        raw_date = item.get("date")
        if not raw_date:
            continue
        try:
            parsed_date = datetime.fromisoformat(str(raw_date)).date()
        except ValueError:
            continue
        amount = _safe_float(item.get("amount"))
        if amount is None or amount <= 0:
            continue
        normalized_items.append({
            "date": parsed_date.isoformat(),
            "amount": round(amount, 4),
        })

    normalized_items.sort(key=lambda item: item["date"])
    return normalized_items


def _compute_dividend_metrics(
    dividend_items: List[Dict[str, Any]] | None,
    *,
    last_price: Any,
    reference_date: Optional[date] = None,
) -> Dict[str, Any]:
    prepared_items = _prepare_dividend_items(dividend_items)
    now_date = reference_date or datetime.now().date()
    price = _safe_float(last_price)

    result: Dict[str, Any] = {
        "dividend_items": prepared_items,
        "next_dividend": None,
        "last_dividend": None,
        "next_dividend_date": None,
        "last_dividend_date": None,
        "next_dividend_amount": None,
        "next_dividend_yield": None,
        "forward_dividend_yield": None,
        "trailing_dividend_yield": None,
        "dividend_yield": None,
    }

    if not prepared_items or price is None or price <= 0:
        return result

    future_items = [
        item for item in prepared_items
        if datetime.fromisoformat(item["date"]).date() >= now_date
    ]
    past_items = [
        item for item in prepared_items
        if datetime.fromisoformat(item["date"]).date() < now_date
    ]

    next_dividend = future_items[0] if future_items else None
    last_dividend = past_items[-1] if past_items else None
    trailing_cutoff = now_date - timedelta(days=365)
    forward_cutoff = now_date + timedelta(days=365)

    trailing_sum = sum(
        item["amount"]
        for item in past_items
        if datetime.fromisoformat(item["date"]).date() >= trailing_cutoff
    )
    forward_sum = sum(
        item["amount"]
        for item in future_items
        if datetime.fromisoformat(item["date"]).date() <= forward_cutoff
    )

    next_yield = round((next_dividend["amount"] / price) * 100.0, 2) if next_dividend else None
    trailing_yield = round((trailing_sum / price) * 100.0, 2) if trailing_sum > 0 else None
    forward_yield = round((forward_sum / price) * 100.0, 2) if forward_sum > 0 else None
    yield_candidates = [value for value in (forward_yield, trailing_yield) if value is not None]
    safe_yield = max(yield_candidates) if yield_candidates else None

    result.update({
        "next_dividend": next_dividend,
        "last_dividend": last_dividend,
        "next_dividend_date": next_dividend["date"] if next_dividend else None,
        "last_dividend_date": last_dividend["date"] if last_dividend else None,
        "next_dividend_amount": next_dividend["amount"] if next_dividend else None,
        "next_dividend_yield": next_yield,
        "forward_dividend_yield": forward_yield,
        "trailing_dividend_yield": trailing_yield,
        "dividend_yield": safe_yield,
    })
    return result


THEME_OVERRIDES: Dict[str, List[str]] = {
    "AKBNK": ["faiz", "banka", "ic_talep"],
    "GARAN": ["faiz", "banka", "ic_talep"],
    "HALKB": ["faiz", "banka", "ic_talep"],
    "ISCTR": ["faiz", "banka", "ic_talep"],
    "TSKB": ["faiz", "banka"],
    "VAKBN": ["faiz", "banka", "ic_talep"],
    "YKBNK": ["faiz", "banka", "ic_talep"],
    "TUPRS": ["enerji", "emtia", "ihracat"],
    "PETKM": ["emtia", "enerji", "ihracat"],
    "EREGL": ["emtia", "ihracat", "sanayi"],
    "KRDMD": ["emtia", "sanayi"],
    "BRSAN": ["sanayi", "ihracat"],
    "FROTO": ["otomotiv", "ihracat", "sanayi"],
    "TOASO": ["otomotiv", "ic_talep", "sanayi"],
    "ARCLK": ["dayanikli_tuketim", "ihracat", "ic_talep"],
    "VESTL": ["dayanikli_tuketim", "ihracat"],
    "PGSUS": ["ulasim", "turizm", "enerji_hassasi"],
    "THYAO": ["ulasim", "turizm", "enerji_hassasi"],
    "TCELL": ["savunmaci", "telekom", "ic_talep"],
    "TTKOM": ["savunmaci", "telekom", "ic_talep"],
    "BIMAS": ["savunmaci", "perakende", "ic_talep"],
    "MGROS": ["savunmaci", "perakende", "ic_talep"],
    "AEFES": ["savunmaci", "tuketim", "ic_talep"],
    "CCOLA": ["savunmaci", "tuketim", "ihracat"],
    "ENKAI": ["savunmaci", "taahhut", "doviz"],
    "ASELS": ["savunma", "doviz", "ihracat"],
    "SASA": ["buyume", "emtia", "sanayi"],
    "HEKTS": ["buyume", "tarim", "emtia"],
    "PASEU": ["lojistik", "dis_ticaret", "buyume"],
    "KONTR": ["buyume", "enerji", "altyapi"],
    "ALARK": ["enerji", "altyapi", "taahhut"],
}

THEME_LABELS: Dict[str, str] = {
    "faiz": "faiz hassasi",
    "banka": "banka",
    "ic_talep": "ic talep",
    "enerji": "enerji",
    "emtia": "emtia",
    "ihracat": "ihracat",
    "sanayi": "sanayi",
    "otomotiv": "otomotiv",
    "dayanikli_tuketim": "dayanikli tuketim",
    "ulasim": "ulasim",
    "turizm": "turizm",
    "enerji_hassasi": "petrol hassasi",
    "savunmaci": "savunmaci",
    "telekom": "telekom",
    "perakende": "perakende",
    "tuketim": "tuketim",
    "taahhut": "taahhut",
    "doviz": "doviz geliri",
    "savunma": "savunma",
    "buyume": "buyume",
    "tarim": "tarim",
    "lojistik": "lojistik",
    "dis_ticaret": "dis ticaret",
    "altyapi": "altyapi",
}

THEME_CONTRASTS: List[tuple[str, str, str]] = [
    ("faiz", "buyume", "Biri faiz hassasi, digeri buyume temasi tasiyor; rejim degistikce farkli yone acilabiliyorlar."),
    ("banka", "emtia", "Banka ve emtia temalari farkli makro kosullarda ayrisiyor."),
    ("enerji_hassasi", "savunmaci", "Enerji/petrol hassasiyeti ile savunmaci tema ayni iklimde farkli tepki verebiliyor."),
    ("ihracat", "ic_talep", "Ihracat hikayesi ile ic talep hikayesi ayni donemlerde farkli calisabiliyor."),
    ("enerji", "telekom", "Enerji dongusu ile telekom savunmaci karakteri portfoyde farkli davraniyor."),
    ("otomotiv", "perakende", "Otomotiv ve perakende tema olarak farkli finansman ve talep rejimlerine bagli."),
]

OPPOSITE_WINDOW_CONFIG: Dict[str, Dict[str, Any]] = {
    "1m": {
        "label": "1A",
        "series_key": "daily_returns",
        "cutoff_days": 31,
        "min_obs": 16,
        "opposite_min": 0.48,
        "corr_soft_cap": 0.18,
        "score_floor": 34,
        "description": "Gunluk getirilerde son 1 ay davranissal ayrisma",
    },
    "1y": {
        "label": "1Y",
        "series_key": "weekly_returns",
        "cutoff_days": 365,
        "min_obs": 28,
        "opposite_min": 0.46,
        "corr_soft_cap": 0.22,
        "score_floor": 33,
        "description": "Haftalik getirilerde son 1 yil orta vadeli ayrisma",
    },
    "2y": {
        "label": "2Y",
        "series_key": "weekly_returns",
        "cutoff_days": 730,
        "min_obs": 52,
        "opposite_min": 0.45,
        "corr_soft_cap": 0.24,
        "score_floor": 32,
        "description": "Haftalik getirilerde son 2 yil yapisal ayrisma",
    },
    "5y": {
        "label": "5Y",
        "series_key": "weekly_returns",
        "cutoff_days": 1825,
        "min_obs": 104,
        "opposite_min": 0.42,
        "corr_soft_cap": 0.26,
        "score_floor": 32,
        "description": "Haftalik getirilerde son 5 yil yapisal ayrisma",
    },
}


def _infer_stock_themes(symbol: str, name: str = "", sector: str = "", industry: str = "") -> List[str]:
    themes = set(THEME_OVERRIDES.get(symbol.upper(), []))
    haystack = _normalize_search_text(f"{name} {sector} {industry}")

    keyword_map = {
        "banka": ["bank", "banka", "katilim"],
        "faiz": ["bank", "banka", "katilim", "leasing", "faktoring"],
        "telekom": ["telekom", "iletisim", "gsm"],
        "savunmaci": ["gida", "icecek", "perakende", "telekom", "market"],
        "enerji": ["enerji", "petrol", "dogalgaz", "rafineri"],
        "emtia": ["demir", "celik", "maden", "metal", "petrokimya", "rafineri"],
        "ihracat": ["otomotiv", "celik", "savunma", "havacilik", "ihracat"],
        "ic_talep": ["perakende", "market", "gida", "banka", "telekom"],
        "ulasim": ["hava", "ulasim", "havayolu", "tasimacilik"],
        "turizm": ["turizm", "otel", "hava"],
        "perakende": ["perakende", "market", "magaza"],
        "tuketim": ["icecek", "gida", "tuketim"],
        "savunma": ["savunma", "aerospace", "havacilik"],
        "altyapi": ["altyapi", "insaat", "taahhut", "enerji"],
        "lojistik": ["lojistik", "tasimacilik", "kargo"],
    }

    for theme, keywords in keyword_map.items():
        if any(keyword in haystack for keyword in keywords):
            themes.add(theme)

    return sorted(themes)


# Safe wrappers for TradingView-backed borsapy calls
@retry_external_service("borsapy")
def _safe_ta_signals_wrapper(ticker):
    return ticker.ta_signals()

# =============================================
# Global Stock Data Cache
# =============================================

class BISTDataStore:
    """
    In-memory store for all BIST stock data.
    Background thread refreshes all stocks continuously.
    """
    
    def __init__(self):
        self._lock = threading.Lock()
        self._stocks: Dict[str, Dict[str, Any]] = {}  # symbol -> stock data
        self._all_symbols: List[str] = []
        self._symbol_names: Dict[str, str] = {}
        self._metadata_dir = Path(__file__).resolve().parent.parent / "storage" / "metadata"
        self._metadata_cache: Dict[str, Dict[str, Any]] = {}
        self._tracked_universe_index = "ALL"
        self._tracked_universe_label = "Tum BIST"
        self._last_full_refresh: Optional[datetime] = None
        self._refresh_in_progress = False
        self._usd_try_rate = 36.0
        self._refresh_thread: Optional[threading.Thread] = None
        self._stop_refresh = False
        self._priority_symbols: Dict[str, int] = {}
        self._priority_labels: Dict[str, str] = {}
        self._upcoming_dividends_cache: Dict[str, Any] | None = None
        self._upcoming_dividends_cached_at: Optional[datetime] = None
        self._upcoming_dividends_scan_in_progress = False
        self._analysis_overview_cache: Dict[str, Dict[str, Any]] = {}
        self._analysis_overview_cached_at: Dict[str, datetime] = {}
        self._opposite_stocks_cache: Dict[str, Dict[str, Any]] = {}
        self._opposite_stocks_cached_at: Dict[str, datetime] = {}
        self._opposite_stocks_scan_in_progress: Dict[str, bool] = {}
        self._opposite_prewarm_started_at: Optional[datetime] = None
        self._opposite_prewarm_in_progress = False

    def _load_symbol_metadata(self, symbol: str) -> Dict[str, Any]:
        normalized_symbol = str(symbol or "").strip().upper()
        if not normalized_symbol:
            return {}
        cached = self._metadata_cache.get(normalized_symbol)
        if cached is not None:
            return cached

        metadata_path = self._metadata_dir / f"{normalized_symbol}.json"
        if not metadata_path.exists():
            self._metadata_cache[normalized_symbol] = {}
            return {}

        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            metadata = {}

        self._metadata_cache[normalized_symbol] = metadata
        return metadata

    def _hydrate_snapshot_stock(self, stock: Dict[str, Any], global_reference: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        enriched = dict(stock)
        metadata = self._load_symbol_metadata(str(stock.get("symbol") or ""))
        if metadata:
            for field_name in (
                "dividend_yield",
                "market_cap",
                "pe_ratio",
                "pb_ratio",
                "foreign_ratio",
                "shares_outstanding",
                "sector",
                "industry",
                "description",
                "website",
            ):
                if enriched.get(field_name) in (None, "", []):
                    enriched[field_name] = metadata.get(field_name)

            if enriched.get("pe") is None and metadata.get("pe_ratio") is not None:
                enriched["pe"] = metadata.get("pe_ratio")
            if enriched.get("pb") is None and metadata.get("pb_ratio") is not None:
                enriched["pb"] = metadata.get("pb_ratio")
            if enriched.get("name") in (None, "", enriched.get("symbol")):
                enriched["name"] = metadata.get("name") or enriched.get("name")

        if (
            enriched.get("adil_deger") in (None, {}, [])
            or enriched.get("dividend_yield") in (None, "", [])
            or enriched.get("temettu_guven_skoru") is None
        ):
            try:
                reference = global_reference or get_global_reference_snapshot()
                enriched.update(compute_proprietary_scores(enriched, reference))
            except Exception:
                pass

        dividend_metrics = _compute_dividend_metrics(
            enriched.get("dividends"),
            last_price=enriched.get("last"),
        )
        if dividend_metrics.get("dividend_yield") is not None:
            enriched["dividend_yield"] = dividend_metrics["dividend_yield"]
        if dividend_metrics.get("next_dividend_yield") is not None:
            enriched["next_dividend_yield"] = dividend_metrics["next_dividend_yield"]
        if dividend_metrics.get("forward_dividend_yield") is not None:
            enriched["forward_dividend_yield"] = dividend_metrics["forward_dividend_yield"]
        if dividend_metrics.get("trailing_dividend_yield") is not None:
            enriched["trailing_dividend_yield"] = dividend_metrics["trailing_dividend_yield"]
        if dividend_metrics.get("next_dividend_date"):
            enriched["next_dividend_date"] = dividend_metrics["next_dividend_date"]
            enriched["next_dividend_amount"] = dividend_metrics.get("next_dividend_amount")
            enriched["calendar"] = dict(enriched.get("calendar") or {})
            enriched["calendar"]["dividend_date"] = dividend_metrics["next_dividend_date"]
            enriched["calendar"]["ex_dividend_date"] = dividend_metrics["next_dividend_date"]
        elif not enriched.get("next_dividend_date"):
            enriched.pop("next_dividend_date", None)
            enriched.pop("next_dividend_amount", None)
            if isinstance(enriched.get("calendar"), dict):
                enriched["calendar"].pop("dividend_date", None)
                enriched["calendar"].pop("ex_dividend_date", None)
        if dividend_metrics.get("last_dividend_date"):
            enriched["last_dividend_date"] = dividend_metrics["last_dividend_date"]

        return enriched
        
    def get_stock(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get cached stock data"""
        normalized_symbol = symbol.upper()
        with self._lock:
            stock = self._stocks.get(normalized_symbol)
        if stock:
            enriched = self._ensure_proprietary_fields(stock)
            snapshot = load_latest_bist_proprietary_snapshot() or {}
            snapshot_stocks = {
                str(item.get("symbol") or "").upper(): item
                for item in snapshot.get("stocks", [])
                if item.get("symbol")
            }
            return self._attach_data_status(
                enriched,
                has_live_data=True,
                has_snapshot_data=normalized_symbol in snapshot_stocks,
            )

        snapshot = load_latest_bist_proprietary_snapshot() or {}
        snapshot_stocks = {
            str(item.get("symbol") or "").upper(): item
            for item in snapshot.get("stocks", [])
            if item.get("symbol")
        }
        snapshot_stock = snapshot_stocks.get(normalized_symbol)
        if snapshot_stock:
            enriched = self._hydrate_snapshot_stock(snapshot_stock)
            return self._attach_data_status(
                enriched,
                has_live_data=False,
                has_snapshot_data=True,
            )

        if normalized_symbol in self.get_symbols():
            return self._build_registered_only_stock(normalized_symbol)
        return None
    
    def get_all_stocks(self) -> List[Dict[str, Any]]:
        """Get all cached stocks"""
        with self._lock:
            stocks = list(self._stocks.values())
        return self._ensure_proprietary_fields_for_many(stocks)

    def get_all_stocks_or_snapshot(self) -> tuple[List[Dict[str, Any]], bool]:
        """Return merged universe with live, snapshot and registered-only rows."""
        with self._lock:
            live_stocks = {symbol.upper(): data for symbol, data in self._stocks.items()}

        snapshot = load_latest_bist_proprietary_snapshot() or {}
        snapshot_stocks = {
            str(item.get("symbol") or "").upper(): item
            for item in snapshot.get("stocks", [])
            if item.get("symbol")
        }

        if not live_stocks and snapshot_stocks:
            snapshot_only_rows = [
                self._attach_data_status(
                    dict(stock),
                    has_live_data=False,
                    has_snapshot_data=True,
                )
                for stock in snapshot_stocks.values()
            ]
            snapshot_only_rows.sort(
                key=lambda stock: (
                    int(stock.get("scan_priority_rank") or self._priority_symbols.get(str(stock.get("symbol") or "").upper(), 99) or 99),
                    str(stock.get("symbol") or ""),
                )
            )
            return snapshot_only_rows, True

        # If we already have live rows but no saved snapshot yet, return the live cache
        # immediately instead of triggering an expensive universe load via screen_stocks().
        if live_stocks and not snapshot_stocks:
            live_rows = [
                self._attach_data_status(
                    self._ensure_proprietary_fields(dict(stock)),
                    has_live_data=True,
                    has_snapshot_data=False,
                )
                for stock in live_stocks.values()
            ]
            live_rows.sort(
                key=lambda stock: (
                    int(stock.get("scan_priority_rank") or self._priority_symbols.get(str(stock.get("symbol") or "").upper(), 99) or 99),
                    str(stock.get("symbol") or ""),
                )
            )
            return live_rows, False

        universe_symbols = self.get_symbols()
        if not universe_symbols:
            universe_symbols = sorted(set(snapshot_stocks.keys()) | set(live_stocks.keys()))
        merged: List[Dict[str, Any]] = []

        for symbol in universe_symbols:
            live_stock = live_stocks.get(symbol)
            snapshot_stock = snapshot_stocks.get(symbol)
            if live_stock:
                merged_stock = self._merge_live_and_snapshot_stock(live_stock, snapshot_stock)
                enriched = self._ensure_proprietary_fields(merged_stock)
                merged.append(
                    self._attach_data_status(
                        enriched,
                        has_live_data=True,
                        has_snapshot_data=snapshot_stock is not None,
                    )
                )
                continue
            if snapshot_stock:
                merged.append(
                    self._attach_data_status(
                        dict(snapshot_stock),
                        has_live_data=False,
                        has_snapshot_data=True,
                    )
                )
                continue
            merged.append(self._build_registered_only_stock(symbol))

        used_snapshot = not bool(live_stocks) and bool(snapshot_stocks)
        return merged, used_snapshot

    def _build_registered_only_stock(self, symbol: str) -> Dict[str, Any]:
        return {
            "symbol": symbol,
            "name": self.get_symbol_name(symbol),
            "scan_priority_rank": self._priority_symbols.get(symbol, 99),
            "data_status": "registered_only",
            "data_status_label": "Sadece kayit",
            "has_live_data": False,
            "has_snapshot_data": False,
            "is_registered_symbol": True,
            "search_match_source": "universe",
        }

    def _merge_live_and_snapshot_stock(
        self,
        live_stock: Dict[str, Any],
        snapshot_stock: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Keep live market fields but inherit richer proprietary fields from snapshot when available."""
        if not snapshot_stock:
            return dict(live_stock)

        merged = dict(snapshot_stock)
        merged.update(live_stock)

        # Preserve nested proprietary payloads when live refresh only contains quote-oriented fields.
        for nested_key in ("hakiki_alfa", "signals", "adil_deger", "data_quality", "global_reference"):
            live_value = live_stock.get(nested_key)
            snapshot_value = snapshot_stock.get(nested_key)
            if isinstance(snapshot_value, dict):
                if isinstance(live_value, dict):
                    nested = dict(snapshot_value)
                    nested.update(live_value)
                    merged[nested_key] = nested
                elif live_value in (None, "", []):
                    merged[nested_key] = snapshot_value
            elif live_value in (None, "", []):
                merged[nested_key] = snapshot_value

        # If live refresh came back sparse, keep the last known score/action fields from snapshot.
        inherited_fields = (
            "firsat_skoru",
            "trade_skoru",
            "uzun_vade_skoru",
            "radar_skoru",
            "portfolio_action",
            "portfolio_action_reason",
            "temettu_guven_skoru",
            "temettu_tuzagi_riski",
            "temettu_takvim_firsati",
            "halka_aciklik_risk_skoru",
            "finansal_dayaniklilik_skoru",
            "sermaye_disiplini_skoru",
            "fair_value_data_band",
            "fair_value_confidence_band",
            "adil_deger_skoru",
        )
        for field_name in inherited_fields:
            if merged.get(field_name) is None and snapshot_stock.get(field_name) is not None:
                merged[field_name] = snapshot_stock.get(field_name)

        if not merged.get("name") and snapshot_stock.get("name"):
            merged["name"] = snapshot_stock.get("name")

        return merged

    def _attach_data_status(
        self,
        stock: Dict[str, Any],
        *,
        has_live_data: bool,
        has_snapshot_data: bool,
    ) -> Dict[str, Any]:
        enriched = dict(stock)
        enriched.setdefault("scan_priority_rank", self._priority_symbols.get(str(stock.get("symbol") or "").upper(), 99))
        enriched["has_live_data"] = has_live_data
        enriched["has_snapshot_data"] = has_snapshot_data
        enriched["is_registered_symbol"] = True
        if has_live_data:
            enriched["data_status"] = "live"
            enriched["data_status_label"] = "Canli"
        elif has_snapshot_data:
            enriched["data_status"] = "snapshot"
            enriched["data_status_label"] = "Son kayit"
        else:
            enriched["data_status"] = "registered_only"
            enriched["data_status_label"] = "Sadece kayit"
        return enriched

    def _ensure_proprietary_fields(self, stock: Dict[str, Any], global_reference: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        required_fields = {
            "halka_aciklik_risk_skoru",
            "finansal_dayaniklilik_skoru",
            "sermaye_disiplini_skoru",
            "fair_value_data_band",
            "fair_value_confidence_band",
            "portfolio_action",
            "temettu_guven_skoru",
        }
        if required_fields.issubset(set(stock.keys())):
            return stock

        try:
            reference = global_reference or get_global_reference_snapshot()
            refreshed = dict(stock)
            refreshed.update(compute_proprietary_scores(refreshed, reference))
            return refreshed
        except Exception:
            return stock

    def _ensure_proprietary_fields_for_many(self, stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not stocks:
            return stocks

        missing_any = any(
            "halka_aciklik_risk_skoru" not in stock
            or "finansal_dayaniklilik_skoru" not in stock
            or "sermaye_disiplini_skoru" not in stock
            or "fair_value_data_band" not in stock
            or "fair_value_confidence_band" not in stock
            or "portfolio_action" not in stock
            or "temettu_guven_skoru" not in stock
            for stock in stocks
        )
        if not missing_any:
            return stocks

        try:
            reference = get_global_reference_snapshot()
        except Exception:
            reference = None

        return [self._ensure_proprietary_fields(stock, reference) for stock in stocks]
    
    def get_stocks_paginated(self, page: int, limit: int, search: Optional[str] = None) -> Dict[str, Any]:
        """Get paginated stock list from cache"""
        stocks, used_snapshot = self.get_all_stocks_or_snapshot()
        with self._lock:
            loaded_count = len(self._stocks)

        snapshot_loaded_count = len(stocks) if used_snapshot else loaded_count
        universe_total = len(self.get_symbols()) or len(stocks)
        
        # Filter by search
        if search:
            search_lower = _normalize_search_text(search)
            filtered_stocks = []
            for stock in stocks:
                normalized_symbol = _normalize_search_text(stock.get('symbol', ''))
                normalized_name = _normalize_search_text(stock.get('name', ''))
                symbol_match = search_lower in normalized_symbol
                name_match = search_lower in normalized_name
                if not symbol_match and not name_match:
                    continue
                enriched = dict(stock)
                if normalized_symbol == search_lower:
                    enriched["search_match_source"] = "symbol_exact"
                elif normalized_symbol.startswith(search_lower):
                    enriched["search_match_source"] = "symbol_prefix"
                elif symbol_match:
                    enriched["search_match_source"] = "symbol"
                elif normalized_name.startswith(search_lower):
                    enriched["search_match_source"] = "name_prefix"
                else:
                    enriched["search_match_source"] = "name"
                filtered_stocks.append(enriched)
            stocks = filtered_stocks

        match_priority = {
            "symbol_exact": 0,
            "symbol_prefix": 1,
            "symbol": 2,
            "name_prefix": 3,
            "name": 4,
            "universe": 5,
        }

        stocks.sort(
            key=lambda stock: (
                match_priority.get(str(stock.get("search_match_source") or ""), 9),
                int(stock.get("scan_priority_rank") or self._priority_symbols.get(str(stock.get("symbol") or "").upper(), 99) or 99),
                str(stock.get("symbol") or ""),
            )
        )
        
        total = len(stocks)
        total_pages = (total + limit - 1) // limit if limit > 0 else 1
        
        # Paginate
        start = (page - 1) * limit
        end = start + limit
        page_stocks = stocks[start:end]
        
        return {
            "results": page_stocks,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": total_pages,
            "loaded_count": snapshot_loaded_count,
            "universe_total": universe_total,
            "search_applied": bool(search),
            "last_refresh": self._last_full_refresh.isoformat() if self._last_full_refresh else None,
            "refresh_in_progress": self._refresh_in_progress,
            "used_snapshot_fallback": used_snapshot,
            "live_count": loaded_count,
        }
    
    def get_symbols(self) -> List[str]:
        """Get all symbols"""
        if not self._all_symbols:
            snapshot = load_latest_bist_proprietary_snapshot() or {}
            snapshot_symbols = sorted(
                {
                    str(item.get("symbol") or "").strip().upper()
                    for item in snapshot.get("stocks", [])
                    if item.get("symbol")
                }
            )
            if snapshot_symbols:
                self._all_symbols = snapshot_symbols
                for item in snapshot.get("stocks", []):
                    symbol = str(item.get("symbol") or "").strip().upper()
                    name = str(item.get("name") or "").strip()
                    if symbol and name and symbol not in self._symbol_names:
                        self._symbol_names[symbol] = name
        if not self._all_symbols:
            self._load_symbols()
        return self._all_symbols
    
    def get_symbol_name(self, symbol: str) -> str:
        """Get company name"""
        return self._symbol_names.get(symbol, symbol)
    
    def _load_symbols(self):
        """Load all BIST symbols from borsapy."""
        try:
            df = bp.screen_stocks()
            if df is not None and not df.empty:
                for _, row in df.iterrows():
                    symbol = str(row['symbol']).strip().upper()
                    self._symbol_names[symbol] = row.get('name', symbol)
                self._build_priority_map()
                self._all_symbols = [str(symbol).strip().upper() for symbol in df['symbol'].tolist()]
                logger.info(f"[BISTStore] Loaded {len(self._all_symbols)} symbols")
        except Exception as e:
            logger.exception("[BISTStore] Error loading symbols", extra={"error": str(e)})

    def _build_priority_map(self):
        """Build BIST priority tiers so refresh starts with XU030, then XU050, then XU100."""
        priority_map: Dict[str, int] = {}
        priority_labels: Dict[str, str] = {}

        index_tiers = [
            ("XU030", 1, "BIST 30"),
            ("XU050", 2, "BIST 50"),
            ("XU100", 3, "BIST 100"),
        ]

        for index_symbol, priority, label in index_tiers:
            try:
                components = get_index_components(index_symbol)
            except Exception:
                components = []

            for component in components or []:
                symbol = str(component.get("symbol") or "").strip().upper()
                if not symbol:
                    continue
                existing_priority = priority_map.get(symbol)
                if existing_priority is None or priority < existing_priority:
                    priority_map[symbol] = priority
                    priority_labels[symbol] = label

        self._priority_symbols = priority_map
        self._priority_labels = priority_labels

    def _get_prioritized_symbols(self) -> List[str]:
        symbols = self.get_symbols()
        return sorted(
            symbols,
            key=lambda symbol: (
                self._priority_symbols.get(symbol, 99),
                symbol,
            ),
        )

    def _refresh_stage_for_symbol(self, symbol: str) -> tuple[str, str]:
        priority_rank = self._priority_symbols.get(symbol, 99)
        if priority_rank == 1:
            return "XU030", "BIST 30"
        if priority_rank == 2:
            return "XU050", "BIST 50"
        if priority_rank == 3:
            return "XU100", "BIST 100"
        return "ALL", "Tum BIST"

    def _get_opposite_stock_candidates(self, limit: int = 90) -> List[Dict[str, Any]]:
        stocks, _ = self.get_all_stocks_or_snapshot()
        if stocks:
            def _market_cap_value(stock: Dict[str, Any]) -> float:
                market_cap = _safe_float(stock.get("market_cap"))
                if market_cap is not None:
                    return market_cap
                market_cap_usd = _safe_float(stock.get("market_cap_usd"))
                if market_cap_usd is not None:
                    return market_cap_usd * 1_000_000_000
                return 0.0

            candidates = [
                stock for stock in stocks
                if stock.get("symbol")
                and stock.get("data_status") != "registered_only"
            ]
            candidates.sort(
                key=lambda stock: (
                    int(stock.get("scan_priority_rank") or 99),
                    -_market_cap_value(stock),
                    str(stock.get("symbol") or ""),
                )
            )
            if candidates:
                return candidates[: max(20, min(limit, len(candidates)))]

        fallback_candidates: List[Dict[str, Any]] = []
        for symbol in self._get_prioritized_symbols()[: max(20, limit)]:
            fallback_candidates.append(
                {
                    "symbol": symbol,
                    "name": self.get_symbol_name(symbol),
                    "sector": "",
                    "data_status": "registered_only",
                    "scan_priority_rank": self._priority_symbols.get(symbol, 99),
                }
            )
        return fallback_candidates

    def _get_long_term_history_snapshot(self, symbol: str) -> Optional[Dict[str, Any]]:
        try:
            ticker = bp.Ticker(symbol)
            history = ticker.history(period="5y")
        except Exception:
            return None

        if history is None or history.empty or "Close" not in history.columns:
            return None

        close_series = history["Close"].dropna()
        if close_series.empty or len(close_series) < 180:
            return None

        try:
            close_series.index = pd.to_datetime(close_series.index).tz_localize(None)
        except TypeError:
            close_series.index = pd.to_datetime(close_series.index)

        daily_returns = close_series.pct_change().dropna()
        if len(daily_returns) < 60:
            return None

        weekly_close = close_series.resample("W-FRI").last().dropna()
        if len(weekly_close) < 80:
            return None

        weekly_returns = weekly_close.pct_change().dropna()
        if len(weekly_returns) < 70:
            return None

        monthly_close = close_series.resample("ME").last().dropna()
        monthly_returns = monthly_close.pct_change().dropna()
        if len(monthly_returns) < 24:
            return None

        def _total_return_percent(series: pd.Series) -> float:
            if series is None or series.empty:
                return 0.0
            first = _safe_float(series.iloc[0])
            last = _safe_float(series.iloc[-1])
            if not first or first <= 0 or last is None:
                return 0.0
            return round(((last / first) - 1) * 100, 2)

        def _window_series(series: pd.Series, cutoff_days: int) -> pd.Series:
            cutoff = pd.Timestamp.now().normalize() - pd.Timedelta(days=cutoff_days)
            return series[series.index >= cutoff]

        return {
            "symbol": symbol,
            "close_series": close_series,
            "daily_returns": daily_returns,
            "weekly_returns": weekly_returns,
            "monthly_returns": monthly_returns,
            "return_1m_pct": _total_return_percent(close_series[close_series.index >= (pd.Timestamp.now().normalize() - pd.Timedelta(days=31))]),
            "return_1y_pct": _total_return_percent(weekly_close[weekly_close.index >= (pd.Timestamp.now().normalize() - pd.Timedelta(days=365))]),
            "return_2y_pct": _total_return_percent(weekly_close[weekly_close.index >= (pd.Timestamp.now().normalize() - pd.Timedelta(days=730))]),
            "return_5y_pct": _total_return_percent(weekly_close),
            "window_daily_1m": _window_series(daily_returns, 31),
            "window_weekly_1y": _window_series(weekly_returns, 365),
            "window_weekly_2y": _window_series(weekly_returns, 730),
            "window_weekly_5y": weekly_returns,
        }

    def get_opposite_stocks(
        self,
        *,
        force: bool = False,
        pair_limit: int = 12,
        candidate_limit: int = 90,
        full_scan: bool = False,
        allow_background: bool = True,
        window: str = "2y",
    ) -> Dict[str, Any]:
        normalized_window = str(window or "2y").lower()
        config = OPPOSITE_WINDOW_CONFIG.get(normalized_window, OPPOSITE_WINDOW_CONFIG["2y"])
        now = datetime.now()
        scan_key = f"{'full' if full_scan else 'priority'}:{normalized_window}"
        cached_result = self._opposite_stocks_cache.get(scan_key)
        cached_at = self._opposite_stocks_cached_at.get(scan_key)
        cache_fresh = (
            cached_result is not None
            and cached_at is not None
            and cached_at >= (now - timedelta(hours=24 if full_scan else 12))
            and (
                self._last_full_refresh is None
                or cached_at >= self._last_full_refresh
            )
        )
        if not force and cache_fresh:
            return cached_result

        if self._opposite_stocks_scan_in_progress.get(scan_key):
            if cached_result is not None:
                return {
                    **cached_result,
                    "scan_in_progress": True,
                }
            return {
                "results": [],
                "total": 0,
                "scanned_symbols": 0,
                "candidate_limit": len(self.get_symbols()) if full_scan else candidate_limit,
                "generated_at": None,
                "window_label": config["label"],
                "basis": config["description"],
                "scan_mode": scan_key,
                "scan_in_progress": True,
            }

        if allow_background and not force:
            self._start_opposite_scan_background(scan_key=scan_key, pair_limit=pair_limit, candidate_limit=candidate_limit, full_scan=full_scan, window=normalized_window)
            if full_scan:
                self._maybe_start_opposite_prewarm()
            if cached_result is not None:
                return {
                    **cached_result,
                    "scan_in_progress": True,
                }
            return {
                "results": [],
                "total": 0,
                "scanned_symbols": 0,
                "candidate_limit": len(self.get_symbols()) if full_scan else candidate_limit,
                "generated_at": None,
                "window_label": config["label"],
                "basis": config["description"],
                "scan_mode": scan_key,
                "scan_in_progress": True,
            }

        self._opposite_stocks_scan_in_progress[scan_key] = True
        try:
            if full_scan:
                candidates = [
                    {
                        "symbol": symbol,
                        "name": self.get_symbol_name(symbol),
                        "sector": "",
                        "industry": "",
                        "data_status": "registered_only",
                        "scan_priority_rank": self._priority_symbols.get(symbol, 99),
                    }
                    for symbol in self.get_symbols()
                ]
                effective_candidate_limit = len(candidates)
            else:
                effective_candidate_limit = candidate_limit
                candidates = self._get_opposite_stock_candidates(limit=effective_candidate_limit)
            history_map: Dict[str, Dict[str, Any]] = {}

            for stock in candidates:
                symbol = str(stock.get("symbol") or "").upper()
                if not symbol:
                    continue
                snapshot = self._get_long_term_history_snapshot(symbol)
                if snapshot is None:
                    continue
                history_map[symbol] = {
                    **snapshot,
                    "name": stock.get("name") or symbol,
                    "sector": stock.get("sector") or "",
                    "industry": stock.get("industry") or "",
                    "themes": _infer_stock_themes(
                        symbol,
                        str(stock.get("name") or symbol),
                        str(stock.get("sector") or ""),
                        str(stock.get("industry") or ""),
                    ),
                    "data_status": stock.get("data_status") or "snapshot",
                }
                time.sleep(0.1)

            pairs: List[Dict[str, Any]] = []
            symbols = sorted(history_map.keys())

            def _strength_label(score: float) -> str:
                if score >= 72:
                    return "Cok guclu"
                if score >= 58:
                    return "Guclu"
                if score >= 45:
                    return "Orta"
                return "Zayif"

            def _stability_label(score: float) -> str:
                if score >= 82:
                    return "Yuksek"
                if score >= 64:
                    return "Dengeli"
                if score >= 46:
                    return "Degisken"
                return "Zayif"

            def _build_reason(
                left_item: Dict[str, Any],
                right_item: Dict[str, Any],
                *,
                corr_2y_value: float,
                corr_5y_value: float,
                opposite_2y_value: float,
                opposite_5y_value: float,
                window_ratio_value: float,
                window_name: str,
            ) -> str:
                left_sector = str(left_item.get("sector") or "").strip()
                right_sector = str(right_item.get("sector") or "").strip()
                left_themes = set(left_item.get("themes") or [])
                right_themes = set(right_item.get("themes") or [])
                for left_theme, right_theme, message in THEME_CONTRASTS:
                    if (left_theme in left_themes and right_theme in right_themes) or (right_theme in left_themes and left_theme in right_themes):
                        return message
                if left_sector and right_sector and left_sector != right_sector:
                    return f"Sektorleri farkli; {left_sector} ile {right_sector} ayni ayda sik sik ayri yone dagiliyor."
                if left_item["return_2y_pct"] * right_item["return_2y_pct"] < 0:
                    return "Son 2 yilda biri guclenirken digerinin zayiflama egilimi belirgin."
                if window_name == "1A" and window_ratio_value >= 0.55:
                    return "Son aylarda farkli ritimle ilerliyorlar; ayni gunlerde ters kapanis sikligi yuksek."
                if corr_5y_value <= 0.05 and corr_2y_value <= 0.10:
                    return "Uzun donemde ayni yone kilitlenmiyorlar; iliski gevsek ve ayrismaya acik."
                if opposite_2y_value >= 0.58 or opposite_5y_value >= 0.55:
                    return "Aylik bazda sik sik ters yonlu kapanis yapiyorlar."
                return "Uzun donemde getiri ritimleri birbirini dengelemeye yakin."

            for left_symbol, right_symbol in combinations(symbols, 2):
                left = history_map[left_symbol]
                right = history_map[right_symbol]
                series_key = {
                    "1m": "window_daily_1m",
                    "1y": "window_weekly_1y",
                    "2y": "window_weekly_2y",
                    "5y": "window_weekly_5y",
                }[normalized_window]

                paired = pd.concat(
                    [left[series_key].rename("left"), right[series_key].rename("right")],
                    axis=1,
                    join="inner",
                ).dropna()
                if len(paired) < int(config["min_obs"]):
                    continue

                corr_window = paired["left"].corr(paired["right"])
                if corr_window is None:
                    continue
                corr_window = float(corr_window)

                opposite_ratio_window = float(
                    (((paired["left"] > 0) & (paired["right"] < 0)) | ((paired["left"] < 0) & (paired["right"] > 0))).mean()
                )

                if opposite_ratio_window < float(config["opposite_min"]) and corr_window > float(config["corr_soft_cap"]):
                    continue

                paired_2y = pd.concat(
                    [left["window_weekly_2y"].rename("left"), right["window_weekly_2y"].rename("right")],
                    axis=1,
                    join="inner",
                ).dropna()
                paired_5y = pd.concat(
                    [left["window_weekly_5y"].rename("left"), right["window_weekly_5y"].rename("right")],
                    axis=1,
                    join="inner",
                ).dropna()

                corr_2y = float(paired_2y["left"].corr(paired_2y["right"]) or 0.0) if not paired_2y.empty else 0.0
                corr_5y = float(paired_5y["left"].corr(paired_5y["right"]) or 0.0) if not paired_5y.empty else 0.0
                opposite_ratio_2y = float(
                    (((paired_2y["left"] > 0) & (paired_2y["right"] < 0)) | ((paired_2y["left"] < 0) & (paired_2y["right"] > 0))).mean()
                ) if not paired_2y.empty else 0.0
                opposite_ratio_5y = float(
                    (((paired_5y["left"] > 0) & (paired_5y["right"] < 0)) | ((paired_5y["left"] < 0) & (paired_5y["right"] > 0))).mean()
                ) if not paired_5y.empty else 0.0

                return_key = {
                    "1m": "return_1m_pct",
                    "1y": "return_1y_pct",
                    "2y": "return_2y_pct",
                    "5y": "return_5y_pct",
                }[normalized_window]

                sign_bonus = 0.0
                if (left[return_key] or 0.0) * (right[return_key] or 0.0) < 0:
                    sign_bonus += 10.0
                if left["return_2y_pct"] * right["return_2y_pct"] < 0 and normalized_window in {"2y", "5y"}:
                    sign_bonus += 6.0

                divergence_bonus = min(
                    abs((left[return_key] or 0.0) - (right[return_key] or 0.0)) / 12.0,
                    12.0,
                )
                stability_score = max(
                    0.0,
                    100.0
                    - (abs(opposite_ratio_window - max(0.0, -corr_window)) * 65.0)
                    - (abs(corr_2y - corr_5y) * 45.0),
                )
                inverse_score = round(
                    (opposite_ratio_window * (52.0 if normalized_window == "1m" else 46.0))
                    + (max(0.0, float(config["corr_soft_cap"]) - corr_window) * (34.0 if normalized_window == "1m" else 28.0))
                    + sign_bonus
                    + divergence_bonus,
                    2,
                )

                if inverse_score < float(config["score_floor"]):
                    continue

                pairs.append(
                    {
                        "left_symbol": left_symbol,
                        "left_name": left.get("name") or left_symbol,
                        "left_sector": left.get("sector") or "",
                        "left_themes": left.get("themes") or [],
                        "left_return_2y_pct": left["return_2y_pct"],
                        "left_return_5y_pct": left["return_5y_pct"],
                        "right_symbol": right_symbol,
                        "right_name": right.get("name") or right_symbol,
                        "right_sector": right.get("sector") or "",
                        "right_themes": right.get("themes") or [],
                        "right_return_2y_pct": right["return_2y_pct"],
                        "right_return_5y_pct": right["return_5y_pct"],
                        "correlation_2y": round(corr_2y, 3),
                        "correlation_5y": round(corr_5y, 3),
                        "window_correlation": round(corr_window, 3),
                        "opposite_ratio_2y": round(opposite_ratio_2y, 3),
                        "opposite_ratio_5y": round(opposite_ratio_5y, 3),
                        "window_opposite_ratio": round(opposite_ratio_window, 3),
                        "inverse_score": inverse_score,
                        "inverse_strength_label": _strength_label(inverse_score),
                        "stability_score": round(stability_score, 1),
                        "stability_label": _stability_label(stability_score),
                        "why_opposite": _build_reason(
                            left,
                            right,
                            corr_2y_value=corr_2y,
                            corr_5y_value=corr_5y,
                            opposite_2y_value=opposite_ratio_2y,
                            opposite_5y_value=opposite_ratio_5y,
                            window_ratio_value=opposite_ratio_window,
                            window_name=str(config["label"]),
                        ),
                        "observation_count_2y": int(len(paired_2y)),
                        "observation_count_5y": int(len(paired_5y)),
                        "observation_count_window": int(len(paired)),
                        "thesis": (
                            f"{left_symbol} ile {right_symbol} {config['label']} penceresinde sik sik zit yone hareket ediyor."
                        ),
                    }
                )

            pairs.sort(
                key=lambda item: (
                    -(item.get("inverse_score") or 0),
                    item.get("correlation_5y") or 0,
                    item.get("correlation_2y") or 0,
                )
            )

            result = {
                "results": pairs[: max(1, pair_limit)],
                "total": len(pairs),
                "scanned_symbols": len(history_map),
                "candidate_limit": effective_candidate_limit,
                "generated_at": now.isoformat(),
                "window_label": config["label"],
                "basis": config["description"],
                "scan_mode": scan_key,
                "scan_in_progress": False,
            }

            self._opposite_stocks_cache[scan_key] = result
            self._opposite_stocks_cached_at[scan_key] = now
            return result
        finally:
            self._opposite_stocks_scan_in_progress[scan_key] = False

    def _start_opposite_scan_background(
        self,
        *,
        scan_key: str,
        pair_limit: int,
        candidate_limit: int,
        full_scan: bool,
        window: str,
    ) -> None:
        if self._opposite_stocks_scan_in_progress.get(scan_key):
            return

        def _runner():
            try:
                self.get_opposite_stocks(
                    force=True,
                    pair_limit=pair_limit,
                    candidate_limit=candidate_limit,
                    full_scan=full_scan,
                    allow_background=False,
                    window=window,
                )
            except Exception as exc:
                logger.exception("[BISTStore] Opposite stock background scan error", extra={"scan_key": scan_key, "error": str(exc)})

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()

    def _maybe_start_opposite_prewarm(self) -> None:
        now = datetime.now()
        if self._opposite_prewarm_in_progress:
            return
        if self._opposite_prewarm_started_at and self._opposite_prewarm_started_at >= (now - timedelta(hours=24)):
            return

        self._opposite_prewarm_in_progress = True
        self._opposite_prewarm_started_at = now

        def _runner():
            try:
                for window in ("1m", "1y", "2y", "5y"):
                    try:
                        self.get_opposite_stocks(
                            force=False,
                            pair_limit=12,
                            candidate_limit=150,
                            full_scan=True,
                            allow_background=False,
                            window=window,
                        )
                    except Exception as exc:
                        logger.exception("[BISTStore] Opposite stock prewarm window error", extra={"window": window, "error": str(exc)})
            finally:
                self._opposite_prewarm_in_progress = False

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()

    def _enrich_sector_context(self, stocks_by_symbol: Dict[str, Dict[str, Any]]):
        sector_groups: Dict[str, List[Dict[str, Any]]] = {}
        for stock in stocks_by_symbol.values():
            sector = str(stock.get("sector") or "").strip()
            if not sector:
                continue
            sector_groups.setdefault(sector, []).append(stock)

        for sector, members in sector_groups.items():
            p1m_values = sorted([value for value in (_safe_float(item.get("p1m")) for item in members) if value is not None])
            p3m_values = sorted([value for value in (_safe_float(item.get("p3m")) for item in members) if value is not None])
            day_values = sorted([value for value in (_safe_float(item.get("change_percent")) for item in members) if value is not None])

            sector_p1m_median = median(p1m_values) if p1m_values else 0.0
            sector_p3m_median = median(p3m_values) if p3m_values else 0.0
            sector_day_median = median(day_values) if day_values else 0.0
            sector_momentum_score = (0.55 * sector_p1m_median) + (0.35 * sector_p3m_median) + (0.10 * sector_day_median)

            if sector_momentum_score >= 8:
                sector_label = "leading"
            elif sector_momentum_score <= -5:
                sector_label = "lagging"
            else:
                sector_label = "neutral"

            ranked_by_p1m = sorted(
                members,
                key=lambda item: _safe_float(item.get("p1m")) if _safe_float(item.get("p1m")) is not None else float("-inf"),
            )

            total_members = len(ranked_by_p1m)
            rank_lookup = {item["symbol"]: index for index, item in enumerate(ranked_by_p1m)}

            for member in members:
                symbol = member.get("symbol")
                p1m = _safe_float(member.get("p1m")) or 0.0
                p3m = _safe_float(member.get("p3m")) or 0.0
                day = _safe_float(member.get("change_percent")) or 0.0
                relative_strength = ((p1m - sector_p1m_median) * 0.5) + ((p3m - sector_p3m_median) * 0.35) + ((day - sector_day_median) * 0.15)

                if total_members > 1 and symbol in rank_lookup:
                    percentile = (rank_lookup[symbol] / (total_members - 1)) * 100.0
                else:
                    percentile = 50.0

                member["sector_peer_count"] = total_members
                member["sector_relative_strength"] = round(relative_strength, 2)
                member["sector_peer_percentile"] = round(percentile, 2)
                member["sector_momentum_score"] = round(sector_momentum_score, 2)
                member["sector_momentum_label"] = sector_label

    def _fetch_dividend_profile(self, symbol: str) -> Optional[Dict[str, Any]]:
        try:
            ticker = bp.Ticker(symbol)
            info = ticker.info or {}
            dividends = ticker.dividends
            if dividends is None or dividends.empty:
                return None

            all_dividends: List[Dict[str, Any]] = []
            for idx, row in dividends.iterrows():
                amount = _extract_dividend_amount(row)
                date_value = _coerce_date_string(idx)
                if amount is None or amount <= 0 or not date_value:
                    continue
                all_dividends.append({
                    "date": date_value,
                    "amount": round(amount, 4),
                })

            if not all_dividends:
                return None

            now_date = datetime.now().date()
            dividend_metrics = _compute_dividend_metrics(all_dividends, last_price=info.get("last"), reference_date=now_date)
            next_dividend = dividend_metrics.get("next_dividend")
            last_dividend = dividend_metrics.get("last_dividend")

            if not next_dividend:
                return None

            cached_stock = self.get_stock(symbol) or {}
            dividend_window_stats = _calculate_dividend_window_stats(all_dividends, months=60)

            return {
                "symbol": symbol,
                "name": info.get("description", self.get_symbol_name(symbol)),
                "next_dividend_date": next_dividend["date"],
                "last_dividend_date": last_dividend["date"] if last_dividend else None,
                "next_dividend_amount": next_dividend["amount"],
                "days_left": (datetime.fromisoformat(next_dividend["date"]).date() - now_date).days,
                "dividend_yield": dividend_metrics.get("next_dividend_yield"),
                "dividend_event_count": int(dividend_window_stats["event_count"]),
                "dividend_payout_years_60m": int(dividend_window_stats["payout_years"]),
                "dividend_consistency_score": dividend_window_stats["consistency_score"],
                "dividend_status": "yaklasiyor",
                "dividend_status_label": "Yakinda",
                "data_status": cached_stock.get("data_status", "live"),
                "temettu_guven_skoru": cached_stock.get("temettu_guven_skoru"),
                "temettu_tuzagi_riski": cached_stock.get("temettu_tuzagi_riski"),
                "temettu_takvim_firsati": cached_stock.get("temettu_takvim_firsati"),
                "last": cached_stock.get("last"),
                "change_percent": cached_stock.get("change_percent"),
            }
        except Exception:
            return None

    def _build_upcoming_dividend_profile_from_stock(self, stock: Dict[str, Any], days: int) -> Optional[Dict[str, Any]]:
        symbol = str(stock.get("symbol") or "").upper()
        if not symbol:
            return None

        now_date = datetime.now().date()
        dividend_items = []
        raw_dividends = stock.get("dividends")
        if isinstance(raw_dividends, list):
            for item in raw_dividends:
                if not isinstance(item, dict):
                    continue
                raw_date = item.get("date")
                if not raw_date:
                    continue
                try:
                    parsed_date = datetime.fromisoformat(str(raw_date)).date()
                except ValueError:
                    continue
                dividend_items.append({
                    "date": parsed_date.isoformat(),
                    "amount": _safe_float(item.get("amount")),
                })

        explicit_candidates = [
            stock.get("next_dividend_date"),
            (stock.get("calendar") or {}).get("dividend_date") if isinstance(stock.get("calendar"), dict) else None,
            (stock.get("calendar") or {}).get("ex_dividend_date") if isinstance(stock.get("calendar"), dict) else None,
        ]

        for raw_date in explicit_candidates:
            if not raw_date:
                continue
            try:
                parsed_date = datetime.fromisoformat(str(raw_date)).date()
            except ValueError:
                continue
            if not any(item.get("date") == parsed_date.isoformat() for item in dividend_items):
                dividend_items.append({
                    "date": parsed_date.isoformat(),
                    "amount": _safe_float(stock.get("next_dividend_amount")),
                })

        dividend_metrics = _compute_dividend_metrics(dividend_items, last_price=stock.get("last"), reference_date=now_date)
        next_dividend = dividend_metrics.get("next_dividend")
        if not next_dividend:
            return None
        next_dividend_date = datetime.fromisoformat(str(next_dividend["date"])).date()
        days_left = (next_dividend_date - now_date).days
        if days_left < 0 or days_left > days:
            return None
        next_dividend_yield = dividend_metrics.get("next_dividend_yield")
        if next_dividend_yield is None or next_dividend_yield <= 0:
            return None
        last_dividend = dividend_metrics.get("last_dividend")

        dividend_window_stats = _calculate_dividend_window_stats(dividend_items, months=60)

        return {
            "symbol": symbol,
            "name": stock.get("name") or self.get_symbol_name(symbol),
            "next_dividend_date": next_dividend["date"],
            "last_dividend_date": last_dividend["date"] if last_dividend else None,
            "next_dividend_amount": next_dividend.get("amount"),
            "days_left": days_left,
            "dividend_yield": next_dividend_yield,
            "dividend_event_count": int(dividend_window_stats["event_count"]),
            "dividend_payout_years_60m": int(dividend_window_stats["payout_years"]),
            "dividend_consistency_score": dividend_window_stats["consistency_score"],
            "dividend_status": "yaklasiyor",
            "dividend_status_label": "Yakinda",
            "data_status": stock.get("data_status", "cached"),
            "temettu_guven_skoru": stock.get("temettu_guven_skoru"),
            "temettu_tuzagi_riski": stock.get("temettu_tuzagi_riski"),
            "temettu_takvim_firsati": stock.get("temettu_takvim_firsati"),
            "last": stock.get("last"),
            "change_percent": stock.get("change_percent"),
        }

    def _build_upcoming_dividends_payload(self, days: int = 60) -> Dict[str, Any]:
        stocks, used_snapshot = self.get_all_stocks_or_snapshot()
        results: List[Dict[str, Any]] = []

        for stock in stocks:
            profile = self._build_upcoming_dividend_profile_from_stock(stock, days)
            if profile:
                results.append(profile)

        results.sort(
            key=lambda item: (
                int(item.get("days_left") or 9999),
                -(float(item.get("dividend_yield") or 0.0)),
            )
        )

        return {
            "results": results,
            "total": len(results),
            "scanned_symbols": len(stocks),
            "window_days": days,
            "generated_at": datetime.now().isoformat(),
            "scan_in_progress": False,
            "used_snapshot_fallback": used_snapshot,
        }

    def _scan_upcoming_dividends(self, days: int = 60) -> Dict[str, Any]:
        self._upcoming_dividends_scan_in_progress = True
        results: List[Dict[str, Any]] = []
        scanned = 0
        try:
            stocks, _ = self.get_all_stocks_or_snapshot()
            candidate_symbols = [
                str(stock.get("symbol") or "").upper()
                for stock in stocks
                if _safe_float(stock.get("dividend_yield")) and _safe_float(stock.get("dividend_yield")) > 0
            ]
            if not candidate_symbols:
                candidate_symbols = self.get_symbols()

            for symbol in candidate_symbols:
                profile = self._fetch_dividend_profile(symbol)
                scanned += 1
                if not profile:
                    continue
                days_left = int(profile.get("days_left") or 9999)
                if days_left < 0 or days_left > days:
                    continue
                results.append(profile)

            results.sort(key=lambda item: (int(item.get("days_left") or 9999), -(float(item.get("dividend_yield") or 0.0))))
            payload = {
                "results": results,
                "total": len(results),
                "scanned_symbols": scanned,
                "window_days": days,
                "generated_at": datetime.now().isoformat(),
                "scan_in_progress": False,
            }
            self._upcoming_dividends_cache = payload
            self._upcoming_dividends_cached_at = datetime.now()
            return payload
        finally:
            self._upcoming_dividends_scan_in_progress = False

    def _filter_upcoming_dividends_payload(self, payload: Dict[str, Any], days: int) -> Dict[str, Any]:
        filtered_results = [
            item for item in (payload.get("results") or [])
            if 0 <= int(item.get("days_left") or 9999) <= days
        ]
        filtered_results.sort(
            key=lambda item: (int(item.get("days_left") or 9999), -(float(item.get("dividend_yield") or 0.0)))
        )
        return {
            **payload,
            "results": filtered_results,
            "total": len(filtered_results),
            "window_days": days,
        }

    def _start_upcoming_dividends_scan(self, days: int) -> None:
        if self._upcoming_dividends_scan_in_progress:
            return
        thread = threading.Thread(target=self._scan_upcoming_dividends, kwargs={"days": days}, daemon=True)
        thread.start()

    def get_upcoming_dividends(self, days: int = 60, force: bool = False) -> Dict[str, Any]:
        now = datetime.now()
        cache_ttl = timedelta(minutes=5)

        if (
            self._upcoming_dividends_cache is not None
            and self._upcoming_dividends_cached_at is not None
            and not force
            and self._upcoming_dividends_cached_at >= (now - cache_ttl)
        ):
            cached = self._filter_upcoming_dividends_payload(dict(self._upcoming_dividends_cache), days)
            cached["scan_in_progress"] = False
            return cached

        try:
            payload = self._build_upcoming_dividends_payload(days)
            self._upcoming_dividends_cache = payload
            self._upcoming_dividends_cached_at = now
            return payload
        except Exception as exc:
            logger.exception("[BISTStore] Upcoming dividend payload error", extra={"error": str(exc)})
            if self._upcoming_dividends_cache is not None:
                cached = self._filter_upcoming_dividends_payload(dict(self._upcoming_dividends_cache), days)
                cached["scan_in_progress"] = False
                return cached
            return {
                "results": [],
                "total": 0,
                "scanned_symbols": 0,
                "window_days": days,
                "generated_at": now.isoformat(),
                "scan_in_progress": False,
            }

    def _analysis_confidence(self, stock: Dict[str, Any]) -> float | None:
        data_quality = stock.get("data_quality")
        if isinstance(data_quality, dict):
            confidence = _safe_float(data_quality.get("score_confidence"))
            if confidence is not None:
                return round(confidence, 2)
        return None

    def _analysis_hakiki_alfa(self, stock: Dict[str, Any]) -> float:
        direct_value = _safe_float(stock.get("hakiki_alfa_pct"))
        if direct_value is not None:
            return direct_value
        hakiki_alfa = stock.get("hakiki_alfa")
        if isinstance(hakiki_alfa, dict):
            nested_value = _safe_float(hakiki_alfa.get("hakiki_alfa_pct"))
            if nested_value is not None:
                return nested_value
        return 0.0

    def _signal_score(self, stock: Dict[str, Any], signal_key: str) -> float:
        signals = stock.get("signals")
        if not isinstance(signals, dict):
            fallback_map = {
                "firsatlar": "firsat_skoru",
                "trade": "trade_skoru",
                "radar": "radar_skoru",
                "uzun_vade": "uzun_vade_skoru",
            }
            return _safe_float(stock.get(fallback_map.get(signal_key, ""))) or 0.0
        signal_payload = signals.get(signal_key)
        if not isinstance(signal_payload, dict):
            return 0.0
        return _safe_float(signal_payload.get("score")) or 0.0

    def _build_analysis_advice_row(self, stock: Dict[str, Any], *, score: float, action: str, window: str) -> Dict[str, Any]:
        return {
            "symbol": stock.get("symbol"),
            "name": stock.get("name") or stock.get("symbol"),
            "price": _safe_float(stock.get("last")),
            "day": _safe_float(stock.get("change_percent")) or 0.0,
            "hakikiAlfa": self._analysis_hakiki_alfa(stock),
            "score": round(score, 2),
            "action": action,
            "window": window,
            "confidence": self._analysis_confidence(stock),
        }

    def _analysis_period_signal_key(self, horizon_days: int) -> str:
        if horizon_days <= 1:
            return "firsatlar"
        if horizon_days <= 5:
            return "trade"
        if horizon_days <= 30:
            return "radar"
        return "uzun_vade"

    def _build_analysis_period_row(self, stock: Dict[str, Any], *, horizon_days: int, horizon_label: str) -> Optional[Dict[str, Any]]:
        signal_key = self._analysis_period_signal_key(horizon_days)
        signals = stock.get("signals") if isinstance(stock.get("signals"), dict) else {}
        signal = signals.get(signal_key) if isinstance(signals, dict) else None
        confidence = self._analysis_confidence(stock) or 58.0
        score = self._signal_score(stock, signal_key)
        if isinstance(signal, dict):
            probability_positive = _safe_float(signal.get("probability_positive"))
            probability_outperform = _safe_float(signal.get("probability_outperform"))
            expected_return_pct = _safe_float(signal.get("expected_return_pct"))
            expected_excess_return_pct = _safe_float(signal.get("expected_excess_return_pct"))
            risk_forecast_pct = _safe_float(signal.get("risk_forecast_pct"))
            calibration_confidence = _safe_float(signal.get("calibration_confidence"))
            action = signal.get("action") or f"{horizon_label} Izle"
            window = signal.get("horizon") or horizon_label
            signal_version = signal.get("signal_version")
            calibration_version = signal.get("calibration_version")
            decision_band = signal.get("decision_band")
            thesis = signal.get("thesis")
        else:
            probability_fields = estimate_probability_fields(
                market="bist",
                signal_id=signal_key,
                score=score,
                confidence=confidence,
                horizon_days=horizon_days,
                return_bias_pct=self._analysis_hakiki_alfa(stock),
                excess_bias_pct=self._analysis_hakiki_alfa(stock),
                volatility_pct=abs(_safe_float(stock.get("change_percent"))) * 2.0,
            )
            action_payload = derive_probability_action(
                market="bist",
                signal_id=signal_key,
                probability_positive=_safe_float(probability_fields.get("probability_positive")),
                expected_excess_return_pct=_safe_float(probability_fields.get("expected_excess_return_pct")),
                default_action=f"{horizon_label} Izle",
                default_horizon=horizon_label,
            )
            probability_positive = _safe_float(probability_fields.get("probability_positive"))
            probability_outperform = _safe_float(probability_fields.get("probability_outperform"))
            expected_return_pct = _safe_float(probability_fields.get("expected_return_pct"))
            expected_excess_return_pct = _safe_float(probability_fields.get("expected_excess_return_pct"))
            risk_forecast_pct = _safe_float(probability_fields.get("risk_forecast_pct"))
            calibration_confidence = _safe_float(probability_fields.get("calibration_confidence"))
            action = action_payload.get("action") or f"{horizon_label} Izle"
            window = action_payload.get("horizon") or horizon_label
            signal_version = probability_fields.get("signal_version")
            calibration_version = probability_fields.get("calibration_version")
            decision_band = action_payload.get("decision_band")
            thesis = None
            signal = {
                "action": action,
                "horizon": window,
                "signal_version": signal_version,
                "calibration_version": calibration_version,
                "decision_band": decision_band,
                "thesis": thesis,
            }
        if score <= 0:
            return None

        return {
            "symbol": stock.get("symbol"),
            "name": stock.get("name") or stock.get("symbol"),
            "price": _safe_float(stock.get("last")),
            "day": _safe_float(stock.get("change_percent")) or 0.0,
            "hakikiAlfa": self._analysis_hakiki_alfa(stock),
            "score": round(score, 2),
            "action": signal.get("action") or f"{horizon_label} İzle",
            "window": signal.get("horizon") or horizon_label,
            "confidence": round(_safe_float(calibration_confidence) or self._analysis_confidence(stock), 2),
            "probability_positive": round(_safe_float(probability_positive) or 0.0, 4),
            "probability_outperform": round(_safe_float(probability_outperform) or 0.0, 4),
            "expected_return_pct": round(_safe_float(expected_return_pct) or 0.0, 4),
            "expected_excess_return_pct": round(_safe_float(expected_excess_return_pct) or 0.0, 4),
            "risk_forecast_pct": round(_safe_float(risk_forecast_pct) or 0.0, 4),
            "signal_id": signal_key,
            "signal_version": signal.get("signal_version"),
            "calibration_version": signal.get("calibration_version"),
            "decision_band": signal.get("decision_band"),
            "thesis": signal.get("thesis"),
        }

    def _build_analysis_period_lists(self, stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        periods = [
            {"key": "1g", "label": "1 Gün", "horizon_days": 1},
            {"key": "5g", "label": "5 Gün", "horizon_days": 5},
            {"key": "30g", "label": "30 Gün", "horizon_days": 30},
            {"key": "6a", "label": "6 Ay", "horizon_days": 180},
            {"key": "1y", "label": "1 Yıl", "horizon_days": 365},
            {"key": "2y", "label": "2 Yıl", "horizon_days": 730},
        ]
        payload: List[Dict[str, Any]] = []
        for period in periods:
            rows: List[Dict[str, Any]] = []
            for stock in stocks:
                row = self._build_analysis_period_row(
                    stock,
                    horizon_days=int(period["horizon_days"]),
                    horizon_label=str(period["label"]),
                )
                if row is None:
                    continue
                rows.append(row)

            rows = sorted(
                rows,
                key=lambda item: (
                    _safe_float(item.get("probability_outperform")),
                    _safe_float(item.get("score")),
                    _safe_float(item.get("expected_excess_return_pct")),
                ),
                reverse=True,
            )[:12]
            payload.append(
                {
                    "key": period["key"],
                    "label": period["label"],
                    "horizon_days": period["horizon_days"],
                    "rows": rows,
                }
            )
        return payload

    def _build_analysis_buckets(self, stocks: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        buy_now: List[Dict[str, Any]] = []
        buy_week: List[Dict[str, Any]] = []
        hold: List[Dict[str, Any]] = []
        sell: List[Dict[str, Any]] = []

        for stock in stocks:
            firsat = self._signal_score(stock, "firsatlar")
            trade = self._signal_score(stock, "trade")
            uzun = self._signal_score(stock, "uzun_vade")
            hakiki_alfa = self._analysis_hakiki_alfa(stock)
            rsi = _safe_float(stock.get("rsi")) or 50.0
            day = _safe_float(stock.get("change_percent")) or 0.0

            if (firsat >= 85 or trade >= 80) and hakiki_alfa > 0:
                buy_now.append(
                    self._build_analysis_advice_row(
                        stock,
                        score=max(firsat, trade),
                        action="Bugun Al",
                        window="Bugun al, 1-5 gun izle" if rsi < 70 else "Bugun al, 1-3 gunde realize et",
                    )
                )
                continue

            if (firsat >= 74 or trade >= 66) and hakiki_alfa >= -0.15:
                buy_week.append(
                    self._build_analysis_advice_row(
                        stock,
                        score=max(firsat, trade),
                        action="Bu Hafta Topla",
                        window="3-7 gun icinde kademeli al",
                    )
                )
                continue

            if uzun >= 78 and hakiki_alfa >= 0:
                hold.append(
                    self._build_analysis_advice_row(
                        stock,
                        score=uzun,
                        action="Tut / Biriktir",
                        window="1-6 ay tasinabilir",
                    )
                )
                continue

            if (hakiki_alfa < -0.5 and firsat < 60 and trade < 58) or (rsi > 74 and day > 3.5):
                sell.append(
                    self._build_analysis_advice_row(
                        stock,
                        score=max(65.0, 100.0 - max(firsat, trade)),
                        action="Kar Al / Azalt" if (rsi > 74 and day > 3.5) else "Bugun Sat",
                        window="Bugun / 1-2 gun" if (rsi > 74 and day > 3.5) else "Bugun / 1-3 gun icinde azalt",
                    )
                )

        def _slice_sorted(items: List[Dict[str, Any]], limit: int = 12) -> List[Dict[str, Any]]:
            return sorted(items, key=lambda item: _safe_float(item.get("score")), reverse=True)[:limit]

        return {
            "buy_now": _slice_sorted(buy_now),
            "buy_week": _slice_sorted(buy_week),
            "hold": _slice_sorted(hold),
            "sell": _slice_sorted(sell),
        }

    def _build_analysis_portfolio_candidates(self, stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        for stock in stocks:
            firsat = self._signal_score(stock, "firsatlar")
            trade = self._signal_score(stock, "trade")
            uzun = self._signal_score(stock, "uzun_vade")
            hakiki_alfa = self._analysis_hakiki_alfa(stock)
            resilience = _safe_float(stock.get("finansal_dayaniklilik_skoru")) or 50.0
            capital = _safe_float(stock.get("sermaye_disiplini_skoru")) or 50.0
            portfolio_fit = _safe_float(stock.get("portfolio_fit_score")) or 50.0
            composite = (0.26 * firsat) + (0.14 * trade) + (0.22 * uzun) + (0.12 * resilience) + (0.10 * capital) + (0.16 * portfolio_fit)

            if composite < 76 or hakiki_alfa < 0.1:
                continue

            results.append(
                self._build_analysis_advice_row(
                    stock,
                    score=composite,
                    action="Sepette Yoksa Al" if composite >= 84 else "Yakina Al",
                    window="Bu hafta pozisyon ac" if composite >= 84 else "Izleme listesine al",
                )
            )

        return sorted(results, key=lambda item: _safe_float(item.get("score")), reverse=True)[:24]

    def _build_analysis_overview_payload(self, *, window: str = "2y") -> Dict[str, Any]:
        started_at = time.time()
        snapshot_payload = load_latest_bist_proprietary_snapshot() or {}
        global_reference = snapshot_payload.get("global_reference") if isinstance(snapshot_payload, dict) else None
        snapshot_stocks: List[Dict[str, Any]] = []
        raw_snapshot_stocks = snapshot_payload.get("stocks") if isinstance(snapshot_payload, dict) else []
        if isinstance(raw_snapshot_stocks, list):
            for item in raw_snapshot_stocks:
                if not isinstance(item, dict) or not item.get("symbol"):
                    continue
                try:
                    hydrated = self._hydrate_snapshot_stock(dict(item), global_reference)
                    if isinstance(hydrated, dict) and hydrated.get("symbol"):
                        snapshot_stocks.append(hydrated)
                except Exception as exc:
                    logger.warning(
                        "[BISTStore] Skipping malformed snapshot stock in analysis overview",
                        extra={"symbol": item.get("symbol"), "error": str(exc)},
                    )

        if snapshot_stocks:
            stocks = snapshot_stocks
            used_snapshot = True
        else:
            stocks, used_snapshot = self.get_all_stocks_or_snapshot()
        try:
            advice = self._build_analysis_buckets(stocks)
        except Exception as exc:
            logger.exception("[BISTStore] Analysis overview advice build error", extra={"error": str(exc)})
            advice = {"buy_now": [], "buy_week": [], "hold": [], "sell": []}

        try:
            period_lists = self._build_analysis_period_lists(stocks)
        except Exception as exc:
            logger.exception("[BISTStore] Analysis overview period build error", extra={"error": str(exc)})
            period_lists = []

        try:
            portfolio_candidates = self._build_analysis_portfolio_candidates(stocks)
        except Exception as exc:
            logger.exception("[BISTStore] Analysis overview portfolio candidates error", extra={"error": str(exc)})
            portfolio_candidates = []

        try:
            upcoming_dividends = self.get_upcoming_dividends(days=60, force=False)
        except Exception as exc:
            logger.exception("[BISTStore] Analysis overview upcoming dividends error", extra={"error": str(exc)})
            upcoming_dividends = {
                "results": [],
                "total": 0,
                "scanned_symbols": 0,
                "generated_at": None,
                "scan_in_progress": False,
            }

        payload = {
            "generated_at": datetime.now().isoformat(),
            "used_snapshot_fallback": used_snapshot,
            "rows_total": len(stocks),
            "advice": advice,
            "period_lists": period_lists,
            "portfolio_candidates": portfolio_candidates,
            "upcoming_dividends": upcoming_dividends.get("results", []),
            "upcoming_dividends_meta": {
                "total": upcoming_dividends.get("total", 0),
                "scanned_symbols": upcoming_dividends.get("scanned_symbols", 0),
                "generated_at": upcoming_dividends.get("generated_at"),
                "scan_in_progress": upcoming_dividends.get("scan_in_progress", False),
            },
            "opposite_pairs": [],
            "opposite_meta": {
                "scanMode": "deferred",
                "scanInProgress": False,
                "generatedAt": None,
                "scannedSymbols": 0,
                "windowLabel": window.upper(),
                "basis": "Zitlik verisi ayri akista yuklenir",
                "usingFallback": False,
            },
        }
        logger.info(
            "[BISTStore] Analysis overview built",
            extra={
                "window": window,
                "elapsed_ms": round((time.time() - started_at) * 1000, 1),
                "stocks": len(stocks),
                "period_1g": len((period_lists[0] or {}).get("rows", [])) if period_lists else 0,
                "dividends": len(payload.get("upcoming_dividends", [])),
            },
        )
        return payload

    def get_analysis_overview(self, *, window: str = "2y", force: bool = False) -> Dict[str, Any]:
        now = datetime.now()
        cache_key = str(window or "2y").lower()
        cached_payload = self._analysis_overview_cache.get(cache_key)
        cached_at = self._analysis_overview_cached_at.get(cache_key)
        if (
            not force
            and cached_payload is not None
            and cached_at is not None
            and cached_at >= (now - timedelta(minutes=5))
        ):
            return cached_payload

        payload = self._build_analysis_overview_payload(window=cache_key)
        self._analysis_overview_cache[cache_key] = payload
        self._analysis_overview_cached_at[cache_key] = now
        return payload
    
    def _update_usd_try_rate(self):
        """Update USD/TRY exchange rate"""
        try:
            fx = bp.FX("USD")
            if fx and fx.current:
                rate = fx.current.get('last')
                if rate and rate > 0:
                    self._usd_try_rate = float(rate)
                    logger.info(f"[BISTStore] USD/TRY rate: {self._usd_try_rate}")
        except Exception as e:
            logger.exception("[BISTStore] USD/TRY error", extra={"error": str(e)})
    
    def _fetch_single_stock(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch complete data for a single stock using borsapy"""
        try:
            ticker = bp.Ticker(symbol)
            info = ticker.info
            
            if not info or not info.get('last'):
                return None
            
            # Calculate USD values
            usd_rate = self._usd_try_rate
            volume_tl = float(info.get('amount', 0)) or (int(info.get('volume', 0)) * float(info.get('last', 0)))
            volume_usd = volume_tl / usd_rate if usd_rate > 0 else 0
            market_cap = float(info.get('marketCap', 0))
            
            normalized_dividend_yield = _normalize_dividend_yield(info.get('dividendYield'))

            result = {
                "symbol": symbol,
                "name": info.get('description', self.get_symbol_name(symbol)),
                "last": float(info.get('last', 0)),
                "change": float(info.get('change', 0)),
                "change_percent": float(info.get('change_percent', 0)),
                "volume": int(info.get('volume', 0)),
                "volume_usd": round(volume_usd / 1_000_000, 2),
                "market_cap": market_cap,
                "market_cap_usd": round(market_cap / usd_rate / 1_000_000_000, 2) if usd_rate else 0,
                "day_high": float(info.get('high', 0)),
                "day_low": float(info.get('low', 0)),
                "open": float(info.get('open', 0)),
                "prev_close": float(info.get('prev_close', 0)),
                
                # Valuation
                "pe": float(info.get('trailingPE', 0)) if info.get('trailingPE') else None,
                "pb": float(info.get('priceToBook', 0)) if info.get('priceToBook') else None,
                "ev_ebitda": float(info.get('enterpriseToEbitda', 0)) if info.get('enterpriseToEbitda') else None,
                "dividend_yield": normalized_dividend_yield,
                
                # Ownership
                "float_shares": float(info.get('floatShares', 0)) if info.get('floatShares') else None,
                "foreign_ratio": float(info.get('foreignRatio', 0)) if info.get('foreignRatio') else None,
                "shares_outstanding": float(info.get('sharesOutstanding', 0)) if info.get('sharesOutstanding') else None,
                
                # 52-week data
                "fifty_two_week_high": float(info.get('fiftyTwoWeekHigh', 0)) if info.get('fiftyTwoWeekHigh') else None,
                "fifty_two_week_low": float(info.get('fiftyTwoWeekLow', 0)) if info.get('fiftyTwoWeekLow') else None,
                "fifty_day_avg": float(info.get('fiftyDayAverage', 0)) if info.get('fiftyDayAverage') else None,
                "two_hundred_day_avg": float(info.get('twoHundredDayAverage', 0)) if info.get('twoHundredDayAverage') else None,
                
                # Sector
                "sector": info.get('sector', ''),
                "industry": info.get('industry', ''),
                "website": info.get('website', ''),
                
                # Timestamp
                "updated_at": datetime.now().isoformat(),
            }

            float_shares = result.get("float_shares")
            shares_outstanding = result.get("shares_outstanding")
            if float_shares and shares_outstanding and shares_outstanding > 0:
                result["public_float_pct"] = round((float_shares / shares_outstanding) * 100, 2)
            
            # Calculate derived metrics
            last = result.get('last', 0)
            if last > 0:
                # 52w upside/downside
                high_52 = result.get('fifty_two_week_high')
                low_52 = result.get('fifty_two_week_low')
                if high_52:
                    result['upside_52w'] = round(((high_52 - last) / last) * 100, 2)
                if low_52:
                    result['from_52w_low'] = round(((last - low_52) / low_52) * 100, 2)
                
                # SMA distances
                sma50 = result.get('fifty_day_avg')
                sma200 = result.get('two_hundred_day_avg')
                if sma50:
                    result['vs_sma50'] = round(((last - sma50) / sma50) * 100, 2)
                if sma200:
                    result['vs_sma200'] = round(((last - sma200) / sma200) * 100, 2)
            
            # Period returns from historical data
            try:
                hist = ticker.history(period="5y")
                if hist is not None and not hist.empty and len(hist) > 1:
                    current_price = hist['Close'].iloc[-1]
                    today = datetime.now().date()
                    
                    periods = [('p1w', 7), ('p1m', 30), ('p3m', 90), ('p1y', 365), ('p5y', 1825)]
                    for key, days in periods:
                        target_date = today - timedelta(days=days)
                        hist_filtered = hist[hist.index.date <= target_date]
                        if len(hist_filtered) > 0:
                            old_price = hist_filtered['Close'].iloc[-1]
                            result[key] = round(((current_price - old_price) / old_price) * 100, 2)
                    
                    # YTD
                    year_start = datetime(today.year, 1, 1).date()
                    hist_ytd = hist[hist.index.date >= year_start]
                    if len(hist_ytd) > 0:
                        first_price = hist_ytd['Close'].iloc[0]
                        result['ytd'] = round(((current_price - first_price) / first_price) * 100, 2)
            except Exception as hist_err:
                pass  # Historical data optional
            
            # Technical Analysis Signals (RSI, MACD, etc.) - use retry wrapper for TradingView
            try:
                ta = None
                try:
                    ta = _safe_ta_signals_wrapper(ticker)
                except Exception:
                    ta = None

                if ta:
                    # Summary recommendation
                    summary = ta.get('summary', {})
                    result['ta_summary'] = summary.get('recommendation', 'NEUTRAL')
                    result['ta_buy'] = summary.get('buy', 0)
                    result['ta_sell'] = summary.get('sell', 0)
                    result['ta_neutral'] = summary.get('neutral', 0)
                    
                    # Oscillators (RSI, MACD, Stochastic, CCI, ADX)
                    osc = ta.get('oscillators', {})
                    osc_values = osc.get('values', {})
                    result['rsi'] = osc_values.get('RSI')
                    result['macd'] = osc_values.get('MACD.macd')
                    result['macd_signal'] = osc_values.get('MACD.signal')
                    result['stoch_k'] = osc_values.get('Stoch.K')
                    result['stoch_d'] = osc_values.get('Stoch.D')
                    result['cci'] = osc_values.get('CCI20')
                    result['adx'] = osc_values.get('ADX')
                    result['williams_r'] = osc_values.get('W.R')
                    result['momentum'] = osc_values.get('Mom')
                    
                    # Moving Averages summary
                    ma = ta.get('moving_averages', {})
                    result['ma_recommendation'] = ma.get('recommendation', 'NEUTRAL')
                    result['ma_buy'] = ma.get('buy', 0)
                    result['ma_sell'] = ma.get('sell', 0)
            except Exception:
                pass  # Technical data optional

            # Analyst Recommendations
            try:
                rec = ticker.recommendations
                if rec:
                    result['analyst_recommendation'] = rec.get('recommendation', '')
                    result['analyst_target'] = rec.get('target_price')
                    result['analyst_upside'] = rec.get('upside_potential')
            except Exception as rec_err:
                pass  # Analyst data optional
            
            # Analyst Price Targets
            try:
                targets = ticker.analyst_price_targets
                if targets:
                    result['target_low'] = targets.get('low')
                    result['target_high'] = targets.get('high')
                    result['target_mean'] = targets.get('mean')
                    result['target_median'] = targets.get('median')
                    result['analyst_count'] = targets.get('numberOfAnalysts')
            except Exception as target_err:
                pass  # Target data optional
            
            # Recommendation Summary (buy/hold/sell counts)
            try:
                rec_sum = ticker.recommendations_summary
                if rec_sum and (rec_sum.get('strongBuy') or rec_sum.get('buy') or rec_sum.get('hold') or rec_sum.get('sell') or rec_sum.get('strongSell')):
                    result['rec_strong_buy'] = rec_sum.get('strongBuy', 0)
                    result['rec_buy'] = rec_sum.get('buy', 0)
                    result['rec_hold'] = rec_sum.get('hold', 0)
                    result['rec_sell'] = rec_sum.get('sell', 0)
                    result['rec_strong_sell'] = rec_sum.get('strongSell', 0)
            except Exception as rec_sum_err:
                pass  # Recommendation summary optional
            
            # =============================================
            # NEW DATA: Major Holders (Ortaklık Yapısı)
            # =============================================
            try:
                major_holders = ticker.major_holders
                if major_holders is not None and not major_holders.empty:
                    holders_list = []
                    for _, row in major_holders.iterrows():
                        holders_list.append({
                            "name": row.get('name', ''),
                            "shares": int(row.get('shares', 0)) if row.get('shares') else 0,
                            "percentage": float(row.get('percentage', 0)) if row.get('percentage') else 0,
                        })
                    result['major_holders'] = holders_list[:10]  # Top 10
            except Exception as mh_err:
                pass  # Major holders optional
            
            # =============================================
            # NEW DATA: Dividends (Temettü Geçmişi)
            # =============================================
            try:
                dividends = ticker.dividends
                if dividends is not None and not dividends.empty:
                    div_list = []
                    all_dividends: List[Dict[str, Any]] = []
                    for idx, row in dividends.iterrows():
                        amount = _extract_dividend_amount(row)
                        date_value = _coerce_date_string(idx)
                        if amount is None or not date_value or amount <= 0:
                            continue
                        all_dividends.append({
                            "date": date_value,
                            "amount": round(amount, 4),
                        })

                    all_dividends.sort(key=lambda item: item["date"], reverse=True)
                    for item in all_dividends[:10]:
                        div_list.append({
                            "date": item["date"],
                            "amount": item["amount"],
                        })
                    result['dividends'] = div_list
                    positive_dividend_items = [
                        item for item in all_dividends
                        if item.get("amount") is not None and item.get("amount", 0) > 0
                    ]
                    dividend_window_stats = _calculate_dividend_window_stats(positive_dividend_items, months=60)
                    result['dividend_event_count'] = int(dividend_window_stats["event_count"])
                    result['dividend_payout_years_60m'] = int(dividend_window_stats["payout_years"])
                    if positive_dividend_items:
                        result['dividend_consistency_score'] = dividend_window_stats["consistency_score"]
                    now_date = datetime.now().date()
                    dividend_metrics = _compute_dividend_metrics(all_dividends, last_price=result.get("last"), reference_date=now_date)

                    if dividend_metrics.get("dividend_yield") is not None:
                        result["dividend_yield"] = dividend_metrics["dividend_yield"]
                    if dividend_metrics.get("next_dividend_yield") is not None:
                        result["next_dividend_yield"] = dividend_metrics["next_dividend_yield"]
                    if dividend_metrics.get("forward_dividend_yield") is not None:
                        result["forward_dividend_yield"] = dividend_metrics["forward_dividend_yield"]
                    if dividend_metrics.get("trailing_dividend_yield") is not None:
                        result["trailing_dividend_yield"] = dividend_metrics["trailing_dividend_yield"]

                    if dividend_metrics.get("next_dividend_date"):
                        result['calendar'] = result.get('calendar', {})
                        result['calendar']['dividend_date'] = dividend_metrics["next_dividend_date"]
                        result['calendar']['ex_dividend_date'] = dividend_metrics["next_dividend_date"]
                        result['next_dividend_date'] = dividend_metrics["next_dividend_date"]
                        result['next_dividend_amount'] = dividend_metrics.get("next_dividend_amount")

                    if dividend_metrics.get("last_dividend_date"):
                        result['last_dividend_date'] = dividend_metrics["last_dividend_date"]

                    if dividend_metrics.get("next_dividend_date"):
                        result['dividend_status'] = "yaklasiyor"
                        result['dividend_status_label'] = "Yakinda"
                    elif positive_dividend_items:
                        result['dividend_status'] = "gecmis_dagitimi_var"
                        result['dividend_status_label'] = "Dagitmis"
                    else:
                        result['dividend_status'] = "bilgi_yok"
                        result['dividend_status_label'] = "Bilinmiyor"
            except Exception as div_err:
                pass  # Dividends optional
            
            # =============================================
            # NEW DATA: Financial Statements (Finansal Tablolar)
            # =============================================
            try:
                # Balance Sheet - Latest
                bs = ticker.balance_sheet
                if bs is not None and not bs.empty:
                    latest_bs = bs.iloc[:, 0] if len(bs.columns) > 0 else None
                    if latest_bs is not None:
                        result['financials'] = result.get('financials', {})
                        result['financials']['total_assets'] = _extract_series_value(
                            latest_bs,
                            ['TOPLAM VARLIKLAR', 'Total Assets'],
                        )
                        result['financials']['total_debt'] = _extract_series_value(
                            latest_bs,
                            ['Finansal Borclar', 'Finansal Borçlar', 'Total Debt'],
                            aggregate='sum',
                        )
                        result['financials']['total_equity'] = _extract_series_value(
                            latest_bs,
                            [
                                'Ana Ortakliga Ait Ozkaynaklar',
                                'Ana Ortaklığa Ait Özkaynaklar',
                                'Ozkaynaklar',
                                'Özkaynaklar',
                                'Total Stockholder Equity',
                                'Stockholders Equity',
                            ],
                        )
                        result['financials']['cash'] = _extract_series_value(
                            latest_bs,
                            ['Nakit ve Nakit Benzerleri', 'Cash And Cash Equivalents'],
                        )
                        
                        # Net Debt = Total Debt - Cash
                        if result['financials'].get('total_debt') and result['financials'].get('cash'):
                            result['financials']['net_debt'] = result['financials']['total_debt'] - result['financials']['cash']
                        
                        # Debt/Equity ratio
                        if result['financials'].get('total_debt') and result['financials'].get('total_equity') and result['financials']['total_equity'] > 0:
                            result['financials']['debt_to_equity'] = round(result['financials']['total_debt'] / result['financials']['total_equity'], 2)
            except Exception as bs_err:
                pass  # Balance sheet optional
            
            try:
                # Income Statement - Latest (TTM preferred)
                inc = ticker.ttm_income_stmt if hasattr(ticker, 'ttm_income_stmt') else ticker.income_stmt
                if inc is not None and not inc.empty:
                    latest_inc = inc.iloc[:, 0] if len(inc.columns) > 0 else None
                    if latest_inc is not None:
                        result['financials'] = result.get('financials', {})
                        result['financials']['revenue'] = _extract_series_value(
                            latest_inc,
                            ['Satis Gelirleri', 'Satış Gelirleri', 'Total Revenue'],
                        )
                        result['financials']['gross_profit'] = _extract_series_value(
                            latest_inc,
                            ['BRUT KAR', 'BRÜT KAR', 'Ticari Faaliyetlerden Brut Kar', 'Ticari Faaliyetlerden Brüt Kar', 'Gross Profit'],
                        )
                        result['financials']['operating_income'] = _extract_series_value(
                            latest_inc,
                            ['FAALIYET KARI', 'FAALİYET KARI', 'Operating Income'],
                        )
                        result['financials']['net_income'] = _extract_series_value(
                            latest_inc,
                            [
                                'Surdurulen Faaliyetler Donem Kari',
                                'SÜRDÜRÜLEN FAALİYETLER DÖNEM KARI',
                                'Donem Net Kar/Zararlari',
                                'Dönem Net Kar/Zararları',
                                'Net Income',
                            ],
                        )
                        result['financials']['ebitda'] = _extract_series_value(
                            latest_inc,
                            ['EBITDA', 'FAVOK', 'FAVÖK', 'Finansman Gideri Oncesi Faaliyet Kari', 'Finansman Gideri Öncesi Faaliyet Karı'],
                        )
                        
                        # Margins
                        revenue = result['financials'].get('revenue')
                        if revenue and revenue > 0:
                            if result['financials'].get('gross_profit'):
                                result['financials']['gross_margin'] = round(result['financials']['gross_profit'] / revenue * 100, 2)
                            if result['financials'].get('operating_income'):
                                result['financials']['operating_margin'] = round(result['financials']['operating_income'] / revenue * 100, 2)
                            if result['financials'].get('net_income'):
                                result['financials']['net_margin'] = round(result['financials']['net_income'] / revenue * 100, 2)
                            if result['financials'].get('ebitda'):
                                result['financials']['ebitda_margin'] = round(result['financials']['ebitda'] / revenue * 100, 2)
                        
                        # ROE = Net Income / Equity
                        equity = result.get('financials', {}).get('total_equity')
                        if result['financials'].get('net_income') and equity and equity > 0:
                            result['financials']['roe'] = round(result['financials']['net_income'] / equity * 100, 2)
                        
                        # ROA = Net Income / Total Assets
                        assets = result.get('financials', {}).get('total_assets')
                        if result['financials'].get('net_income') and assets and assets > 0:
                            result['financials']['roa'] = round(result['financials']['net_income'] / assets * 100, 2)
            except Exception as inc_err:
                pass  # Income statement optional
            
            try:
                # Cash Flow Statement - Latest
                cf = ticker.cashflow
                if cf is not None and not cf.empty:
                    latest_cf = cf.iloc[:, 0] if len(cf.columns) > 0 else None
                    if latest_cf is not None:
                        result['financials'] = result.get('financials', {})
                        result['financials']['operating_cashflow'] = _extract_series_value(
                            latest_cf,
                            [
                                'Isletme Faaliyetlerinden Kaynaklanan Net Nakit',
                                'İşletme Faaliyetlerinden Kaynaklanan Net Nakit',
                                'Operating Cash Flow',
                                'Total Cash From Operating Activities',
                            ],
                        )
                        result['financials']['capex'] = _extract_series_value(
                            latest_cf,
                            [
                                'Sabit Sermaye Yatirimlari',
                                'Sabit Sermaye Yatırımları',
                                'Capital Expenditures',
                                'Capital Expenditure',
                            ],
                        )
                        
                        # Free Cash Flow = Operating CF - CapEx
                        op_cf = result['financials'].get('operating_cashflow')
                        capex = result['financials'].get('capex')
                        if op_cf is not None and capex is not None:
                            result['financials']['free_cashflow'] = op_cf - abs(capex)
                        else:
                            result['financials']['free_cashflow'] = _extract_series_value(
                                latest_cf,
                                ['Serbest Nakit Akim', 'Serbest Nakit Akım', 'Free Cash Flow'],
                            )
            except Exception as cf_err:
                pass  # Cash flow optional
            
            # =============================================
            # NEW DATA: KAP News (Bildirimler)
            # =============================================
            try:
                news = ticker.news
                if news is not None and len(news) > 0:
                    news_list = []
                    for item in news[:5]:  # Last 5 news
                        news_list.append({
                            "title": item.get('title', ''),
                            "date": item.get('date', ''),
                            "link": item.get('link', ''),
                        })
                    result['news'] = news_list
            except Exception as news_err:
                pass  # News optional
            
            # =============================================
            # NEW DATA: Calendar Events (Takvim)
            # =============================================
            try:
                calendar = ticker.calendar
                if calendar:
                    result['calendar'] = result.get('calendar', {})
                    if isinstance(calendar, dict):
                        result['calendar'].update({
                            "earnings_date": calendar.get('earnings_date'),
                            "dividend_date": calendar.get('dividend_date') or result['calendar'].get('dividend_date'),
                            "ex_dividend_date": calendar.get('ex_dividend_date') or result['calendar'].get('ex_dividend_date'),
                        })
                    elif isinstance(calendar, pd.DataFrame) and not calendar.empty:
                        if "Subject" in calendar.columns and "EndDate" in calendar.columns:
                            earnings_rows = calendar[
                                calendar["Subject"].astype(str).str.contains("Finansal Rapor", case=False, na=False)
                            ]
                            if not earnings_rows.empty:
                                result['calendar']["earnings_date"] = _coerce_date_string(earnings_rows.iloc[0].get("EndDate"))
            except Exception as cal_err:
                pass  # Calendar optional
            
            # =============================================
            # NEW DATA: ETF Holders (ETF Sahipliği)
            # =============================================
            try:
                etf_holders = ticker.etf_holders
                if etf_holders is not None and not etf_holders.empty:
                    etf_list = []
                    for _, row in etf_holders.head(10).iterrows():  # Top 10 ETFs
                        etf_list.append({
                            "symbol": row.get('symbol', ''),
                            "name": row.get('name', ''),
                            "exchange": row.get('exchange', ''),
                            "market_cap_usd": float(row.get('market_cap_usd', 0)) if row.get('market_cap_usd') else None,
                            "holding_weight_pct": float(row.get('holding_weight_pct', 0)) if row.get('holding_weight_pct') else None,
                            "issuer": row.get('issuer', ''),
                        })
                    result['etf_holders'] = etf_list
            except Exception as etf_err:
                pass  # ETF holders optional
            
            # =============================================
            # NEW DATA: ISIN Code
            # =============================================
            try:
                isin = ticker.isin
                if isin:
                    result['isin'] = isin
            except Exception as isin_err:
                pass  # ISIN optional
            
            # =============================================
            # NEW DATA: Supertrend Indicator
            # =============================================
            try:
                supertrend = ticker.supertrend()
                if supertrend:
                    result['supertrend'] = {
                        "value": supertrend.get('value'),
                        "direction": supertrend.get('direction'),  # 1 = uptrend, -1 = downtrend
                        "upper": supertrend.get('upper'),
                        "lower": supertrend.get('lower'),
                    }
                    # Easy to use direction indicator
                    result['supertrend_direction'] = '▲' if supertrend.get('direction') == 1 else '▼' if supertrend.get('direction') == -1 else '—'
            except Exception as st_err:
                pass  # Supertrend optional
            
            return result
            
        except Exception as e:
            # Only log non-429 errors (429s are expected during refresh)
            if '429' not in str(e):
                logger.exception("[BISTStore] Error fetching symbol", extra={"symbol": symbol, "error": str(e)})
            return None

    def hydrate_symbols(self, symbols: List[str], limit: int = 2) -> List[Dict[str, Any]]:
        """Fetch a small visible subset on demand so table gaps are filled without waiting for full refresh."""
        normalized_symbols: List[str] = []
        seen: set[str] = set()
        for raw_symbol in symbols:
            symbol = str(raw_symbol or "").strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            normalized_symbols.append(symbol)
            if len(normalized_symbols) >= limit:
                break

        if not normalized_symbols:
            return []

        try:
            global_reference = get_global_reference_snapshot()
        except Exception:
            global_reference = {}

        hydrated_results: List[Dict[str, Any]] = []
        for symbol in normalized_symbols:
            fetched = self._fetch_single_stock(symbol)
            if not fetched:
                continue
            try:
                fetched.update(compute_proprietary_scores(fetched, global_reference))
            except Exception:
                pass
            with self._lock:
                self._stocks[symbol] = fetched
            hydrated_results.append(
                self._attach_data_status(
                    fetched,
                    has_live_data=True,
                    has_snapshot_data=False,
                )
            )
        return hydrated_results
    
    def start_background_refresh(self):
        """Start background refresh thread"""
        if self._refresh_thread and self._refresh_thread.is_alive():
            return
        
        self._stop_refresh = False
        self._refresh_thread = threading.Thread(target=self._background_refresh_loop, daemon=True)
        self._refresh_thread.start()
        if self._upcoming_dividends_cache is None and not self._upcoming_dividends_scan_in_progress:
            threading.Thread(target=self._scan_upcoming_dividends, kwargs={"days": 60}, daemon=True).start()
        logger.info("[BISTStore] Background refresh thread started")
    
    def stop_background_refresh(self):
        """Stop background refresh"""
        self._stop_refresh = True
        if self._refresh_thread:
            self._refresh_thread.join(timeout=5)
    
    def _background_refresh_loop(self):
        """
        Continuously refresh all stocks in background.
        Each stock takes ~1.5s with delay = 584 stocks takes ~15 minutes.
        """
        # Initial delay to let app start
        time.sleep(5)
        
        while not self._stop_refresh:
            try:
                self._do_full_refresh()
            except Exception as e:
                logger.exception("[BISTStore] Refresh error", extra={"error": str(e)})
            
            # Wait before next refresh cycle (check every 30s if should stop)
            for _ in range(30):  # 15 minutes = 30 x 30 seconds
                if self._stop_refresh:
                    break
                time.sleep(30)
    
    def _do_full_refresh(self):
        """Refresh all tracked BIST stocks sequentially."""
        logger.info(f"[BISTStore] Starting full refresh at {datetime.now().strftime('%H:%M:%S')}")
        self._refresh_in_progress = True
        self._tracked_universe_index = "XU030"
        self._tracked_universe_label = "BIST 30"
        
        # Update USD/TRY rate first
        self._update_usd_try_rate()
        
        # Get symbols
        symbols = self._get_prioritized_symbols()
        if not symbols:
            logger.warning("[BISTStore] No symbols to refresh")
            self._refresh_in_progress = False
            return
        
        refreshed = 0
        errors = 0
        start_time = time.time()
        global_reference = None
        refreshed_batch: Dict[str, Dict[str, Any]] = {}
        current_stage_index = self._tracked_universe_index

        try:
            global_reference = get_global_reference_snapshot()
            logger.info(
                "[BISTStore] Global reference ready",
                extra={"daily_return_pct": global_reference.get("daily_return_pct")},
            )
        except Exception as e:
            logger.exception("[BISTStore] Global reference error", extra={"error": str(e)})
            global_reference = {
                "as_of": datetime.now().isoformat(),
                "daily_return_pct": 0.0,
                "total_trillion_usd": None,
                "items": [],
            }
        
        for i, symbol in enumerate(symbols):
            if self._stop_refresh:
                break

            stage_index, stage_label = self._refresh_stage_for_symbol(symbol)
            if stage_index != current_stage_index:
                current_stage_index = stage_index
                self._tracked_universe_index = stage_index
                self._tracked_universe_label = stage_label
                logger.info(f"[BISTStore] Refresh stage -> {stage_label}")
            
            try:
                data = self._fetch_single_stock(symbol)
                if data:
                    priority_rank = self._priority_symbols.get(symbol)
                    priority_label = self._priority_labels.get(symbol)
                    data["scan_priority_rank"] = priority_rank
                    data["scan_priority_label"] = priority_label or "Diger"
                    data["scan_priority_bucket"] = (
                        "xu30" if priority_rank == 1 else
                        "xu50" if priority_rank == 2 else
                        "xu100" if priority_rank == 3 else
                        "other"
                    )
                    try:
                        scores = compute_proprietary_scores(data, global_reference)
                        data.update(scores)
                    except Exception as score_err:
                        logger.exception(
                            "[BISTStore] Proprietary score error",
                            extra={"symbol": symbol, "error": str(score_err)},
                        )
                    with self._lock:
                        self._stocks[symbol] = data
                    refreshed_batch[symbol] = data
                    refreshed += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
            
            # Progress log every 50 stocks
            if (i + 1) % 50 == 0:
                elapsed = time.time() - start_time
                remaining = (len(symbols) - i - 1) * (elapsed / (i + 1))
                logger.info(f"[BISTStore] Progress: {i+1}/{len(symbols)} ({refreshed} OK, {errors} errors) - ETA: {remaining/60:.1f}m")
            
            # Delay between requests to avoid rate limiting
            # 1.5s delay = 584 stocks in ~15 minutes
            time.sleep(1.5)
        
        elapsed = time.time() - start_time

        try:
            if refreshed_batch:
                self._enrich_sector_context(refreshed_batch)
                for symbol, data in refreshed_batch.items():
                    try:
                        data.update(compute_proprietary_scores(data, global_reference))
                    except Exception as score_err:
                        logger.exception(
                            "[BISTStore] Sector-aware proprietary score error",
                            extra={"symbol": symbol, "error": str(score_err)},
                        )
                with self._lock:
                    self._stocks.update(refreshed_batch)
        except Exception as sector_err:
            logger.exception("[BISTStore] Sector context enrichment error", extra={"error": str(sector_err)})

        self._last_full_refresh = datetime.now()
        self._refresh_in_progress = False
        self._tracked_universe_index = "ALL"
        self._tracked_universe_label = "Tum BIST"

        try:
            snapshot_meta = save_bist_proprietary_snapshot(
                stocks_by_symbol=self._stocks,
                global_reference=global_reference,
                captured_at=self._last_full_refresh,
            )
            logger.info("[BISTStore] Proprietary snapshot saved", extra=snapshot_meta)
        except Exception as snapshot_err:
            logger.exception("[BISTStore] Proprietary snapshot save error", extra={"error": str(snapshot_err)})
        
        logger.info(f"[BISTStore] Refresh complete: {refreshed}/{len(symbols)} stocks in {elapsed/60:.1f} minutes")


# Global data store
data_store = BISTDataStore()


# =============================================
# API Endpoints
# =============================================

@router.get("/bist/stocks")
def get_bist_stocks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=10, le=100, description="Items per page"),
    sort_by: str = Query("symbol", description="Sort field"),
    sort_order: str = Query("asc", description="Sort order"),
    search: Optional[str] = Query(None, description="Search query"),
):
    """
    Get BIST stocks from cache.
    Data is refreshed in background every 15 minutes.
    """
    result = data_store.get_stocks_paginated(page, limit, search)
    
    # Sort if needed
    if sort_by != "symbol":
        reverse = sort_order == "desc"
        results = result["results"]
        if sort_by == "change_percent":
            results.sort(key=lambda x: x.get("change_percent", 0) or 0, reverse=reverse)
        elif sort_by == "volume":
            results.sort(key=lambda x: x.get("volume", 0) or 0, reverse=reverse)
        elif sort_by == "market_cap":
            results.sort(key=lambda x: x.get("market_cap", 0) or 0, reverse=reverse)
        elif sort_by == "pe":
            results.sort(key=lambda x: x.get("pe", 999) or 999, reverse=reverse)
        result["results"] = results
    
    return result


@router.get("/bist/stock/{symbol}")
def get_single_stock(symbol: str):
    """Get single stock data from cache"""
    stock = data_store.get_stock(symbol.upper())
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found in cache")
    return stock


@router.get("/bist/refresh/status")
def get_refresh_status():
    """Get background refresh status"""
    with data_store._lock:
        live_count = len(data_store._stocks)
        last_refresh = data_store._last_full_refresh.isoformat() if data_store._last_full_refresh else None
        refresh_in_progress = data_store._refresh_in_progress

    total_symbols = len(data_store._all_symbols)
    if total_symbols == 0:
        snapshot = load_latest_bist_proprietary_snapshot() or {}
        total_symbols = len(snapshot.get("stocks", []))

    return {
        "last_refresh": last_refresh,
        "refresh_in_progress": refresh_in_progress,
        "stocks_cached": live_count,
        "total_symbols": total_symbols or live_count,
        "universe_label": data_store._tracked_universe_label,
        "used_snapshot_fallback": live_count == 0 and total_symbols > 0,
    }


@router.post("/bist/refresh/trigger")
def trigger_refresh():
    """Manually trigger a refresh (for testing)"""
    if data_store._refresh_in_progress:
        return {"status": "already_running"}
    
    # Start refresh in background
    thread = threading.Thread(target=data_store._do_full_refresh, daemon=True)
    thread.start()
    
    return {"status": "started"}


@router.get("/bist/all")
def get_all_bist_stocks():
    """Get all cached stocks at once"""
    stocks, used_snapshot = data_store.get_all_stocks_or_snapshot()
    with data_store._lock:
        live_count = len(data_store._stocks)
    return {
        "results": stocks,
        "total": len(stocks),
        "last_refresh": data_store._last_full_refresh.isoformat() if data_store._last_full_refresh else None,
        "used_snapshot_fallback": used_snapshot,
        "live_count": live_count,
        "total_registered": len(data_store.get_symbols()) or len(stocks),
    }


@router.get("/bist/proprietary-snapshots/latest")
def get_latest_bist_proprietary_snapshot():
    """Get latest saved BIST proprietary snapshot"""
    snapshot = load_latest_bist_proprietary_snapshot()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No proprietary snapshot found yet")
    with data_store._lock:
        live_stocks = {symbol.upper(): dict(data) for symbol, data in data_store._stocks.items()}
    global_reference = snapshot.get("global_reference") if isinstance(snapshot, dict) else None

    snapshot_rows = [dict(item) for item in (snapshot.get("stocks", []) or [])]
    snapshot_by_symbol = {
        str(item.get("symbol") or "").upper(): item
        for item in snapshot_rows
        if item.get("symbol")
    }

    merged_rows: List[Dict[str, Any]] = []
    for symbol in data_store.get_symbols():
        live_stock = live_stocks.get(symbol)
        snapshot_stock = snapshot_by_symbol.get(symbol)

        if live_stock and snapshot_stock:
            merged_rows.append(
                data_store._attach_data_status(
                    data_store._merge_live_and_snapshot_stock(live_stock, snapshot_stock),
                    has_live_data=True,
                    has_snapshot_data=True,
                )
            )
            continue

        if live_stock:
            merged_rows.append(
                data_store._attach_data_status(
                    live_stock,
                    has_live_data=True,
                    has_snapshot_data=False,
                )
            )
            continue

        if snapshot_stock:
            merged_rows.append(
                data_store._attach_data_status(
                    data_store._hydrate_snapshot_stock(snapshot_stock, global_reference),
                    has_live_data=False,
                    has_snapshot_data=True,
                )
            )
            continue

        merged_rows.append(data_store._build_registered_only_stock(symbol))

    return {
        **snapshot,
        "stocks": merged_rows,
        "summary": {
            **(snapshot.get("summary") or {}),
            "stock_count": len(merged_rows),
            "live_count": len(live_stocks),
        },
    }


@router.post("/bist/hydrate")
def hydrate_bist_symbols(
    symbols: List[str] = Body(..., embed=True),
):
    """Hydrate a small visible subset of BIST rows on demand."""
    results = data_store.hydrate_symbols(symbols)
    return {
        "results": results,
        "total": len(results),
    }


@router.get("/bist/proprietary-outcomes/report")
def get_bist_proprietary_outcome_report(
    horizon_days: int = Query(1, ge=1, le=730, description="Forward holding horizon in days"),
    top_n: int = Query(20, ge=5, le=100, description="How many top names per segment"),
):
    """Get outcome/backtest summary from saved proprietary snapshots"""
    return build_bist_outcome_report(horizon_days=horizon_days, top_n=top_n)


@router.get("/bist/dividends/upcoming")
def get_bist_upcoming_dividends(
    days: int = Query(60, ge=1, le=365, description="Upcoming dividend window in days"),
    force: bool = Query(False, description="Force fresh dividend scan"),
):
    """Get upcoming dividend events across the full BIST universe."""
    return data_store.get_upcoming_dividends(days=days, force=force)


@router.get("/bist/opposite-stocks")
def get_bist_opposite_stocks(
    pair_limit: int = Query(12, ge=4, le=24, description="How many opposite pairs to return"),
    candidate_limit: int = Query(90, ge=30, le=150, description="How many liquid/prioritized symbols to scan"),
    force: bool = Query(False, description="Force fresh long-term relationship scan"),
    full_scan: bool = Query(False, description="Scan the full BIST universe instead of the prioritized subset"),
    window: str = Query("2y", pattern="^(1m|1y|2y|5y)$", description="Relationship window"),
):
    """Get opposite BIST stock pairs for the selected long-term window."""
    return data_store.get_opposite_stocks(
        force=force,
        pair_limit=pair_limit,
        candidate_limit=candidate_limit,
        full_scan=full_scan,
        window=window,
    )


@router.get("/bist/analysis-overview")
def get_bist_analysis_overview(
    window: str = Query("2y", pattern="^(1m|1y|2y|5y)$", description="Opposite pair window"),
):
    """Get a lightweight overview payload for the analysis/advice page."""
    return data_store.get_analysis_overview(window=window)


# =============================================
# Startup/Shutdown Hooks
# =============================================

def start_bist_refresh():
    """Call this on app startup"""
    data_store.start_background_refresh()


def stop_bist_refresh():
    """Call this on app shutdown"""
    data_store.stop_background_refresh()
