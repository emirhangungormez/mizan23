"""
Company Financials Module
Fetches and calculates financial metrics for BIST companies using borsapy.
"""

import borsapy as bp
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime
import json
import os
from engine.storage.db import get_company_profile, get_company_shareholders, get_company_subsidiaries
from engine.data.borsapy_v072_extensions import get_bank_financials
from engine.data.bist_fallbacks import load_bist_reference_stock


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_dividend_amount(value: Any) -> Optional[float]:
    if isinstance(value, pd.Series):
        for key in ("Amount", "amount", "NetRate", "net_rate", "GrossRate", "gross_rate"):
            if key in value.index:
                parsed = _safe_float(value.get(key))
                if parsed is not None:
                    return parsed
        return None
    return _safe_float(value)


def _normalize_raw_dividend_yield(value: Any) -> Optional[float]:
    parsed = _safe_float(value)
    if parsed is None or parsed <= 0:
        return None
    if parsed <= 1:
        return round(parsed * 100, 2)
    if parsed <= 25:
        return round(parsed, 2)
    return None


def _compute_safe_dividend_yield(
    *,
    raw_dividend_yield: Any,
    dividend_rate: Any,
    last_price: Any,
    dividends: Any = None,
) -> Optional[float]:
    price = _safe_float(last_price)
    if price is not None and price > 0 and dividends is not None:
        try:
            now = pd.Timestamp.now().normalize()
            trailing_cutoff = now - pd.Timedelta(days=365)
            forward_cutoff = now + pd.Timedelta(days=365)
            trailing_sum = 0.0
            forward_sum = 0.0

            if isinstance(dividends, pd.DataFrame):
                iterator = dividends.iterrows()
            elif isinstance(dividends, pd.Series):
                iterator = dividends.items()
            else:
                iterator = []

            for raw_date, raw_value in iterator:
                parsed_date = pd.to_datetime(raw_date, errors="coerce")
                if parsed_date is None or pd.isna(parsed_date):
                    continue
                amount = _extract_dividend_amount(raw_value)
                if amount is None or amount <= 0:
                    continue
                normalized_date = parsed_date.normalize()
                if trailing_cutoff <= normalized_date < now:
                    trailing_sum += amount
                if now <= normalized_date <= forward_cutoff:
                    forward_sum += amount

            yield_candidates = []
            if forward_sum > 0:
                yield_candidates.append(round((forward_sum / price) * 100, 2))
            if trailing_sum > 0:
                yield_candidates.append(round((trailing_sum / price) * 100, 2))
            if yield_candidates:
                return max(yield_candidates)
        except Exception:
            pass

    rate = _safe_float(dividend_rate)
    if price is not None and price > 0 and rate is not None and rate > 0:
        return round((rate / price) * 100, 2)

    return _normalize_raw_dividend_yield(raw_dividend_yield)


class CompanyFinancials:
    """
    Comprehensive financial analysis for BIST companies.
    Data source: borsapy (KAP integration)
    """
    
    # Turkish to English key mapping for normalized output
    BALANCE_SHEET_MAP = {
        "Dönen Varlıklar": "current_assets",
        "Nakit ve Nakit Benzerleri": "cash",
        "Ticari Alacaklar": "trade_receivables",
        "Stoklar": "inventories",
        "Duran Varlıklar": "non_current_assets",
        "Maddi Duran Varlıklar": "fixed_assets",
        "TOPLAM VARLIKLAR": "total_assets",
        "Kısa Vadeli Yükümlülükler": "current_liabilities",
        "Finansal Borçlar": "short_term_debt",
        "Ticari Borçlar": "trade_payables",
        "Uzun Vadeli Yükümlülükler": "non_current_liabilities",
        "Özkaynaklar": "equity",
        "Ana Ortaklığa Ait Özkaynaklar": "parent_equity",
    }
    
    INCOME_STMT_MAP = {
        "Satış Gelirleri": "revenue",
        "Satışların Maliyeti": "cost_of_sales",
        "BRÜT KAR/ZARAR": "gross_profit",
        "Faaliyet Karı/Zararı": "operating_profit",
        "ESAS FAALİYET KARI/ZARARI": "ebit",
        "Finansman Giderleri": "interest_expense",
        "Amortisman": "depreciation",
        "Net Dönem Karı/Zararı": "net_profit",
        "Ana Ortaklık Payları": "parent_net_profit",
    }
    
    CASHFLOW_MAP = {
        "İşletme Faaliyetlerinden Nakit Akışları": "operating_cf",
        "Yatırım Faaliyetlerinden Nakit Akışları": "investing_cf",
        "Finansman Faaliyetlerinden Nakit Akışları": "financing_cf",
    }
    
    BANK_SYMBOLS = {
        "AKBNK", "ALBRK", "GARAN", "HALKB", "ICBCT", "ISCTR",
        "QNBFB", "SKBNK", "TSKB", "VAKBN", "YKBNK",
    }

    def __init__(self, symbol: str):
        self.symbol = symbol.upper().replace(".IS", "").replace(".E", "")
        self._ticker = None
        self._info = None
        self._balance_sheet = None
        self._income_stmt = None
        self._cashflow = None
        self._quarterly_balance_sheet = None
        self._quarterly_income_stmt = None
        self._quarterly_cashflow = None
        self._key_metrics_cache = None
        self._quarterly_summary_cache = None
        self._score_card_cache = None
        self._bank_financials = None
        self._quarterly_bank_financials = None
        
    def _get_ticker(self):
        if self._ticker is None:
            self._ticker = bp.Ticker(self.symbol)
        return self._ticker

    def _is_bank_symbol(self) -> bool:
        return self.symbol in self.BANK_SYMBOLS

    def _get_bank_financial_bundle(self, quarterly: bool = False) -> Dict[str, pd.DataFrame]:
        cache = self._quarterly_bank_financials if quarterly else self._bank_financials
        if cache is not None:
            return cache

        bundle = get_bank_financials(self.symbol, quarterly=quarterly) if self._is_bank_symbol() else {}
        if quarterly:
            self._quarterly_bank_financials = bundle
        else:
            self._bank_financials = bundle
        return bundle
    
    def _get_info(self) -> Dict:
        if self._info is None:
            try:
                self._info = dict(self._get_ticker().info)
            except:
                self._info = {}
            reference = load_bist_reference_stock(self.symbol) or {}
            if reference:
                if not self._info.get("longName") and reference.get("name"):
                    self._info["longName"] = reference.get("name")
                if not self._info.get("shortName") and reference.get("name"):
                    self._info["shortName"] = reference.get("name")
                if not self._info.get("sector") and reference.get("sector"):
                    self._info["sector"] = reference.get("sector")
                if not self._info.get("industry") and reference.get("industry"):
                    self._info["industry"] = reference.get("industry")
                if not self._info.get("website") and reference.get("website"):
                    self._info["website"] = reference.get("website")
                if not self._info.get("last") and reference.get("last") is not None:
                    self._info["last"] = reference.get("last")
                if not self._info.get("currentPrice") and reference.get("last") is not None:
                    self._info["currentPrice"] = reference.get("last")
                if not self._info.get("change_percent") and reference.get("change_percent") is not None:
                    self._info["change_percent"] = reference.get("change_percent")
                if not self._info.get("marketCap") and reference.get("market_cap") is not None:
                    self._info["marketCap"] = reference.get("market_cap")
                if not self._info.get("exchange"):
                    self._info["exchange"] = reference.get("exchange") or "BIST"
                if not self._info.get("currency"):
                    self._info["currency"] = reference.get("currency") or "TRY"
        return self._info
    
    def _normalize_df(self, df: pd.DataFrame, mapping: Dict) -> pd.DataFrame:
        """Normalize DataFrame index using mapping."""
        if df is None or df.empty:
            return pd.DataFrame()
        
        # Clean index (remove leading spaces and normalize)
        df.index = df.index.str.strip()
        
        # Create normalized version
        normalized = {}
        for tr_key, en_key in mapping.items():
            # Try exact match first
            if tr_key in df.index:
                normalized[en_key] = df.loc[tr_key]
            else:
                # Try partial match
                matches = [idx for idx in df.index if tr_key.lower() in idx.lower()]
                if matches:
                    normalized[en_key] = df.loc[matches[0]]
        
        if normalized:
            return pd.DataFrame(normalized).T
        return df
    
    # ========================================
    # RAW DATA FETCHERS
    # ========================================
    
    def get_balance_sheet(self, quarterly: bool = False) -> pd.DataFrame:
        """Get balance sheet data (annual or quarterly)."""
        if quarterly and self._quarterly_balance_sheet is not None:
            return self._quarterly_balance_sheet
        if not quarterly and self._balance_sheet is not None:
            return self._balance_sheet

        try:
            t = self._get_ticker()
            df = t.quarterly_balance_sheet if quarterly else t.balance_sheet
            if (df is None or df.empty) and self._is_bank_symbol():
                df = self._get_bank_financial_bundle(quarterly=quarterly).get("balance_sheet")
            resolved = df if df is not None else pd.DataFrame()
            if quarterly:
                self._quarterly_balance_sheet = resolved
            else:
                self._balance_sheet = resolved
            return resolved
        except Exception as e:
            print(f"[CompanyFinancials] Balance sheet error for {self.symbol}: {e}")
            if self._is_bank_symbol():
                fallback = self._get_bank_financial_bundle(quarterly=quarterly).get("balance_sheet")
                if fallback is not None and not fallback.empty:
                    if quarterly:
                        self._quarterly_balance_sheet = fallback
                    else:
                        self._balance_sheet = fallback
                    return fallback
            return pd.DataFrame()
    
    def get_income_statement(self, quarterly: bool = False) -> pd.DataFrame:
        """Get income statement (annual or quarterly)."""
        if quarterly and self._quarterly_income_stmt is not None:
            return self._quarterly_income_stmt
        if not quarterly and self._income_stmt is not None:
            return self._income_stmt

        try:
            t = self._get_ticker()
            df = t.quarterly_income_stmt if quarterly else t.income_stmt
            if (df is None or df.empty) and self._is_bank_symbol():
                df = self._get_bank_financial_bundle(quarterly=quarterly).get("income_stmt")
            resolved = df if df is not None else pd.DataFrame()
            if quarterly:
                self._quarterly_income_stmt = resolved
            else:
                self._income_stmt = resolved
            return resolved
        except Exception as e:
            print(f"[CompanyFinancials] Income statement error for {self.symbol}: {e}")
            if self._is_bank_symbol():
                fallback = self._get_bank_financial_bundle(quarterly=quarterly).get("income_stmt")
                if fallback is not None and not fallback.empty:
                    if quarterly:
                        self._quarterly_income_stmt = fallback
                    else:
                        self._income_stmt = fallback
                    return fallback
            return pd.DataFrame()
    
    def get_cashflow(self, quarterly: bool = False) -> pd.DataFrame:
        """Get cash flow statement (annual or quarterly)."""
        if quarterly and self._quarterly_cashflow is not None:
            return self._quarterly_cashflow
        if not quarterly and self._cashflow is not None:
            return self._cashflow

        try:
            t = self._get_ticker()
            df = t.quarterly_cashflow if quarterly else t.cashflow
            if (df is None or df.empty) and self._is_bank_symbol():
                df = self._get_bank_financial_bundle(quarterly=quarterly).get("cashflow")
            resolved = df if df is not None else pd.DataFrame()
            if quarterly:
                self._quarterly_cashflow = resolved
            else:
                self._cashflow = resolved
            return resolved
        except Exception as e:
            print(f"[CompanyFinancials] Cash flow error for {self.symbol}: {e}")
            if self._is_bank_symbol():
                fallback = self._get_bank_financial_bundle(quarterly=quarterly).get("cashflow")
                if fallback is not None and not fallback.empty:
                    if quarterly:
                        self._quarterly_cashflow = fallback
                    else:
                        self._cashflow = fallback
                    return fallback
            return pd.DataFrame()
    
    # ========================================
    # CALCULATED METRICS
    # ========================================
    
    def get_key_metrics(self) -> Dict[str, Any]:
        """
        Calculate key financial metrics.
        Returns dict with all calculated ratios and metrics.
        """
        if self._key_metrics_cache is not None:
            return self._key_metrics_cache

        metrics = {
            "symbol": self.symbol,
            "calculated_at": datetime.now().isoformat(),
            "income": {},
            "previous_income": {},
            "balance": {},
            "previous_balance": {},
            "ratios": {},
            "multiples": {},
            "growth": {},
        }
        
        try:
            info = self._get_info()
            bs = self.get_balance_sheet()
            inc = self.get_income_statement()
            cf = self.get_cashflow()
            
            # Latest period (first column)
            latest_period = bs.columns[0] if not bs.empty else None
            
            # Helper to extract full dataset for a period
            def extract_financials(df, period, map_func):
                if period not in df.columns: return {}
                return map_func(df, period)

            # ========================================
            # INCOME STATEMENT METRICS
            # ========================================
            if not inc.empty and latest_period in inc.columns:
                def get_income_data(period):
                    revenue = self._find_value(inc, period, ["Satış Gelirleri", "Hasılat"])
                    gross_profit = self._find_value(inc, period, ["BRÜT KAR", "Brüt Kar"])
                    operating_profit = self._find_value(inc, period, ["Faaliyet Karı", "ESAS FAALİYET"])
                    net_profit = self._find_value(inc, period, ["Net Dönem Karı", "Dönem Karı"])
                    
                    return {
                        "revenue": revenue,
                        "gross_profit": gross_profit,
                        "operating_profit": operating_profit,
                        "net_profit": net_profit,
                        "gross_margin": (gross_profit / revenue * 100) if (revenue and gross_profit) else None,
                        "operating_margin": (operating_profit / revenue * 100) if (revenue and operating_profit) else None,
                        "net_margin": (net_profit / revenue * 100) if (revenue and net_profit) else None,
                        "period": period 
                    }

                metrics["income"] = get_income_data(latest_period)
                
                # Previous Year Comparison (YoY)
                try:
                    # Robust period parsing
                    current_date = None
                    try:
                        if isinstance(latest_period, (pd.Timestamp, datetime)):
                            current_date = latest_period
                        else:
                            # Try parsing string formats
                            clean_p = str(latest_period).strip()
                            if "/" in clean_p:
                                parts = clean_p.split("/")
                                if len(parts) == 2: # YYYY/MM
                                    current_date = datetime(int(parts[0]), int(parts[1]), 1)
                            elif "-" in clean_p: # YYYY-MM-DD
                                current_date = pd.to_datetime(clean_p)
                    except:
                        pass

                    if current_date:
                        # Target: Same month, previous year
                        prev_year = current_date.year - 1
                        target_month = current_date.month
                        
                        # Search for matching column
                        found_period = None
                        for col in inc.columns:
                            try:
                                col_date = None
                                if isinstance(col, (pd.Timestamp, datetime)):
                                    col_date = col
                                else:
                                    # Try parsing column headers
                                    c_str = str(col).strip()
                                    if "/" in c_str:
                                        p = c_str.split("/")
                                        col_date = datetime(int(p[0]), int(p[1]), 1)
                                    else:
                                        col_date = pd.to_datetime(col)
                                
                                if col_date and col_date.year == prev_year and col_date.month == target_month:
                                    found_period = col
                                    break
                            except:
                                continue
                        
                        if found_period:
                            metrics["previous_income"] = get_income_data(found_period)
                except Exception as e:
                    print(f"[CompanyFinancials] Prev income error: {e}")

            
            # ========================================
            # BALANCE SHEET METRICS
            # ========================================
            if not bs.empty and latest_period in bs.columns:
                def get_balance_data(period):
                    current_assets = self._find_value(bs, period, ["Dönen Varlıklar"])
                    non_current_assets = self._find_value(bs, period, ["Duran Varlıklar"])
                    total_assets = self._find_value(bs, period, ["TOPLAM VARLIKLAR"])
                    current_liabilities = self._find_value(bs, period, ["Kısa Vadeli Yükümlülükler"])
                    non_current_liabilities = self._find_value(bs, period, ["Uzun Vadeli Yükümlülükler"])
                    equity = self._find_value(bs, period, ["Özkaynaklar", "Ana Ortaklığa Ait"])
                    cash = self._find_value(bs, period, ["Nakit ve Nakit Benzerleri"])
                    inventories = self._find_value(bs, period, ["Stoklar"])
                    short_term_debt = self._find_value(bs, period, ["Finansal Borçlar"], section="Kısa Vadeli")
                    long_term_debt = self._find_value(bs, period, ["Finansal Borçlar"], section="Uzun Vadeli")
                    
                    total_debt = (short_term_debt or 0) + (long_term_debt or 0)
                    net_debt = total_debt - (cash or 0)

                    return {
                        "current_assets": current_assets,
                        "non_current_assets": non_current_assets,
                        "total_assets": total_assets,
                        "current_liabilities": current_liabilities,
                        "non_current_liabilities": non_current_liabilities,
                        "equity": equity,
                        "cash": cash,
                        "short_term_debt": short_term_debt,
                        "long_term_debt": long_term_debt,
                        "total_debt": total_debt,
                        "net_debt": net_debt,
                        "period": period
                    }
                
                # 1. Current Period Data
                metrics["balance"] = get_balance_data(latest_period)
                
                # 2. Previous Period Data (QoQ - Just take the next column)
                if len(bs.columns) > 1:
                    prev_period = bs.columns[1]
                    metrics["previous_balance"] = get_balance_data(prev_period)

                # Use Current Data for Ratios
                b_data = metrics["balance"] # Shortcut
                current_assets = b_data.get("current_assets")
                inventories = b_data.get("inventories")
                current_liabilities = b_data.get("current_liabilities")
                cash = b_data.get("cash")
                equity = b_data.get("equity")
                net_profit = metrics.get("income", {}).get("net_profit")
                total_assets = b_data.get("total_assets")
                total_debt = b_data.get("total_debt")

                # ========================================
                # FINANCIAL RATIOS
                # ========================================
                
                # Liquidity Ratios
                current_ratio = (current_assets / current_liabilities) if (current_assets and current_liabilities) else None
                quick_ratio = ((current_assets - (inventories or 0)) / current_liabilities) if (current_assets and current_liabilities) else None
                cash_ratio = (cash / current_liabilities) if (cash and current_liabilities) else None
                
                # Profitability Ratios
                roe = (net_profit / equity * 100) if (equity and net_profit) else None
                roa = (net_profit / total_assets * 100) if (total_assets and net_profit) else None
                
                # Leverage Ratios
                debt_to_equity = (total_debt / equity) if (equity and total_debt is not None) else None
                debt_to_assets = (total_debt / total_assets) if (total_assets and total_debt is not None) else None
                
                metrics["ratios"] = {
                    "current_ratio": round(current_ratio, 2) if current_ratio else None,
                    "quick_ratio": round(quick_ratio, 2) if quick_ratio else None,
                    "cash_ratio": round(cash_ratio, 2) if cash_ratio else None,
                    "roe": round(roe, 2) if roe else None,
                    "roa": round(roa, 2) if roa else None,
                    "debt_to_equity": round(debt_to_equity, 2) if debt_to_equity else None,
                    "debt_to_assets": round(debt_to_assets, 2) if debt_to_assets else None,
                }
            
            # ========================================
            # MARKET MULTIPLES (from borsapy info)
            # ========================================
            market_cap = info.get("marketCap") or info.get("market_cap")
            
            # P/E Ratio Logic
            pe_ratio = info.get("trailingPE") or info.get("pe_ratio")
            if pe_ratio is None:
                # Fallback: Price / EPS
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("last")
                eps = info.get("trailingEps") or info.get("epsForward")
                if price and eps and eps != 0:
                    pe_ratio = price / eps

            pb_ratio = info.get("priceToBook") or info.get("pb_ratio")
            ev_ebitda = info.get("enterpriseToEbitda")
            dividend_yield = _compute_safe_dividend_yield(
                raw_dividend_yield=info.get("dividendYield"),
                dividend_rate=info.get("dividendRate"),
                last_price=info.get("currentPrice") or info.get("regularMarketPrice") or info.get("last"),
                dividends=getattr(self._get_ticker(), "dividends", None),
            )
            
            # Free Float Logic
            shares_outstanding = info.get("sharesOutstanding")
            float_shares = info.get("floatShares")
            free_float_rate = None
            if shares_outstanding and float_shares:
                free_float_rate = (float_shares / shares_outstanding) * 100
            
            # Beta
            beta = info.get("beta") or info.get("beta3Year")

            metrics["multiples"] = {
                "market_cap": market_cap,
                "pe_ratio": round(pe_ratio, 2) if pe_ratio else None,
                "pb_ratio": round(pb_ratio, 2) if pb_ratio else None,
                "ev_ebitda": round(ev_ebitda, 2) if ev_ebitda else None,
                "dividend_yield": dividend_yield,
                "beta": round(beta, 2) if beta else None,
                "free_float_rate": round(free_float_rate, 2) if free_float_rate else None,
                "volume": info.get("regularMarketVolume") or info.get("volume")
            }
            
        except Exception as e:
            print(f"[CompanyFinancials] Metrics calculation error for {self.symbol}: {e}")
            metrics["error"] = str(e)

        self._key_metrics_cache = metrics
        return metrics
    
    def _find_value(self, df: pd.DataFrame, period: str, keywords: List[str], section: str = None) -> Optional[float]:
        """Find value in DataFrame by keywords (handles encoding issues)."""
        if df.empty or period not in df.columns:
            return None
        
        found_section = section is None
        
        # Normalize keywords to handle encoding
        def normalize(s):
            # Handle common encoding issues
            return s.lower().replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c')
        
        keywords_normalized = [normalize(kw) for kw in keywords]
        section_normalized = normalize(section) if section else None
        
        for idx in df.index:
            idx_clean = str(idx).strip()
            idx_normalized = normalize(idx_clean)
            
            # Track section
            if section_normalized and section_normalized in idx_normalized:
                found_section = True
            
            if found_section:
                for kw_norm in keywords_normalized:
                    if kw_norm in idx_normalized:
                        try:
                            val = df.loc[idx, period]
                            # Handle Series (duplicate indices)
                            if isinstance(val, pd.Series):
                                val = val.iloc[0]
                            if pd.notna(val) and val != 0:
                                return float(val)
                        except Exception:
                            continue
        
        return None
    
    def _find_value_by_index(self, df: pd.DataFrame, period: str, index_num: int) -> Optional[float]:
        """Find value in DataFrame by index number."""
        if df.empty or period not in df.columns:
            return None
        try:
            if index_num < len(df):
                val = df.iloc[index_num][period]
                if pd.notna(val):
                    return float(val)
        except:
            pass
        return None
    
    def get_quarterly_summary(self) -> Dict[str, Any]:
        """
        Get quarterly data for charts.
        Returns time series for revenue, EBITDA, net profit, etc.
        """
        if self._quarterly_summary_cache is not None:
            return self._quarterly_summary_cache

        summary = {
            "symbol": self.symbol,
            "periods": [],
            "revenue": [],
            "gross_profit": [],
            "operating_profit": [],
            "net_profit": [],
            "ebitda": [],
            "total_assets": [],
            "equity": [],
            "net_debt": [],
        }

        try:
            inc = self.get_income_statement(quarterly=True)
            bs = self.get_balance_sheet(quarterly=True)
            is_bank = self._is_bank_symbol()

            if inc.empty:
                return summary

            periods = inc.columns.tolist()
            summary["periods"] = periods

            for period in periods:
                if is_bank:
                    revenue = self._find_value(inc, period, ["faiz gelirleri", "i. faiz gelirleri"]) or 0
                    gross = self._find_value(inc, period, ["net faaliyet kari", "net faaliyet kari/zarari"]) or revenue
                    op = self._find_value(inc, period, ["net faaliyet kari", "net faaliyet kari/zarari"]) or 0
                    net = self._find_value(inc, period, ["net donem kari", "net donem kari/zarari"]) or 0
                    assets = self._find_value(bs, period, ["aktif toplami"]) or 0
                    equity = self._find_value(bs, period, ["ozkaynaklar", "xvi. ozkaynaklar"]) or 0
                    cash = self._find_value(bs, period, ["nakit degerler", "merkez bankasi"]) or 0
                    net_debt = 0 - cash
                else:
                    revenue = self._find_value(inc, period, ["Sat???? Gelirleri", "Has??lat"]) or 0
                    gross = self._find_value(inc, period, ["BR??T KAR", "Br??t Kar"]) or 0
                    op = self._find_value(inc, period, ["Faaliyet Kar??", "ESAS FAAL??YET"]) or 0
                    net = self._find_value(inc, period, ["Net D??nem Kar??", "D??nem Kar??"]) or 0
                    assets = self._find_value(bs, period, ["TOPLAM VARLIKLAR"]) or 0
                    equity = self._find_value(bs, period, ["??zkaynaklar", "Ana Ortakl????a Ait"]) or 0
                    st_debt = self._find_value(bs, period, ["Finansal Bor??lar"], section="K??sa") or 0
                    lt_debt = self._find_value(bs, period, ["Finansal Bor??lar"], section="Uzun") or 0
                    cash = self._find_value(bs, period, ["Nakit ve Nakit"]) or 0
                    net_debt = (st_debt + lt_debt) - cash

                summary["revenue"].append(revenue / 1e9)
                summary["gross_profit"].append(gross / 1e9)
                summary["operating_profit"].append(op / 1e9)
                summary["net_profit"].append(net / 1e9)
                summary["ebitda"].append(op / 1e9)
                summary["total_assets"].append(assets / 1e9)
                summary["equity"].append(equity / 1e9)
                summary["net_debt"].append(net_debt / 1e9)

        except Exception as e:
            print(f"[CompanyFinancials] Quarterly summary error: {e}")

        self._quarterly_summary_cache = summary
        return summary

    def get_score_card(self) -> Dict[str, Any]:
        """
        Calculate company score card (0-100).
        Based on profitability, leverage, and growth.
        """
        if self._score_card_cache is not None:
            return self._score_card_cache

        metrics = self.get_key_metrics()
        
        scores = {
            "profitability": 50,
            "leverage": 50,
            "liquidity": 50,
            "overall": 50,
            "grade": "C",
        }
        
        try:
            ratios = metrics.get("ratios", {})
            income = metrics.get("income", {})
            
            # Profitability Score (0-100)
            roe = ratios.get("roe") or 0
            net_margin = income.get("net_margin") or 0
            
            prof_score = min(100, max(0, 
                (roe / 20 * 40) +  # ROE scoring (20% = 40 points)
                (net_margin / 15 * 40) +  # Net margin scoring
                20  # Base score
            ))
            scores["profitability"] = round(prof_score)
            
            # Leverage Score (lower debt = higher score)
            d_to_e = ratios.get("debt_to_equity") or 1
            lev_score = min(100, max(0, 100 - (d_to_e * 30)))
            scores["leverage"] = round(lev_score)
            
            # Liquidity Score
            current = ratios.get("current_ratio") or 1
            liq_score = min(100, max(0, current * 40))
            scores["liquidity"] = round(liq_score)
            
            # Overall (weighted)
            overall = (
                scores["profitability"] * 0.4 +
                scores["leverage"] * 0.3 +
                scores["liquidity"] * 0.3
            )
            scores["overall"] = round(overall)
            
            # Grade
            if overall >= 80:
                scores["grade"] = "A"
            elif overall >= 65:
                scores["grade"] = "B"
            elif overall >= 50:
                scores["grade"] = "C"
            elif overall >= 35:
                scores["grade"] = "D"
            else:
                scores["grade"] = "F"
                
        except Exception as e:
            print(f"[CompanyFinancials] Score calculation error: {e}")

        self._score_card_cache = scores
        return scores
    
    def get_company_profile(self) -> Dict[str, Any]:
        """Get company profile and basic info."""
        info = self._get_info()
        reference = load_bist_reference_stock(self.symbol) or {}

        base_profile = {
            "symbol": self.symbol,
            "name": info.get("longName") or info.get("shortName") or self.symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": info.get("longBusinessSummary"),
            "website": info.get("website"),
            "employees": info.get("fullTimeEmployees"),
            "exchange": info.get("exchange", "BIST"),
            "currency": info.get("currency", "TRY"),
            "last_price": info.get("last") or info.get("currentPrice"),
            "change_percent": info.get("change_percent") or info.get("regularMarketChangePercent"),
            "market_cap": info.get("marketCap"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        }

        if reference:
            if not base_profile["name"] and reference.get("name"):
                base_profile["name"] = reference.get("name")
            if not base_profile["sector"] and reference.get("sector"):
                base_profile["sector"] = reference.get("sector")
            if not base_profile["industry"] and reference.get("industry"):
                base_profile["industry"] = reference.get("industry")
            if not base_profile["website"] and reference.get("website"):
                base_profile["website"] = reference.get("website")
            if not base_profile["last_price"] and reference.get("last") is not None:
                base_profile["last_price"] = reference.get("last")
            if not base_profile["change_percent"] and reference.get("change_percent") is not None:
                base_profile["change_percent"] = reference.get("change_percent")
            if not base_profile["market_cap"] and reference.get("market_cap") is not None:
                base_profile["market_cap"] = reference.get("market_cap")
            base_profile["data_source"] = reference.get("_reference_source")

        if not base_profile["sector"] and self._is_bank_symbol():
            base_profile["sector"] = "BANKA"

        db_profile = get_company_profile(self.symbol)
        if db_profile:
            if db_profile.get("description"):
                base_profile["description"] = db_profile.get("description")
            if db_profile.get("sector"):
                base_profile["sector"] = db_profile.get("sector")
            if db_profile.get("company_name"):
                base_profile["name"] = db_profile.get("company_name")

        return base_profile

    def get_shareholders(self) -> List[Dict[str, Any]]:
        """Get shareholder structure from DB."""
        return get_company_shareholders(self.symbol)
    
    def get_subsidiaries(self) -> List[Dict[str, Any]]:
        """Get subsidiaries from DB."""
        return get_company_subsidiaries(self.symbol)
    
    def _save_analysis_to_disk(self, analysis: Dict[str, Any]):
        """Save calculated analysis to disk for future retrieval."""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            storage_dir = os.path.join(base_dir, "storage", "analysis")
            os.makedirs(storage_dir, exist_ok=True)
            
            # Save as {SYMBOL}.json
            file_path = os.path.join(storage_dir, f"{self.symbol}.json")
            
            # Simple wrapper to handle non-serializable types if any remain
            def default(o):
                if isinstance(o, (datetime, pd.Timestamp)):
                    return o.isoformat()
                if isinstance(o, np.integer):
                    return int(o)
                if isinstance(o, np.floating):
                    return float(o)
                return str(o)

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(analysis, f, ensure_ascii=False, default=default, indent=2)
                
            print(f"[CompanyFinancials] Analysis saved for {self.symbol}")
        except Exception as e:
            print(f"[CompanyFinancials] Save error: {e}")

    def _load_analysis_from_disk(self) -> Optional[Dict[str, Any]]:
        """Load previously saved analysis from disk."""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            path = os.path.join(base_dir, "storage", "analysis", f"{self.symbol}.json")
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"[CompanyFinancials] Loaded cached analysis for {self.symbol}")
                    return data
        except Exception as e:
            print(f"[CompanyFinancials] Load error: {e}")
        return None

    def get_full_analysis(self) -> Dict[str, Any]:
        """Get complete financial analysis with offline fallback."""
        try:
            # 1. Try to fetch live data
            analysis = {
                "profile": self.get_company_profile(),
                "metrics": self.get_key_metrics(),
                "quarterly": self.get_quarterly_summary(),
                "score": self.get_score_card(),
                "shareholders": self.get_shareholders(),
                "subsidiaries": self.get_subsidiaries(),
                "updated_at": datetime.now().isoformat(),
                "source": "live"
            }
            
            # Validation: If critical data is missing, consider it a failure to trigger fallback
            # (e.g. if we have no price and no name, likely connection failed)
            prof = analysis.get("profile", {})
            if not prof.get("last_price") and not prof.get("market_cap") and not prof.get("name"):
                 # Check if we really failed or just have a weird stock.
                 # If we have a cache, let's prefer it over this empty shell.
                 if self._load_analysis_from_disk():
                     raise Exception("Live data appears empty, preferring cache")
            
            # If successful, save to disk
            self._save_analysis_to_disk(analysis)
            return analysis

        except Exception as e:
            print(f"[CompanyFinancials] Live fetch failed for {self.symbol}: {e}. Trying cache...")
            
            # 2. Fallback to cache
            cached = self._load_analysis_from_disk()
            if cached:
                cached["source"] = "cache"
                return cached
            
            # 3. If no cache, return best effort empty structure
            return {
                "profile": {"symbol": self.symbol, "error": "No data available"},
                "metrics": {},
                "quarterly": {},
                "score": {},
                "shareholders": [],
                "subsidiaries": [],
                "source": "empty"
            }


# Helper function for API
def get_company_financials(symbol: str) -> Dict[str, Any]:
    """Get full company financials for API response."""
    cf = CompanyFinancials(symbol)
    return cf.get_full_analysis()
