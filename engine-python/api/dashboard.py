from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO, StringIO
from pathlib import Path
import json
import math
import re
import time
from typing import Any

import borsapy as bp
from fastapi import APIRouter, HTTPException
import pandas as pd
import requests
import yfinance as yf

router = APIRouter()

INDICATOR_PATH = Path(__file__).parent.parent.parent / "data" / "dashboard_indicators.json"

REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0"}
GLOBAL_ALPHA_CACHE_TTL_SECONDS = 15 * 60
_global_alpha_cache: dict[str, Any] = {"expires_at": 0.0, "data": None}
PBC_STATS_OVERVIEW_URL = "https://www.pbc.gov.cn/en/3688247/3688975/3718258/4503306/index.html"

GLOBAL_ALPHA_COLORS = {
    "usd": "#22c55e",
    "sp500": "#3b82f6",
    "china_eq": "#dc2626",
    "gold": "#f59e0b",
    "euro": "#8b5cf6",
    "bitcoin": "#f97316",
    "silver": "#94a3b8",
    "oil": "#ef4444",
    "wheat": "#d97706",
    "natgas": "#0f766e",
    "copper": "#b45309",
    "dxy": "#475569",
    "us10y": "#6366f1",
}

DEFAULT_GLOBAL_ALPHA_VALUES = {
    "usd": 22.7,
    "sp500": 59.8,
    "china_eq": 16.95,
    "gold": 33.3,
    "euro": 16.2,
    "bitcoin": 1.37,
    "silver": 4.26,
    "oil": 3.05,
    "wheat": 0.24,
    "natgas": 0.78,
    "copper": 0.31,
    "dxy": 1.0,
    "us10y": 1.0,
}

GLOBAL_ALPHA_SOURCE_QUALITY = {
    "usd": {"tier": "official", "confidence_score": 96},
    "euro": {"tier": "official", "confidence_score": 95},
    "bitcoin": {"tier": "strong", "confidence_score": 88},
    "gold": {"tier": "proxy", "confidence_score": 78},
    "silver": {"tier": "proxy", "confidence_score": 76},
    "sp500": {"tier": "proxy", "confidence_score": 74},
    "china_eq": {"tier": "official", "confidence_score": 92},
    "oil": {"tier": "proxy", "confidence_score": 79},
    "wheat": {"tier": "proxy", "confidence_score": 72},
    "natgas": {"tier": "proxy", "confidence_score": 74},
    "copper": {"tier": "proxy", "confidence_score": 76},
    "dxy": {"tier": "strong", "confidence_score": 83},
    "us10y": {"tier": "strong", "confidence_score": 85},
}

GLOBAL_ALPHA_PERIOD_MAP = {
    "daily": ("7d", 1),
    "weekly": ("1mo", 7),
    "monthly": ("3mo", 30),
    "ytd": ("1y", None),
    "yearly": ("2y", 365),
    "five_years": ("max", 1825),
    "all": ("max", None),
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_text(url: str, timeout: int = 20) -> str:
    response = requests.get(url, timeout=timeout, headers=REQUEST_HEADERS)
    response.raise_for_status()
    return response.text


def _parse_market_cap_from_html(url: str) -> float:
    html = _fetch_text(url)
    matches = re.findall(r"\$([0-9.,]+)\s*T", html)
    if not matches:
        raise ValueError(f"Market cap not found for {url}")
    return float(matches[0].replace(",", ""))


def _load_latest_snapshot_global_alpha_value(key: str) -> float | None:
    snapshot_candidates = [
        Path(__file__).parent.parent / "storage" / "proprietary_snapshots" / "latest_bist_snapshot.json",
        Path(__file__).parent.parent / "storage" / "proprietary_snapshots" / f"bist_snapshot_{datetime.now().strftime('%Y-%m-%d')}.json",
    ]

    for path in snapshot_candidates:
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            items = payload.get("global_reference", {}).get("items", [])
            for item in items:
                if item.get("key") == key:
                    value = item.get("estimated_value_trillion_usd")
                    if value is not None and math.isfinite(float(value)) and float(value) > 0:
                        return float(value)
        except Exception:
            continue

    return None


def _with_global_alpha_fallback(key: str, loader, *, fallback_source: str) -> tuple[float, str, bool]:
    try:
        return float(loader()), fallback_source, False
    except Exception:
        snapshot_value = _load_latest_snapshot_global_alpha_value(key)
        if snapshot_value is not None:
            return snapshot_value, "Snapshot fallback", True

        default_value = DEFAULT_GLOBAL_ALPHA_VALUES[key]
        return float(default_value), "Static fallback", True


def _get_usd_m2_trillion() -> float:
    html = _fetch_text("https://www.federalreserve.gov/releases/h6/current/default.htm")
    tables = pd.read_html(StringIO(html))
    if not tables:
      raise ValueError("Federal Reserve H6 table not found")

    table = tables[0]
    latest_row = table.iloc[-1]
    m2_value = latest_row[("Seasonally adjusted", "M2 2")]
    if hasattr(m2_value, "iloc"):
        m2_value = m2_value.iloc[0]
    m2_billions = float(m2_value)
    return m2_billions / 1000.0


def _get_euro_m2_trillion() -> float:
    url = "https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M20.X.1.U2.2300.Z01.E?format=jsondata"
    response = requests.get(url, timeout=20, headers={"Accept": "application/json", **REQUEST_HEADERS})
    response.raise_for_status()
    payload = response.json()
    dataset = payload["dataSets"][0]["series"]
    series = list(dataset.values())[0]
    observations = series["observations"]
    latest_key = sorted(observations.keys(), key=lambda value: int(value))[-1]
    latest_value_million_eur = float(observations[latest_key][0])
    return latest_value_million_eur / 1_000_000.0


def _get_bitcoin_market_cap_trillion() -> float:
    url = "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false"
    response = requests.get(url, timeout=20, headers=REQUEST_HEADERS)
    response.raise_for_status()
    payload = response.json()
    market_cap_usd = float(payload["market_data"]["market_cap"]["usd"])
    return market_cap_usd / 1_000_000_000_000.0


def _get_yfinance_last_price(symbol: str) -> float:
    history = yf.Ticker(symbol).history(period="7d", interval="1d", auto_adjust=True)
    if history is None or history.empty or "Close" not in history.columns:
        raise ValueError(f"Price history unavailable for {symbol}")
    closes = history["Close"].dropna()
    if closes.empty:
        raise ValueError(f"Close data unavailable for {symbol}")
    return float(closes.iloc[-1])


def _get_oil_market_proxy_trillion() -> float:
    # Proxy: annualized global oil flow value using live WTI price and long-run daily demand.
    # 102 million barrels/day * 365 * live oil price.
    oil_price = _get_yfinance_last_price("CL=F")
    annual_value_usd = 102_000_000 * 365 * oil_price
    return annual_value_usd / 1_000_000_000_000.0


def _make_absolute_pbc_url(path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"https://www.pbc.gov.cn{path}"


def _discover_latest_pbc_financial_market_stats_url() -> str:
    html = _fetch_text(PBC_STATS_OVERVIEW_URL)
    matches = re.findall(r'<a href="([^"]+)">(20\d{2})</a>', html)
    year_links = [(int(year), href) for href, year in matches]
    if not year_links:
        raise ValueError("PBC year index not found")

    current_year = datetime.now().year
    eligible = [item for item in year_links if item[0] <= current_year]
    selected_year, selected_href = max(eligible or year_links, key=lambda item: item[0])
    year_url = _make_absolute_pbc_url(selected_href)
    year_html = _fetch_text(year_url)

    page_matches = re.findall(r'<a href="([^"]+)">Financial Market Statistics</a>', year_html)
    if not page_matches:
        raise ValueError(f"PBC financial market statistics page not found for {selected_year}")

    return _make_absolute_pbc_url(page_matches[0])


def _discover_latest_pbc_stock_market_xls_url() -> str:
    stats_url = _discover_latest_pbc_financial_market_stats_url()
    html = _fetch_text(stats_url)
    start = html.find("Statistics of Stock Market")
    if start < 0:
        raise ValueError("PBC stock market section not found")
    snippet = html[start : start + 1200]
    xls_match = re.search(r'href="(?P<xls>[^"]+\.xlsx)"', snippet)
    if not xls_match:
        raise ValueError("PBC stock market xls link not found")
    return _make_absolute_pbc_url(xls_match.group("xls"))


def _get_china_equities_market_cap_trillion() -> float:
    xls_url = _discover_latest_pbc_stock_market_xls_url()
    response = requests.get(xls_url, timeout=20, headers=REQUEST_HEADERS)
    response.raise_for_status()

    frame = pd.read_excel(BytesIO(response.content), header=5)
    columns = list(frame.columns)
    market_cap_col = next((column for column in columns if "Total Market Capitalization" in str(column)), None)
    period_col = next((column for column in columns if "Unnamed: 0" in str(column) or str(column).strip() in {"", "0"}), columns[0] if columns else None)
    if market_cap_col is None or period_col is None:
        raise ValueError("PBC stock market capitalization column not found")

    working = frame[[period_col, market_cap_col]].copy()
    working.columns = ["period", "market_cap_100m_cny"]
    working = working[working["period"].astype(str).str.match(r"^20\d{2}\.(0?[1-9]|1[0-2])$")]
    if working.empty:
        raise ValueError("PBC stock market time series not found")

    latest_row = working.iloc[-1]
    market_cap_100m_cny = float(latest_row["market_cap_100m_cny"])
    usdcny = _get_yfinance_last_price("CNY=X")
    if usdcny <= 0:
        raise ValueError("CNYUSD conversion unavailable")

    market_cap_usd = market_cap_100m_cny * 100_000_000 / usdcny
    return market_cap_usd / 1_000_000_000_000.0


def _get_sp500_market_cap_trillion() -> float:
    html = _fetch_text("https://www.slickcharts.com/sp500")
    pattern = re.compile(
        r'<tr><td>\d+</td><td[^>]*><a href="/symbol/(?P<symbol>[^"]+)">(?P<name>[^<]+)</a></td>'
        r'<td><a href="/symbol/[^"]+">[^<]+</a></td><td>(?P<weight>[0-9.]+)%</td>',
        re.S,
    )
    matches = pattern.findall(html)
    if len(matches) < 3:
        raise ValueError("S&P 500 constituent weights not found")

    estimated_totals = []
    for symbol, _name, weight_str in matches[:3]:
        ticker = yf.Ticker(symbol)
        market_cap = getattr(ticker.fast_info, "market_cap", None)
        weight = float(weight_str) / 100.0
        if not market_cap or weight <= 0:
            continue
        estimated_totals.append(float(market_cap) / weight)

    if not estimated_totals:
        raise ValueError("S&P 500 total market cap estimate unavailable")

    return (sum(estimated_totals) / len(estimated_totals)) / 1_000_000_000_000.0


def _build_global_alpha_core_items() -> list[dict[str, Any]]:
    usd_value, usd_source, usd_fallback = _with_global_alpha_fallback(
        "usd",
        _get_usd_m2_trillion,
        fallback_source="Federal Reserve H6 M2",
    )
    sp500_value, sp500_source, sp500_fallback = _with_global_alpha_fallback(
        "sp500",
        _get_sp500_market_cap_trillion,
        fallback_source="Slickcharts + Yahoo Finance",
    )
    china_eq_value, china_eq_source, china_eq_fallback = _with_global_alpha_fallback(
        "china_eq",
        _get_china_equities_market_cap_trillion,
        fallback_source="PBC + CSRC stock market statistics",
    )
    gold_value, gold_source, gold_fallback = _with_global_alpha_fallback(
        "gold",
        lambda: _parse_market_cap_from_html("https://companiesmarketcap.com/gold/marketcap/"),
        fallback_source="CompaniesMarketCap",
    )
    euro_value, euro_source, euro_fallback = _with_global_alpha_fallback(
        "euro",
        _get_euro_m2_trillion,
        fallback_source="ECB BSI M2",
    )
    bitcoin_value, bitcoin_source, bitcoin_fallback = _with_global_alpha_fallback(
        "bitcoin",
        _get_bitcoin_market_cap_trillion,
        fallback_source="CoinGecko",
    )
    silver_value, silver_source, silver_fallback = _with_global_alpha_fallback(
        "silver",
        lambda: _parse_market_cap_from_html("https://companiesmarketcap.com/silver/marketcap/"),
        fallback_source="CompaniesMarketCap",
    )
    oil_value, oil_source, oil_fallback = _with_global_alpha_fallback(
        "oil",
        _get_oil_market_proxy_trillion,
        fallback_source="Annualized crude flow proxy",
    )

    raw_items = [
        {
            "key": "usd",
            "label": "Dolar Likiditesi",
            "symbol": "USD",
            "estimated_value_trillion_usd": usd_value,
            "source": usd_source,
            "used_fallback": usd_fallback,
        },
        {
            "key": "sp500",
            "label": "S&P 500",
            "symbol": "^GSPC",
            "estimated_value_trillion_usd": sp500_value,
            "source": sp500_source,
            "used_fallback": sp500_fallback,
        },
        {
            "key": "china_eq",
            "label": "Cin Hisseleri",
            "symbol": "000001.SS",
            "estimated_value_trillion_usd": china_eq_value,
            "source": china_eq_source,
            "used_fallback": china_eq_fallback,
        },
        {
            "key": "gold",
            "label": "Altin",
            "symbol": "XAU",
            "estimated_value_trillion_usd": gold_value,
            "source": gold_source,
            "used_fallback": gold_fallback,
        },
        {
            "key": "euro",
            "label": "Euro",
            "symbol": "EUR",
            "estimated_value_trillion_usd": euro_value,
            "source": euro_source,
            "used_fallback": euro_fallback,
        },
        {
            "key": "bitcoin",
            "label": "Bitcoin",
            "symbol": "BTC",
            "estimated_value_trillion_usd": bitcoin_value,
            "source": bitcoin_source,
            "used_fallback": bitcoin_fallback,
        },
        {
            "key": "silver",
            "label": "Gumus",
            "symbol": "XAG",
            "estimated_value_trillion_usd": silver_value,
            "source": silver_source,
            "used_fallback": silver_fallback,
        },
        {
            "key": "oil",
            "label": "Petrol",
            "symbol": "CL=F",
            "estimated_value_trillion_usd": oil_value,
            "source": oil_source,
            "used_fallback": oil_fallback,
        },
    ]

    clean_items = []
    for item in raw_items:
        value = item["estimated_value_trillion_usd"]
        if value is None or not math.isfinite(value) or value <= 0:
            continue

        clean_items.append(
            {
                **item,
                "estimated_value_trillion_usd": round(float(value), 3),
                "color": GLOBAL_ALPHA_COLORS[item["key"]],
                "source_quality": {
                    **GLOBAL_ALPHA_SOURCE_QUALITY.get(item["key"], {"tier": "unknown", "confidence_score": 50}),
                    "confidence_score": max(
                        45,
                        GLOBAL_ALPHA_SOURCE_QUALITY.get(item["key"], {"confidence_score": 50})["confidence_score"] - (18 if item.get("used_fallback") else 0),
                    ),
                },
            }
        )

    total = sum(item["estimated_value_trillion_usd"] for item in clean_items)
    for item in clean_items:
        item["share"] = round((item["estimated_value_trillion_usd"] / total) * 100, 4) if total > 0 else 0.0

    return clean_items


def _build_macro_sidecar_items() -> list[dict[str, Any]]:
    sidecar_specs = [
        {"key": "wheat", "label": "Bugday", "symbol": "ZW=F", "estimated_value_trillion_usd": DEFAULT_GLOBAL_ALPHA_VALUES["wheat"], "source": "Wheat futures proxy"},
        {"key": "natgas", "label": "Dogalgaz", "symbol": "NG=F", "estimated_value_trillion_usd": DEFAULT_GLOBAL_ALPHA_VALUES["natgas"], "source": "NatGas futures proxy"},
        {"key": "copper", "label": "Bakir", "symbol": "HG=F", "estimated_value_trillion_usd": DEFAULT_GLOBAL_ALPHA_VALUES["copper"], "source": "Copper futures proxy"},
        {"key": "dxy", "label": "DXY", "symbol": "DX-Y.NYB", "estimated_value_trillion_usd": DEFAULT_GLOBAL_ALPHA_VALUES["dxy"], "source": "Dollar Index"},
        {"key": "us10y", "label": "ABD 10Y", "symbol": "^TNX", "estimated_value_trillion_usd": DEFAULT_GLOBAL_ALPHA_VALUES["us10y"], "source": "Treasury yield proxy"},
    ]

    items: list[dict[str, Any]] = []
    for item in sidecar_specs:
        confidence_meta = GLOBAL_ALPHA_SOURCE_QUALITY.get(item["key"], {"tier": "proxy", "confidence_score": 70})
        items.append(
            {
                **item,
                "estimated_value_trillion_usd": round(float(item["estimated_value_trillion_usd"]), 3),
                "color": GLOBAL_ALPHA_COLORS[item["key"]],
                "source_quality": confidence_meta,
            }
        )
    return items


def _get_period_return_pct(symbol: str, period_key: str = "daily") -> float:
    fetch_period, target_days = GLOBAL_ALPHA_PERIOD_MAP.get(period_key, GLOBAL_ALPHA_PERIOD_MAP["daily"])
    history = yf.Ticker(symbol).history(period=fetch_period, interval="1d", auto_adjust=True)
    if history is None or history.empty or "Close" not in history.columns or len(history["Close"]) < 2:
        raise ValueError(f"Insufficient history for {symbol}")

    closes = history["Close"].dropna()
    if len(closes) < 2:
        raise ValueError(f"Missing close data for {symbol}")

    latest_close = float(closes.iloc[-1])
    latest_index = closes.index[-1]

    if target_days is None:
        previous_close = float(closes.iloc[0])
    else:
        target_ts = latest_index - pd.Timedelta(days=target_days)
        past_slice = closes[closes.index <= target_ts]
        previous_close = float(past_slice.iloc[-1]) if len(past_slice) > 0 else float(closes.iloc[0])

    if previous_close <= 0:
        raise ValueError(f"Invalid previous close for {symbol}")

    return ((latest_close / previous_close) - 1.0) * 100.0


def _get_global_alpha_period_return_pct(items: list[dict[str, Any]], period_key: str = "daily") -> float:
    return_symbol_map = {
        "usd": "DX-Y.NYB",
        "sp500": "^GSPC",
        "china_eq": "000001.SS",
        "gold": "GC=F",
        "euro": "EURUSD=X",
        "bitcoin": "BTC-USD",
        "silver": "SI=F",
        "oil": "CL=F",
    }

    weighted_returns = []
    for item in items:
        symbol = return_symbol_map.get(item.get("key"))
        if not symbol:
            continue

        try:
            daily_return_pct = _get_period_return_pct(symbol, period_key=period_key)
        except Exception:
            daily_return_pct = 0.0

        weighted_returns.append((float(item.get("share", 0.0)) / 100.0) * daily_return_pct)

    return round(sum(weighted_returns), 4)


def _get_sidecar_period_returns(items: list[dict[str, Any]], period_key: str = "daily") -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in items:
        symbol = item.get("symbol")
        if not symbol:
            continue
        try:
            period_return_pct = _get_period_return_pct(str(symbol), period_key=period_key)
        except Exception:
            period_return_pct = 0.0
        output.append(
            {
                **item,
                "period_return_pct": round(period_return_pct, 4),
            }
        )
    return output


def _classify_macro_regime(core_daily_return_pct: float, core_items: list[dict[str, Any]], sidecar_items: list[dict[str, Any]]) -> str:
    core_map = {str(item.get("key")): float(item.get("daily_return_pct") or 0.0) for item in core_items}
    sidecar_map = {str(item.get("key")): float(item.get("period_return_pct") or 0.0) for item in sidecar_items}
    oil = core_map.get("oil", 0.0)
    natgas = sidecar_map.get("natgas", 0.0)
    wheat = sidecar_map.get("wheat", 0.0)
    dxy = sidecar_map.get("dxy", 0.0)
    us10y = sidecar_map.get("us10y", 0.0)

    if natgas > 3.0 or oil > 2.5:
        return "energy_stress"
    if dxy > 0.8 or us10y > 1.5:
        return "risk_off"
    if wheat > 2.0 and core_daily_return_pct < 0.3:
        return "inflation_pressure"
    if core_daily_return_pct > 0.75 and dxy <= 0.2:
        return "risk_on"
    return "balanced"


def _get_global_alpha_payload(force: bool = False, period: str = "daily") -> dict[str, Any]:
    now = time.time()
    cached = _global_alpha_cache.get("data")
    expires_at = float(_global_alpha_cache.get("expires_at") or 0)

    if not force and cached and cached.get("period") == period and expires_at > now:
        return cached

    core_items = _build_global_alpha_core_items()
    core_return_symbol_map = {
        "usd": "DX-Y.NYB",
        "sp500": "^GSPC",
        "china_eq": "000001.SS",
        "gold": "GC=F",
        "euro": "EURUSD=X",
        "bitcoin": "BTC-USD",
        "silver": "SI=F",
        "oil": "CL=F",
    }
    for item in core_items:
        symbol = core_return_symbol_map.get(str(item.get("key")))
        try:
            item["daily_return_pct"] = round(_get_period_return_pct(symbol, period_key=period), 4) if symbol else 0.0
        except Exception:
            item["daily_return_pct"] = 0.0
    macro_sidecar_items = _get_sidecar_period_returns(_build_macro_sidecar_items(), period_key=period)
    total = round(sum(item["estimated_value_trillion_usd"] for item in core_items), 3)
    core_daily_return_pct = _get_global_alpha_period_return_pct(core_items, period_key=period)
    macro_regime_label = _classify_macro_regime(core_daily_return_pct, core_items, macro_sidecar_items)
    payload = {
        "as_of": _utc_now_iso(),
        "total_trillion_usd": total,
        "daily_return_pct": core_daily_return_pct,
        "core_daily_return_pct": core_daily_return_pct,
        "period": period,
        "items": core_items,
        "core_items": core_items,
        "macro_sidecar_items": macro_sidecar_items,
        "count": len(core_items),
        "core_count": len(core_items),
        "macro_sidecar_count": len(macro_sidecar_items),
        "confidence_score": round(sum(float(item["source_quality"]["confidence_score"]) for item in core_items) / len(core_items), 2) if core_items else 0.0,
        "macro_regime_label": macro_regime_label,
        "ga_label": "Global Alpha (Core)",
        "macro_label": "Makro Rejim",
        "from_cache": False,
    }

    _global_alpha_cache["data"] = payload
    _global_alpha_cache["expires_at"] = now + GLOBAL_ALPHA_CACHE_TTL_SECONDS
    return payload


def _get_dashboard_indicators_impl():
    """
    Dashboard'da gösterilecek göstergelerin listesini ve güncel verilerini döner.
    """
    if not INDICATOR_PATH.exists():
        raise HTTPException(status_code=404, detail="Indicator config not found")

    with open(INDICATOR_PATH, "r", encoding="utf-8") as f:
        indicators = json.load(f)

    results = []
    for item in indicators:
        value = None
        change = None
        try:
            if item["type"] == "commodity":
                fx = bp.FX(item["symbol"])
                hist = fx.history(period="1d")
                if hist is not None and not hist.empty:
                    value = float(hist["Close"].iloc[-1])
                    if len(hist) > 1:
                        change = round((hist["Close"].iloc[-1] - hist["Close"].iloc[-2]) / hist["Close"].iloc[-2] * 100, 2)
            elif item["type"] == "index":
                idx = bp.Index(item["symbol"])
                hist = idx.history(period="1d")
                if hist is not None and not hist.empty:
                    value = float(hist["Close"].iloc[-1])
                    if len(hist) > 1:
                        change = round((hist["Close"].iloc[-1] - hist["Close"].iloc[-2]) / hist["Close"].iloc[-2] * 100, 2)
            elif item["type"] == "fx":
                fx = bp.FX(item["symbol"])
                hist = fx.history(period="1d")
                if hist is not None and not hist.empty:
                    value = float(hist["Close"].iloc[-1])
                    if len(hist) > 1:
                        change = round((hist["Close"].iloc[-1] - hist["Close"].iloc[-2]) / hist["Close"].iloc[-2] * 100, 2)
        except Exception:
            value = None
            change = None

        results.append(
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "type": item["type"],
                "value": value,
                "change": change,
            }
        )

    return results


def _get_global_alpha_impl(force: bool = False, period: str = "daily"):
    """
    Global Alpha dağılımını canlı kaynaklardan üretir.
    """
    try:
        return _get_global_alpha_payload(force=force, period=period)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Global alpha fetch failed: {exc}") from exc


@router.get("/indicators")
@router.get("/dashboard/indicators")
def get_dashboard_indicators():
    return _get_dashboard_indicators_impl()


@router.get("/global-alpha")
@router.get("/dashboard/global-alpha")
def get_global_alpha(force: bool = False, period: str = "daily"):
    return _get_global_alpha_impl(force=force, period=period)
