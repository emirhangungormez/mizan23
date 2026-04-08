/**
 * Market Service - FETCH ONLY
 *
 * This service ONLY calls the Python backend API.
 * NO mathematics, NO calculations, NO business logic allowed here.
 *
 * All data fetching and calculations happen in Python.
 */

import { clearEngineCache, fetchFromEngine } from "@/lib/api-client";

// ============================================
// Type Definitions (mirrors Python responses)
// ============================================

export interface MarketQuote {
    symbol: string;
    name?: string;
    last: number;
    currency?: "TRY" | "USD" | "NONE";
    change: number;
    change_percent: number;
    high?: number;
    low?: number;
    open?: number;
    volume?: number;
    update_time?: string;
}

export interface HistoricalDataPoint {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface HistoryResponse {
    symbol: string;
    period: string;
    interval: string;
    count: number;
    data: HistoricalDataPoint[];
}

export interface DashboardData {
    indices: MarketQuote[];
    us_markets: MarketQuote[];
    commodities: MarketQuote[];
    fx: MarketQuote[];
    crypto: MarketQuote[];
    stocks: MarketQuote[];
    funds?: MarketQuote[];
}

// Stock screener result type
export interface ScreenerResult {
    symbol: string;
    name?: string;
    last: number;
    change_percent: number;
    volume?: number;
    market_cap?: number;
    pe_ratio?: number;
    pb_ratio?: number;
    roe?: number;
    net_margin?: number;
    data_status?: string;
    data_status_label?: string;
    has_live_data?: boolean;
    has_snapshot_data?: boolean;
    search_match_source?: string;
    [key: string]: unknown;
}

export interface UpcomingDividendResult {
    symbol: string;
    name?: string;
    next_dividend_date?: string | null;
    last_dividend_date?: string | null;
    next_dividend_amount?: number | null;
    days_left?: number;
    dividend_yield?: number | null;
    dividend_event_count?: number;
    dividend_consistency_score?: number;
    dividend_status?: string;
    dividend_status_label?: string;
    data_status?: string;
    temettu_guven_skoru?: number;
    temettu_tuzagi_riski?: number;
    temettu_takvim_firsati?: number;
    last?: number;
    change_percent?: number;
}

export interface OppositeStockPairResult {
    left_symbol: string;
    left_name?: string;
    left_sector?: string;
    left_themes?: string[];
    left_return_2y_pct?: number;
    left_return_5y_pct?: number;
    right_symbol: string;
    right_name?: string;
    right_sector?: string;
    right_themes?: string[];
    right_return_2y_pct?: number;
    right_return_5y_pct?: number;
    correlation_2y?: number;
    correlation_5y?: number;
    window_correlation?: number;
    opposite_ratio_2y?: number;
    opposite_ratio_5y?: number;
    window_opposite_ratio?: number;
    inverse_score?: number;
    inverse_strength_label?: string;
    stability_score?: number;
    stability_label?: string;
    why_opposite?: string;
    observation_count_2y?: number;
    observation_count_5y?: number;
    thesis?: string;
}

export interface AnalysisAdviceResult {
    symbol: string;
    name: string;
    price?: number;
    day?: number;
    hakikiAlfa?: number;
    score: number;
    action: string;
    window: string;
    confidence?: number;
}

export interface AnalysisOverviewResponse {
    generated_at?: string;
    used_snapshot_fallback?: boolean;
    rows_total?: number;
    advice: {
        buy_now: AnalysisAdviceResult[];
        buy_week: AnalysisAdviceResult[];
        hold: AnalysisAdviceResult[];
        sell: AnalysisAdviceResult[];
    };
    period_lists?: Array<{
        key: string;
        label: string;
        horizon_days: number;
        rows: Array<AnalysisAdviceResult & {
            probability_positive?: number;
            probability_outperform?: number;
            expected_return_pct?: number;
            expected_excess_return_pct?: number;
            risk_forecast_pct?: number;
            signal_id?: string;
            signal_version?: string;
            calibration_version?: string;
            decision_band?: string;
            thesis?: string;
        }>;
    }>;
    portfolio_candidates: AnalysisAdviceResult[];
    upcoming_dividends: UpcomingDividendResult[];
    upcoming_dividends_meta?: {
        total?: number;
        scanned_symbols?: number;
        generated_at?: string;
        scan_in_progress?: boolean;
    };
    opposite_pairs: OppositeStockPairResult[];
    opposite_meta?: {
        scanMode?: string;
        scanInProgress?: boolean;
        generatedAt?: string | null;
        scannedSymbols?: number;
        windowLabel?: string;
        basis?: string;
        usingFallback?: boolean;
    };
}

export interface BistProprietarySnapshotStock {
    symbol: string;
    name?: string;
    last?: number;
    change_percent?: number;
    volume?: number;
    dividend_yield?: number;
    trend_score?: number;
    liquidity_score?: number;
    quality_score?: number;
    value_support_score?: number;
    firsat_skoru?: number;
    trade_skoru?: number;
    uzun_vade_skoru?: number;
    radar_skoru?: number;
    scan_priority_rank?: number;
    scan_priority_label?: string;
    scan_priority_bucket?: string;
    data_status?: string;
    data_status_label?: string;
    has_live_data?: boolean;
    has_snapshot_data?: boolean;
    is_registered_symbol?: boolean;
    hakiki_alfa?: Record<string, unknown>;
    hakiki_alfa_pct?: number;
    signals?: Record<string, unknown>;
    adil_deger?: Record<string, unknown>;
    adil_deger_skoru?: number;
    portfolio_action?: string;
    portfolio_action_reason?: string;
    temettu_guven_skoru?: number;
    temettu_tuzagi_riski?: number;
    temettu_takvim_firsati?: number;
    halka_aciklik_risk_skoru?: number;
    finansal_dayaniklilik_skoru?: number;
    sermaye_disiplini_skoru?: number;
    fair_value_data_band?: string;
    fair_value_confidence_band?: string;
    data_quality?: Record<string, unknown>;
    global_reference?: Record<string, unknown>;
    updated_at?: string;
    [key: string]: unknown;
}

export interface BistProprietarySnapshotResponse {
    schema_version: number;
    market: "bist";
    captured_at: string;
    snapshot_date: string;
    summary?: {
        stock_count?: number;
        [key: string]: unknown;
    };
    stocks: BistProprietarySnapshotStock[];
    [key: string]: unknown;
}

export interface BistHydrateResponse {
    results: Array<Record<string, unknown>>;
    total: number;
}

export interface TASignalResponse {
    [key: string]: unknown;
}

export interface ETFHoldersResponse {
    [key: string]: unknown;
}

export interface HeikinAshiResponse {
    [key: string]: unknown;
}

export interface TechnicalScanResponse {
    results?: ScreenerResult[];
    [key: string]: unknown;
}

// Stock filter type
export interface StockFilters {
    min_pe?: number;
    max_pe?: number;
    min_pb?: number;
    max_pb?: number;
    min_roe?: number;
    sector?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    [key: string]: string | number | undefined;
}

// ============================================
// Service Class - Pure Fetch Operations
// ============================================

export class MarketService {
    /**
     * Get current quote for a symbol
     */
    static async getQuote(symbol: string): Promise<MarketQuote | null> {
        try {
            const data = await fetchFromEngine<MarketQuote>(`/market/quote/${symbol}`, { cacheTime: 60000 });
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed to fetch quote for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get historical data for a symbol
     */
    static async getHistory(
        symbol: string,
        period: string = "1y",
        interval: string = "1d"
    ): Promise<HistoryResponse | null> {
        try {
            const data = await fetchFromEngine<HistoryResponse>(
                `/market/history/${symbol}?period=${period}&interval=${interval}`
            );
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed to fetch history for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get major indices data
     */
    static async getIndices(): Promise<{ indices: MarketQuote[] }> {
        try {
            const data = await fetchFromEngine<{ indices: MarketQuote[] }>("/market/indices");
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch indices:", error);
            return { indices: [] };
        }
    }

    /**
     * Get dashboard overview data
     */
    static async getDashboardData(bypassCache: boolean = false): Promise<DashboardData> {
        try {
            const data = await fetchFromEngine<DashboardData>("/market/dashboard", { cacheTime: 60000, bypassCache });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch dashboard data:", error);
            return {
                indices: [],
                us_markets: [],
                commodities: [],
                fx: [],
                crypto: [],
                stocks: [],
            };
        }
    }

    /**
     * Screen BIST stocks with filters (legacy endpoint)
     */
    static async screenStocks(filters: StockFilters = {}): Promise<{ results: ScreenerResult[] }> {
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, val]) => {
                if (val !== undefined && val !== null) params.append(key, String(val));
            });
            // Add timestamp to prevent caching
            params.append("_t", Date.now().toString());
            const data = await fetchFromEngine<{ results: ScreenerResult[] }>(`/market/screener/stocks?${params.toString()}`);
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to screen stocks:", error);
            return { results: [] };
        }
    }

    /**
     * Get BIST stocks with pagination - NEW FAST API
     * Uses yfinance for real-time price & change data
     */
    static async getBistStocksPaginated(options: {
        page?: number;
        limit?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
    } = {}): Promise<{
        results: ScreenerResult[];
        total: number;
        page: number;
        limit: number;
        pages: number;
        loaded_count?: number;
        universe_total?: number;
        search_applied?: boolean;
        refresh_in_progress?: boolean;
        elapsed_ms?: number;
        live_count?: number;
    }> {
        try {
            const params = new URLSearchParams();
            if (options.page) params.append('page', options.page.toString());
            if (options.limit) params.append('limit', options.limit.toString());
            if (options.sortBy) params.append('sort_by', options.sortBy);
            if (options.sortOrder) params.append('sort_order', options.sortOrder);
            if (options.search) params.append('search', options.search);
            params.append('_t', Date.now().toString());
            
            const data = await fetchFromEngine<{
                results: ScreenerResult[];
                total: number;
                page: number;
                limit: number;
                pages: number;
                loaded_count?: number;
                universe_total?: number;
                search_applied?: boolean;
                refresh_in_progress?: boolean;
                elapsed_ms?: number;
                live_count?: number;
            }>(`/market/bist/stocks?${params.toString()}`, { timeout: 180000 });
            
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch BIST stocks:", error);
            return { results: [], total: 0, page: 1, limit: 50, pages: 0 };
        }
    }

    /**
     * Get ALL BIST stocks at once (slower, use pagination for better UX)
     */
    static async getAllBistStocks(): Promise<{
        results: ScreenerResult[];
        total: number;
        live_count?: number;
        total_registered?: number;
        last_refresh?: string | null;
        used_snapshot_fallback?: boolean;
    }> {
        try {
            const data = await fetchFromEngine<{
                results: ScreenerResult[];
                total: number;
                live_count?: number;
                total_registered?: number;
                last_refresh?: string | null;
                used_snapshot_fallback?: boolean;
            }>(
                '/market/bist/all',
                {
                    timeout: 30000,
                    bypassCache: true,
                }
            );
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch all BIST stocks:", error);
            return { results: [], total: 0 };
        }
    }

    static async getLatestBistProprietarySnapshot(): Promise<BistProprietarySnapshotResponse | null> {
        try {
            return await fetchFromEngine<BistProprietarySnapshotResponse>(
                "/market/bist/proprietary-snapshots/latest",
                {
                    timeout: 60000,
                    bypassCache: true,
                }
            );
        } catch {
            return null;
        }
    }

    static async hydrateBistSymbols(symbols: string[]): Promise<BistHydrateResponse> {
        if (symbols.length === 0) {
            return { results: [], total: 0 };
        }
        try {
            return await fetchFromEngine<BistHydrateResponse>("/market/bist/hydrate", {
                method: "POST",
                body: JSON.stringify({ symbols }),
                timeout: 70000,
                bypassCache: true,
            });
        } catch {
            return { results: [], total: 0 };
        }
    }

    static async getUpcomingBistDividends(days: number = 60, force: boolean = false): Promise<{
        results: UpcomingDividendResult[];
        total: number;
        scanned_symbols?: number;
        window_days?: number;
        generated_at?: string;
    }> {
        try {
            clearEngineCache("/market/bist/dividends/upcoming");
            return await fetchFromEngine<{
                results: UpcomingDividendResult[];
                total: number;
                scanned_symbols?: number;
                window_days?: number;
                generated_at?: string;
                scan_in_progress?: boolean;
            }>(`/market/bist/dividends/upcoming?days=${days}&force=${force ? "true" : "false"}`, {
                timeout: 30000,
                bypassCache: true,
            });
        } catch (error) {
            console.error("[MarketService] Failed to fetch upcoming BIST dividends:", error);
            return { results: [], total: 0 };
        }
    }

    static async getOppositeBistStocks(options: {
        pairLimit?: number;
        candidateLimit?: number;
        force?: boolean;
        fullScan?: boolean;
        window?: "1m" | "1y" | "2y" | "5y";
    } = {}): Promise<{
        results: OppositeStockPairResult[];
        total: number;
        scanned_symbols?: number;
        candidate_limit?: number;
        generated_at?: string;
        window_label?: string;
        basis?: string;
        scan_mode?: string;
        scan_in_progress?: boolean;
    }> {
        const pairLimit = options.pairLimit ?? 12;
        const candidateLimit = options.candidateLimit ?? 90;
        const force = options.force ?? false;
        const fullScan = options.fullScan ?? false;
        const window = options.window ?? "2y";

        try {
            clearEngineCache("/market/bist/opposite-stocks");
            return await fetchFromEngine<{
                results: OppositeStockPairResult[];
                total: number;
                scanned_symbols?: number;
                candidate_limit?: number;
                generated_at?: string;
                window_label?: string;
                basis?: string;
                scan_mode?: string;
                scan_in_progress?: boolean;
            }>(
                `/market/bist/opposite-stocks?pair_limit=${pairLimit}&candidate_limit=${candidateLimit}&force=${force ? "true" : "false"}&full_scan=${fullScan ? "true" : "false"}&window=${window}`,
                {
                    timeout: force ? (fullScan ? 180000 : 90000) : (fullScan ? 90000 : 30000),
                    bypassCache: true,
                }
            );
        } catch (error) {
            console.error("[MarketService] Failed to fetch opposite BIST stocks:", error);
            return { results: [], total: 0 };
        }
    }

    static async getBistAnalysisOverview(window: "1m" | "1y" | "2y" | "5y" = "2y"): Promise<AnalysisOverviewResponse | null> {
        try {
            return await fetchFromEngine<AnalysisOverviewResponse>(
                `/market/bist/analysis-overview?window=${window}`,
                {
                    timeout: 90000,
                    cacheTime: 300000,
                }
            );
        } catch (error) {
            console.error("[MarketService] Failed to fetch BIST analysis overview:", error);
            return null;
        }
    }

    static async getBistRefreshStatus(): Promise<{
        last_refresh: string | null;
        refresh_in_progress: boolean;
        stocks_cached: number;
        total_symbols: number;
        universe_label?: string;
    }> {
        try {
            return await fetchFromEngine<{
                last_refresh: string | null;
                refresh_in_progress: boolean;
                stocks_cached: number;
                total_symbols: number;
                universe_label?: string;
            }>('/market/bist/refresh/status', {
                timeout: 8000,
                bypassCache: true,
            });
        } catch {
            return {
                last_refresh: null,
                refresh_in_progress: false,
                stocks_cached: 0,
                total_symbols: 0,
            };
        }
    }

    /**
     * Get top movers (gainers/losers) quickly
     */
    static async getBistTopMovers(limit: number = 20): Promise<{
        gainers: ScreenerResult[];
        losers: ScreenerResult[];
    }> {
        try {
            const data = await fetchFromEngine<{
                gainers: ScreenerResult[];
                losers: ScreenerResult[];
            }>(`/market/bist/top-movers?limit=${limit}`, { timeout: 30000 });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch top movers:", error);
            return { gainers: [], losers: [] };
        }
    }

    /**
     * Get all BIST stocks for market page
     */
    static async getBistMarkets(): Promise<{ all: MarketQuote[] }> {
        try {
            const data = await fetchFromEngine<{ all: MarketQuote[] }>("/market/analysis/bist-stocks", { timeout: 60000 });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch BIST markets:", error);
            return { all: [] };
        }
    }

    /**
     * Get US markets analysis/screening
     */
    static async getUSMarkets(): Promise<{ all: MarketQuote[] }> {
        try {
            // Longer timeout for US stocks (550+ stocks batch download)
            const data = await fetchFromEngine<{ all: MarketQuote[] }>("/market/analysis/us-stocks", {
                timeout: 120000,
                cacheTime: 180000,
            });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch US markets:", error);
            return { all: [] };
        }
    }

    /**
     * Get Crypto market analysis/screening
     */
    static async getCryptoMarket(): Promise<{ all: MarketQuote[] }> {
        try {
            const data = await fetchFromEngine<{ all: MarketQuote[] }>("/market/analysis/crypto", {
                timeout: 60000,
                cacheTime: 120000,
            });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch crypto markets:", error);
            return { all: [] };
        }
    }

    /**
     * Get Commodities market analysis/screening
     */
    static async getCommoditiesMarket(): Promise<{ all: MarketQuote[] }> {
        try {
            const data = await fetchFromEngine<{ all: MarketQuote[] }>("/market/analysis/commodities", {
                timeout: 60000,
                cacheTime: 180000,
            });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch commodities:", error);
            return { all: [] };
        }
    }

    /**
     * Get Funds market analysis/screening
     */
    static async getFundsMarket(): Promise<{ all: MarketQuote[] }> {
        try {
            const data = await fetchFromEngine<{ all: MarketQuote[] }>("/market/analysis/funds", {
                timeout: 45000,
                cacheTime: 180000,
            });
            return data;
        } catch (error) {
            console.error("[MarketService] Failed to fetch funds:", error);
            return { all: [] };
        }
    }

    /**
     * Get TradingView TA Signals for a symbol
     */
    static async getTASignals(symbol: string): Promise<TASignalResponse | null> {
        try {
            const data = await fetchFromEngine<TASignalResponse>(`/market/ta-signals/${symbol}`, { cacheTime: 60000 });
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed to fetch TA signals for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get foreign ETF holders for a BIST stock
     */
    static async getETFHolders(symbol: string): Promise<ETFHoldersResponse | null> {
        try {
            const data = await fetchFromEngine<ETFHoldersResponse>(`/market/etf-holders/${symbol}`);
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed to fetch ETF holders for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Search for symbols
     */
    static async searchSymbols(query: string): Promise<string[]> {
        try {
            const data = await fetchFromEngine<{ results: string[] }>(`/market/search-symbols?query=${query}`);
            return data.results || [];
        } catch (error) {
            console.error(`[MarketService] Failed to search symbols for ${query}:`, error);
            return [];
        }
    }

    /**
     * Get Heikin Ashi data
     */
    static async getHeikinAshi(symbol: string, period: string = "1mo", interval: string = "1d"): Promise<HeikinAshiResponse | null> {
        try {
            const data = await fetchFromEngine<HeikinAshiResponse>(`/market/heikin-ashi/${symbol}?period=${period}&interval=${interval}`);
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed to fetch Heikin Ashi for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Perform technical scan
     */
    static async technicalScan(condition: string, index: string = "BIST 100"): Promise<TechnicalScanResponse> {
        try {
            const data = await fetchFromEngine<TechnicalScanResponse>(`/market/screener/technical?condition=${encodeURIComponent(condition)}&index=${encodeURIComponent(index)}`);
            return data;
        } catch (error) {
            console.error(`[MarketService] Failed technical scan:`, error);
            return { results: [] };
        }
    }
}

// Common BIST symbols for UI autocomplete/suggestions
// This is static data, not calculation
export const COMMON_BIST_SYMBOLS = [
    "THYAO",
    "EREGL",
    "KCHOL",
    "SISE",
    "AKBNK",
    "GARAN",
    "ISCTR",
    "YKBNK",
    "SAHOL",
    "ASELS",
    "BIMAS",
    "TUPRS",
    "PETKM",
    "EKGYO",
    "KOZAL",
    "ARCLK",
    "PGSUS",
    "SASA",
    "HEKTS",
    "KARDM",
    "MGROS",
    "TOASO",
    "FROTO",
    "TTKOM",
];
