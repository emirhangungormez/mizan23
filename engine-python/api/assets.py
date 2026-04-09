"""
Asset Search API
Provides unified asset search across all supported markets.
"""

from fastapi import APIRouter, Query
from typing import Any, Dict, Iterable, List
import logging
import borsapy as bp

from engine.data.market_fetch import market_fetcher

logger = logging.getLogger("trade_intelligence")

router = APIRouter()

_ASSET_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_CACHE_INITIALIZED = False

_CRYPTO_NAME_ALIASES = {
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "XRP": "Ripple",
    "BNB": "BNB",
    "AVAX": "Avalanche",
    "DOGE": "Dogecoin",
    "ADA": "Cardano",
    "DOT": "Polkadot",
    "LINK": "Chainlink",
    "MATIC": "Polygon",
    "LTC": "Litecoin",
    "SHIB": "Shiba Inu",
    "UNI": "Uniswap",
    "ATOM": "Cosmos",
}


def _empty_asset_cache() -> Dict[str, List[Dict[str, Any]]]:
    return {
        "stocks": [],
        "us_stocks": [],
        "forex": [],
        "crypto": [],
        "commodities": [],
        "funds": [],
    }


def _repair_text(value: str) -> str:
    if not value:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    mojibake_markers = ("Ã", "Ä", "Å", "â", "Ð", "�")
    if not any(marker in text for marker in mojibake_markers):
        return text

    candidates = [text]
    for source_encoding in ("latin1", "cp1252", "cp1254"):
        try:
            candidates.append(text.encode(source_encoding).decode("utf-8"))
        except Exception:
            pass

    def score(candidate: str) -> tuple[int, int]:
        penalty = sum(candidate.count(marker) for marker in mojibake_markers)
        turkish_hits = sum(candidate.count(ch) for ch in "ığüşöçİĞÜŞÖÇ")
        return (penalty, -turkish_hits)

    return min(candidates, key=score)

def normalize_tr(text: str) -> str:
    if not text:
        return ""

    normalized = _repair_text(str(text)).strip().lower()
    char_map = str.maketrans({
        "ı": "i",
        "İ": "i",
        "ş": "s",
        "Ş": "s",
        "ğ": "g",
        "Ğ": "g",
        "ü": "u",
        "Ü": "u",
        "ö": "o",
        "Ö": "o",
        "ç": "c",
        "Ç": "c",
    })
    normalized = normalized.translate(char_map)
    return normalized.replace(".", "").replace(" ", "").upper()


def _append_unique_asset(target: List[Dict[str, Any]], asset: Dict[str, Any]) -> None:
    symbol = str(asset.get("symbol") or "").strip()
    if not symbol:
        return

    symbol_upper = symbol.upper()
    if any(str(item.get("symbol") or "").upper() == symbol_upper for item in target):
        return

    target.append(asset)


def _append_assets(
    target: List[Dict[str, Any]],
    rows: Iterable[Dict[str, Any]],
    *,
    type_value: str,
    default_market: str,
) -> None:
    for row in rows:
        symbol = str(row.get("symbol") or "").strip()
        if not symbol:
            continue

        name = _repair_text(str(row.get("name") or row.get("title") or symbol))
        if type_value == "crypto":
            alias_key = symbol.upper().replace("-USD", "").replace("TRY", "").replace("USDT", "")
            name = _CRYPTO_NAME_ALIASES.get(alias_key, name)

        asset = {
            "symbol": symbol,
            "name": name or symbol,
            "type": type_value,
            "market": _repair_text(str(row.get("market") or row.get("exchange") or default_market)),
            "sector": _repair_text(str(row.get("sector") or "")) or None,
            "category": _repair_text(str(row.get("category") or "")) or None,
            "unit": _repair_text(str(row.get("unit") or "")) or None,
        }
        _append_unique_asset(target, asset)


def _seed_forex_assets() -> List[Dict[str, Any]]:
    return [
        {"symbol": "USD", "name": "ABD Doları", "type": "forex", "market": "FX", "base": "USD", "quote": "TRY"},
        {"symbol": "EUR", "name": "Euro", "type": "forex", "market": "FX", "base": "EUR", "quote": "TRY"},
        {"symbol": "GBP", "name": "İngiliz Sterlini", "type": "forex", "market": "FX", "base": "GBP", "quote": "TRY"},
        {"symbol": "JPY", "name": "Japon Yeni", "type": "forex", "market": "FX", "base": "JPY", "quote": "TRY"},
        {"symbol": "CHF", "name": "İsviçre Frangı", "type": "forex", "market": "FX", "base": "CHF", "quote": "TRY"},
        {"symbol": "AUD", "name": "Avustralya Doları", "type": "forex", "market": "FX", "base": "AUD", "quote": "TRY"},
        {"symbol": "CAD", "name": "Kanada Doları", "type": "forex", "market": "FX", "base": "CAD", "quote": "TRY"},
    ]


async def initialize_asset_cache(force: bool = False):
    global _CACHE_INITIALIZED, _ASSET_CACHE

    if _CACHE_INITIALIZED and not force:
        return

    logger.info(f"[AssetSearch] {'RELOADING' if force else 'INITIALIZING'} asset cache...")
    _ASSET_CACHE = _empty_asset_cache()
    _ASSET_CACHE["forex"] = _seed_forex_assets()

    try:
        logger.info("[AssetSearch] Fetching BIST stocks...")
        stocks_df = bp.screen_stocks()
        stocks: List[Dict[str, Any]] = []
        if stocks_df is not None and not stocks_df.empty:
            for _, row in stocks_df.iterrows():
                symbol = row.get("symbol") or row.get("code")
                if not symbol:
                    continue
                stocks.append({
                    "symbol": str(symbol),
                    "name": _repair_text(str(row.get("name") or symbol)),
                    "type": "stock",
                    "market": "BIST",
                })
        _ASSET_CACHE["stocks"] = stocks
        logger.info(f"[AssetSearch] Loaded {len(stocks)} BIST stocks")
    except Exception as exc:
        logger.error(f"[AssetSearch] Error loading BIST stocks: {exc}")

    try:
        logger.info("[AssetSearch] Fetching US stocks...")
        us_payload = market_fetcher.get_all_us_stocks()
        _append_assets(
            _ASSET_CACHE["us_stocks"],
            us_payload.get("all") or [],
            type_value="stock",
            default_market="ABD",
        )
        logger.info(f"[AssetSearch] Loaded {len(_ASSET_CACHE['us_stocks'])} US stocks")
    except Exception as exc:
        logger.warning(f"[AssetSearch] Could not load US stocks: {exc}")

    try:
        logger.info("[AssetSearch] Fetching crypto assets...")
        crypto_payload = market_fetcher.get_all_crypto_analysis()
        _append_assets(
            _ASSET_CACHE["crypto"],
            crypto_payload.get("all") or [],
            type_value="crypto",
            default_market="Kripto",
        )
        logger.info(f"[AssetSearch] Loaded {len(_ASSET_CACHE['crypto'])} crypto assets")
    except Exception as exc:
        logger.warning(f"[AssetSearch] Could not load crypto assets: {exc}")

    try:
        logger.info("[AssetSearch] Fetching commodities...")
        commodities_payload = market_fetcher.get_all_commodities_analysis()
        _append_assets(
            _ASSET_CACHE["commodities"],
            commodities_payload.get("all") or [],
            type_value="commodity",
            default_market="Emtia",
        )
        logger.info(f"[AssetSearch] Loaded {len(_ASSET_CACHE['commodities'])} commodities")
    except Exception as exc:
        logger.warning(f"[AssetSearch] Could not load commodities: {exc}")

    try:
        logger.info("[AssetSearch] Fetching funds...")
        funds_payload = market_fetcher.get_all_funds()
        _append_assets(
            _ASSET_CACHE["funds"],
            funds_payload.get("all") or [],
            type_value="fund",
            default_market="Fon",
        )

        funds_df = bp.get_funds_list()
        if funds_df is not None and not funds_df.empty:
            fund_name_map = {
                str(row.get("code") or row.get("symbol")): _repair_text(
                    str(row.get("name") or row.get("code") or row.get("symbol"))
                )
                for _, row in funds_df.iterrows()
                if row.get("code") or row.get("symbol")
            }

            for fund in _ASSET_CACHE["funds"]:
                symbol = str(fund.get("symbol") or "")
                if symbol in fund_name_map:
                    fund["name"] = fund_name_map[symbol]

            if not _ASSET_CACHE["funds"]:
                for symbol, name in fund_name_map.items():
                    _append_unique_asset(
                        _ASSET_CACHE["funds"],
                        {
                            "symbol": symbol,
                            "name": name,
                            "type": "fund",
                            "market": "Fon",
                        },
                    )

        logger.info(f"[AssetSearch] Loaded {len(_ASSET_CACHE['funds'])} funds")
    except Exception as exc:
        logger.warning(f"[AssetSearch] Could not load funds: {exc}")

    for group in _ASSET_CACHE.values():
        for asset in group:
            asset["sym_norm"] = normalize_tr(str(asset.get("symbol") or ""))
            asset["name_norm"] = normalize_tr(str(asset.get("name") or ""))
            asset["market_norm"] = normalize_tr(str(asset.get("market") or ""))
            asset["type_norm"] = normalize_tr(str(asset.get("type") or ""))

    _CACHE_INITIALIZED = True
    logger.info("[AssetSearch] Asset cache initialization finished")


def search_assets(query: str, asset_type: str = "all", limit: int = 20) -> List[Dict[str, Any]]:
    norm_query = normalize_tr(query.strip())
    if not norm_query:
        return []

    asset_type_aliases = {
        "all": "all",
        "indices": "stocks",
        "stock": "stocks",
        "stocks": "stocks",
        "fx": "forex",
        "forex": "forex",
        "crypto": "crypto",
        "commodities": "commodities",
        "commodity": "commodities",
        "funds": "funds",
        "fund": "funds",
        "us": "us_stocks",
        "us_stocks": "us_stocks",
    }
    resolved_type = asset_type_aliases.get(asset_type, asset_type)

    search_types = (
        ["forex", "commodities", "crypto", "stocks", "us_stocks", "funds"]
        if resolved_type == "all"
        else [resolved_type]
    )

    is_gold_search = "ALTIN" in norm_query or "GOLD" in norm_query
    is_cert_search = "S1" in norm_query or "SERT" in norm_query

    scored_results = []
    seen_symbols = set()

    for search_type in search_types:
        for asset in _ASSET_CACHE.get(search_type, []):
            symbol = str(asset.get("symbol") or "").strip()
            if not symbol or symbol in seen_symbols:
                continue

            score = 0
            sym_norm = str(asset.get("sym_norm") or "")
            name_norm = str(asset.get("name_norm") or "")
            market_norm = str(asset.get("market_norm") or "")
            type_norm = str(asset.get("type_norm") or "")
            combined_norm = f"{sym_norm}{name_norm}{market_norm}{type_norm}"

            if norm_query == sym_norm or norm_query == name_norm:
                score = 1000
            elif sym_norm.startswith(norm_query) or name_norm.startswith(norm_query):
                score = 500
            elif norm_query in sym_norm or norm_query in name_norm:
                score = 250
            elif norm_query in market_norm or norm_query in type_norm:
                score = 200
            elif norm_query in combined_norm:
                score = 120

            if score <= 0:
                continue

            asset_type_value = str(asset.get("type") or "")
            if asset_type_value in {"gold", "commodity"} and is_gold_search:
                score += 500
                if is_cert_search and "S1" in sym_norm:
                    score += 2000

            if str(asset.get("market") or "").upper() == "FX":
                score += 50

            scored_results.append((score, asset))
            seen_symbols.add(symbol)

    scored_results.sort(key=lambda item: item[0], reverse=True)
    return [row for _, row in scored_results[:limit]]


def _enrich_with_quotes(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not results:
        return results

    quote_symbols = [str(asset.get("symbol") or "").strip() for asset in results if asset.get("symbol")]

    quote_lookup: Dict[str, Dict[str, Any]] = {}
    try:
        quotes = market_fetcher.get_batch_quotes(quote_symbols)
        quote_lookup = {
            str(item.get("symbol") or "").upper(): item
            for item in quotes
            if item and item.get("symbol")
        }
    except Exception as exc:
        logger.warning(f"[AssetSearch] Quote enrichment failed: {exc}")

    enriched: List[Dict[str, Any]] = []
    for asset in results:
        enriched_asset = dict(asset)
        symbol = str(enriched_asset.get("symbol") or "").upper()
        quote = quote_lookup.get(symbol)

        if quote:
            enriched_asset["price"] = quote.get("last")
            enriched_asset["change"] = quote.get("change_percent")
            enriched_asset["currency"] = quote.get("currency")
        else:
            market = str(enriched_asset.get("market") or "").upper()
            if market in {"BIST", "FX", "DÖVIZ", "DOVIZ"}:
                enriched_asset["currency"] = "TRY"
            elif market in {"NASDAQ", "NYSE", "CRYPTO", "CMDTY", "ABD", "EMTIA", "KRIPTO"}:
                enriched_asset["currency"] = "USD"

        enriched.append(enriched_asset)

    return enriched


@router.get("/search")
async def search_assets_endpoint(
    query: str = Query("", description="Search query (symbol or name)"),
    type: str = Query("all", description="Asset type filter"),
    limit: int = Query(20, description="Maximum results"),
):
    try:
        if not _CACHE_INITIALIZED:
            await initialize_asset_cache()

        results = _enrich_with_quotes(search_assets(query, type, limit))
        return {
            "success": True,
            "query": query,
            "type": type,
            "count": len(results),
            "results": results,
        }
    except Exception as exc:
        logger.error(f"[AssetSearch] Search error: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "results": [],
        }


@router.get("/stats")
async def get_asset_stats():
    if not _CACHE_INITIALIZED:
        await initialize_asset_cache()

    stats = {
        "initialized": _CACHE_INITIALIZED,
        "counts": {
            "stocks": len(_ASSET_CACHE.get("stocks", [])),
            "us_stocks": len(_ASSET_CACHE.get("us_stocks", [])),
            "forex": len(_ASSET_CACHE.get("forex", [])),
            "crypto": len(_ASSET_CACHE.get("crypto", [])),
            "commodities": len(_ASSET_CACHE.get("commodities", [])),
            "funds": len(_ASSET_CACHE.get("funds", [])),
        },
    }
    stats["counts"]["total"] = sum(stats["counts"].values())
    return stats
