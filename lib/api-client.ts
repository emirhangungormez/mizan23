/**
 * API Client for Python Engine Communication
 *
 * This is the ONLY module that should make HTTP calls to the Python backend.
 * All services should use fetchFromEngine for communication.
 */

const PYTHON_ENGINE_URL = "/api/python";

interface FetchOptions extends RequestInit {
    timeout?: number;
    cacheTime?: number;
    bypassCache?: boolean;
}

type EngineCacheEntry = {
    schemaVersion: number;
    timestamp: number;
    data: unknown;
};

const ENGINE_CACHE_SCHEMA_VERSION = 3;
const engineResponseCache = new Map<string, EngineCacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
const ENGINE_CACHE_PREFIX = "engine-cache:";

function buildCacheKey(url: string): string {
    return `${ENGINE_CACHE_PREFIX}${url}`;
}

function readCachedEntry<T>(url: string, cacheTime?: number): T | null {
    if (!cacheTime || cacheTime <= 0) return null;

    const memoryEntry = engineResponseCache.get(url);
    if (memoryEntry) {
        if (Date.now() - memoryEntry.timestamp <= cacheTime) {
            return memoryEntry.data as T;
        }
        engineResponseCache.delete(url);
        return null;
    }

    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(buildCacheKey(url));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as EngineCacheEntry;
        if (!parsed || typeof parsed.timestamp !== "number") return null;
        if ((parsed.schemaVersion || 0) !== ENGINE_CACHE_SCHEMA_VERSION) {
            window.sessionStorage.removeItem(buildCacheKey(url));
            return null;
        }
        if (Date.now() - parsed.timestamp > cacheTime) {
            window.sessionStorage.removeItem(buildCacheKey(url));
            return null;
        }
        engineResponseCache.set(url, parsed);
        return parsed.data as T;
    } catch {
        return null;
    }
}

function readStaleCachedEntry<T>(url: string): T | null {
    const memoryEntry = engineResponseCache.get(url);
    if (memoryEntry) {
        return memoryEntry.data as T;
    }

    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(buildCacheKey(url));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as EngineCacheEntry;
        if (!parsed) return null;
        if ((parsed.schemaVersion || 0) !== ENGINE_CACHE_SCHEMA_VERSION) {
            window.sessionStorage.removeItem(buildCacheKey(url));
            return null;
        }
        engineResponseCache.set(url, parsed);
        return parsed.data as T;
    } catch {
        return null;
    }
}

function writeCachedEntry(url: string, data: unknown): void {
    const entry: EngineCacheEntry = {
        schemaVersion: ENGINE_CACHE_SCHEMA_VERSION,
        timestamp: Date.now(),
        data,
    };
    engineResponseCache.set(url, entry);

    if (typeof window === "undefined") return;

    try {
        window.sessionStorage.setItem(buildCacheKey(url), JSON.stringify(entry));
    } catch {
        // Ignore session storage quota / serialization errors.
    }
}

export function peekEngineCache<T = unknown>(endpoint: string): T | null {
    const url = `${PYTHON_ENGINE_URL}${endpoint}`;
    const memoryEntry = engineResponseCache.get(url);
    if (memoryEntry) {
        return memoryEntry.data as T;
    }

    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(buildCacheKey(url));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as EngineCacheEntry;
        if (!parsed) return null;
        if ((parsed.schemaVersion || 0) !== ENGINE_CACHE_SCHEMA_VERSION) {
            window.sessionStorage.removeItem(buildCacheKey(url));
            return null;
        }
        engineResponseCache.set(url, parsed);
        return parsed.data as T;
    } catch {
        return null;
    }
}

export function clearEngineCache(match?: string): void {
    const normalizedMatch = match ? `${PYTHON_ENGINE_URL}${match}` : null;

    for (const key of Array.from(engineResponseCache.keys())) {
        if (!normalizedMatch || key.includes(normalizedMatch)) {
            engineResponseCache.delete(key);
        }
    }

    inflightRequests.clear();

    if (typeof window === "undefined") return;

    try {
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.sessionStorage.length; index += 1) {
            const key = window.sessionStorage.key(index);
            if (!key || !key.startsWith(ENGINE_CACHE_PREFIX)) continue;
            if (!normalizedMatch || key.includes(normalizedMatch)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
        // Ignore storage access errors.
    }
}

/**
 * Fetch data from the Python engine API
 *
 * @param endpoint - API endpoint (e.g., "/market/quote/THYAO")
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns Parsed JSON response
 * @throws Error if request fails
 */
export async function fetchFromEngine<T = unknown>(
    endpoint: string,
    options?: FetchOptions
): Promise<T> {
    const url = `${PYTHON_ENGINE_URL}${endpoint}`;
    const {
        timeout = 30000,
        cacheTime,
        bypassCache = false,
        ...fetchOptions
    } = options ?? {};

    if (!bypassCache) {
        const cached = readCachedEntry<T>(url, cacheTime);
        if (cached !== null) {
            return cached;
        }
    }

    const inflightKey = `${options?.method || "GET"}:${url}`;
    if (!bypassCache && inflightRequests.has(inflightKey)) {
        return inflightRequests.get(inflightKey) as Promise<T>;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestPromise = (async () => {
        try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...fetchOptions.headers,
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorBody = await response.text().catch(() => "Unknown error");
            throw new Error(`Engine API error (${response.status}): ${errorBody}`);
        }

            const data = await response.json();
            if (!bypassCache && cacheTime && cacheTime > 0) {
                writeCachedEntry(url, data);
            }
            return data as T;
        } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
            if (!bypassCache) {
                const staleCached = readStaleCachedEntry<T>(url);
                if (staleCached !== null) {
                    return staleCached;
                }
            }
            throw new Error(`Engine API timeout after ${timeout}ms: ${endpoint}`);
        }

        if (error instanceof TypeError && error.message.includes("fetch")) {
            if (!bypassCache) {
                const staleCached = readStaleCachedEntry<T>(url);
                if (staleCached !== null) {
                    return staleCached;
                }
            }
            throw new Error(
                "Cannot connect to the Python engine. Ensure the local engine is running and reachable."
            );
        }

        throw error;
        } finally {
            inflightRequests.delete(inflightKey);
        }
    })();

    inflightRequests.set(inflightKey, requestPromise as Promise<unknown>);
    return requestPromise;
}

/**
 * Check if the Python engine is healthy
 */
export async function checkEngineHealth(): Promise<{
    healthy: boolean;
    message: string;
}> {
    try {
        const response = await fetchFromEngine<{ status: string }>("/health");
        return {
            healthy: response.status === "healthy",
            message: "Engine is operational",
        };
    } catch (error) {
        return {
            healthy: false,
            message: error instanceof Error ? error.message : "Engine unreachable",
        };
    }
}

/**
 * Get detailed asset information
 */
export interface AssetDetails {
    symbol: string;
    name?: string;
    last?: number;
    change_percent?: number;
    historical?: Array<{ date: string; close: number; volume?: number }>;
    [key: string]: unknown;
}

export async function fetchAssetDetails(symbol: string, period: string = "3mo"): Promise<AssetDetails> {
    return fetchFromEngine<AssetDetails>(`/market/asset/${symbol}?period=${period}`, {
        timeout: 60000,
        cacheTime: 60000,
    });
}

export interface BistProprietarySnapshot {
    symbol: string;
    trend_score?: number;
    liquidity_score?: number;
    quality_score?: number;
    value_support_score?: number;
    firsat_skoru?: number;
    trade_skoru?: number;
    uzun_vade_skoru?: number;
    radar_skoru?: number;
    hakiki_alfa?: {
        daily_return_pct?: number;
        global_reference_return_pct?: number;
        hakiki_alfa_pct?: number;
        hakiki_alfa_score?: number;
        status?: string;
    };
    signals?: Record<string, {
        score?: number;
        action?: string;
        horizon?: string;
        thesis?: string;
        risk?: string;
        emphasis?: number;
        emphasis_label?: string;
        entry_quality_score?: number | null;
        entry_quality_label?: string | null;
        entry_note?: string | null;
    }>;
    global_reference?: {
        as_of?: string;
        daily_return_pct?: number;
        core_daily_return_pct?: number;
        total_trillion_usd?: number;
        confidence_score?: number;
        confidence_label?: string;
        macro_regime_label?: string;
        macro_sidecar_items?: GlobalAlphaItem[];
    };
    data_quality?: {
        score_confidence?: number;
        score_confidence_label?: string;
        trend_input_quality?: number;
        liquidity_input_quality?: number;
        quality_input_quality?: number;
        value_input_quality?: number;
        global_reference_confidence?: number;
    };
    temettu_guven_skoru?: number;
    temettu_tuzagi_riski?: number;
    temettu_takvim_firsati?: number;
    kap_etki_skoru?: number;
    catalyst_score?: number;
    sahiplik_kalitesi_skoru?: number;
    ownership_score?: number;
    sector_context_score?: number;
    sector_momentum_label?: string;
    public_float_pct?: number;
    adil_deger_skoru?: number;
    adil_deger?: {
        fair_value_price?: number | null;
        fair_value_market_cap?: number | null;
        premium_discount_pct?: number | null;
        fair_value_score?: number;
        fair_value_label?: string;
        confidence?: number;
        fair_value_confidence_band?: string;
        fair_value_data_band?: string;
        sector_family?: string;
        growth_score?: number;
        components?: Array<{
            method: string;
            weight: number;
            target_market_cap: number;
            multiple: number;
        }>;
    };
    fair_value_confidence_band?: string;
    fair_value_data_band?: string;
    data_status?: string;
    data_status_label?: string;
    has_live_data?: boolean;
    has_snapshot_data?: boolean;
    search_match_source?: string;
    portfolio_fit_score?: number;
    portfolio_action?: string;
    portfolio_action_reason?: string;
    prediction_memory?: {
        prediction_count?: number;
        correct_count?: number;
        wrong_count?: number;
        hit_rate?: number;
        overall_score_effect?: number;
        overall_alignment_label?: string;
        overall_note?: string;
        short_term_effect?: number;
        short_term_label?: string;
        medium_term_effect?: number;
        medium_term_label?: string;
        long_term_effect?: number;
        long_term_label?: string;
    };
    regime_label?: string;
    sektor_liderlik_skoru?: number;
    sektor_ayrisma_skoru?: number;
    sektor_ivmelenme_skoru?: number;
    [key: string]: unknown;
}

export async function fetchBistStockSnapshot(symbol: string): Promise<BistProprietarySnapshot | null> {
    try {
        return await fetchFromEngine<BistProprietarySnapshot>(`/market/bist/stock/${symbol}`);
    } catch (error) {
        console.error(`[BIST Snapshot] Failed to fetch ${symbol}:`, error);
        return null;
    }
}

export interface ProprietaryOutcomeSegment {
    direction?: "bullish" | "bearish";
    segment_label?: string;
    sample_size: number;
    avg_return_pct: number;
    median_return_pct: number;
    avg_prediction_edge_pct?: number;
    median_prediction_edge_pct?: number;
    hit_rate: number;
    correct_count?: number;
    wrong_count?: number;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    examples: Array<{
        symbol: string;
        name?: string;
        segment?: string;
        segment_label?: string;
        family?: string;
        direction?: "bullish" | "bearish";
        future_return_pct: number;
        prediction_edge_pct?: number;
        correct?: boolean;
        score_value?: number;
        from_date: string;
        to_date: string;
        holding_days: number;
    }>;
    wrong_examples?: Array<{
        symbol: string;
        name?: string;
        segment?: string;
        segment_label?: string;
        family?: string;
        direction?: "bullish" | "bearish";
        future_return_pct: number;
        prediction_edge_pct?: number;
        correct?: boolean;
        score_value?: number;
        from_date: string;
        to_date: string;
        holding_days: number;
    }>;
}

export interface ProprietaryOutcomePrediction {
    symbol: string;
    name?: string;
    segment?: string;
    segment_label?: string;
    family?: string;
    direction?: "bullish" | "bearish";
    future_return_pct: number;
    benchmark_return_pct?: number;
    excess_return_pct?: number;
    direction_correct?: boolean;
    alpha_correct?: boolean;
    prediction_edge_pct?: number;
    correct?: boolean;
    score_value?: number;
    probability_positive?: number;
    probability_outperform?: number;
    expected_return_pct?: number;
    expected_excess_return_pct?: number;
    from_date: string;
    to_date: string;
    holding_days: number;
}

export interface ProprietaryOutcomeSymbolAlignment {
    symbol: string;
    name?: string;
    sample_size: number;
    correct_count: number;
    wrong_count: number;
    hit_rate: number;
    avg_prediction_edge_pct: number;
    bullish_predictions: number;
    bearish_predictions: number;
    score_effect: number;
    alignment_label: string;
    alignment_note?: string;
    strongest_family?: string | null;
}

export interface ProprietaryOutcomeLatestCandidate {
    symbol: string;
    name?: string;
    last: number;
    change_percent: number;
    score_value: number;
    score_label?: string;
    snapshot_date?: string | null;
    probability_positive?: number;
    probability_outperform?: number;
    expected_return_pct?: number;
    expected_excess_return_pct?: number;
    market_signal?: {
        score?: number;
        action?: string;
        horizon?: string;
        probability_positive?: number;
        probability_outperform?: number;
        expected_return_pct?: number;
        expected_excess_return_pct?: number;
        [key: string]: unknown;
    };
    adil_deger?: { premium_discount_pct?: number; [key: string]: unknown };
    hakiki_alfa_pct?: number;
    fund_type?: string;
    currency?: string;
}

export interface ProprietaryOutcomeWindowSummary {
    selection_type: "rising" | "falling";
    sample_size: number;
    avg_return_pct: number;
    median_return_pct: number;
    avg_benchmark_return_pct: number;
    avg_excess_return_pct: number;
    median_excess_return_pct: number;
    direction_hit_rate: number;
    alpha_hit_rate: number;
    correct_count: number;
    wrong_count: number;
    hit_rate_confidence_interval?: { lower: number; upper: number };
}

export interface ProprietaryOutcomeReport {
    status: string;
    market?: string;
    horizon_days?: number;
    top_n?: number;
    snapshot_count?: number;
    comparison_count?: number;
    observation_days?: number;
    latest_snapshot_date?: string | null;
    message?: string;
    segments?: Record<string, ProprietaryOutcomeSegment>;
    window_summary?: {
        rising?: ProprietaryOutcomeWindowSummary;
        falling?: ProprietaryOutcomeWindowSummary;
        long_short_spread_pct?: number;
        calibration_bucket_summary?: Array<{
            bucket: string;
            avg_probability_outperform: number;
            realized_outperform_rate: number;
            count: number;
        }>;
        probability_brier_score?: number;
    };
    correct_predictions?: ProprietaryOutcomePrediction[];
    wrong_predictions?: ProprietaryOutcomePrediction[];
    symbol_alignment?: ProprietaryOutcomeSymbolAlignment[];
    score_aligned_symbols?: ProprietaryOutcomeSymbolAlignment[];
    score_misaligned_symbols?: ProprietaryOutcomeSymbolAlignment[];
    latest_candidates?: {
        snapshot_date?: string | null;
        score_label?: string;
        rising?: ProprietaryOutcomeLatestCandidate[];
        falling?: ProprietaryOutcomeLatestCandidate[];
    };
}

export async function fetchBistOutcomeReport(
    horizonDays: number = 1,
    topN: number = 20,
): Promise<ProprietaryOutcomeReport> {
    return fetchFromEngine<ProprietaryOutcomeReport>(
        `/market/bist/proprietary-outcomes/report?horizon_days=${horizonDays}&top_n=${topN}`,
    );
}

export async function fetchMarketOutcomeReport(
    market: "bist" | "us" | "crypto" | "commodities" | "funds",
    horizonDays: number = 1,
    topN: number = 20,
): Promise<ProprietaryOutcomeReport> {
    return fetchFromEngine<ProprietaryOutcomeReport>(
        `/market/outcomes/${market}?horizon_days=${horizonDays}&top_n=${topN}`,
    );
}

/**
 * Get index constituents (BIST100, BIST50, BIST30 etc.)
 */
export interface IndexConstituent {
    symbol: string;
    name: string;
    price: number;
    change: number;
    volume: number;
    weight: number;
    impact: number;
}

export async function fetchIndexConstituents(indexSymbol: string): Promise<{
    symbol: string;
    count: number;
    constituents: IndexConstituent[];
}> {
    return fetchFromEngine(`/market/index/${indexSymbol}/constituents`);
}

/**
 * Get deep analysis for an asset
 */
export interface AssetAnalysisResponse {
    symbol: string;
    score?: number;
    entropy?: number;
    hurst?: number;
    volatility?: number;
    regime?: string;
    probability_up?: number;
    probability_down?: number;
    probability_sideways?: number;
    [key: string]: unknown;
}

export async function fetchAssetAnalysis(symbol: string): Promise<AssetAnalysisResponse> {
    return fetchFromEngine<AssetAnalysisResponse>(`/analysis/${symbol}`);
}

/**
 * Get company financial analysis (profile, ratios, quarterly, score)
 */
export interface CompanyFinancials {
    profile: {
        symbol: string;
        name: string;
        sector?: string;
        industry?: string;
        description?: string;
        website?: string;
        last_price?: number;
        change_percent?: number;
        market_cap?: number;
        fifty_two_week_high?: number;
        fifty_two_week_low?: number;
    };
    metrics: {
        income?: {
            revenue?: number;
            gross_profit?: number;
            operating_profit?: number;
            net_profit?: number;
            gross_margin?: number;
            operating_margin?: number;
            net_margin?: number;
            period?: string;
        };
        previous_income?: {
            revenue?: number;
            gross_profit?: number;
            operating_profit?: number;
            net_profit?: number;
            gross_margin?: number;
            operating_margin?: number;
            net_margin?: number;
            period?: string;
        };
        balance?: {
            current_assets?: number;
            non_current_assets?: number;
            total_assets?: number;
            equity?: number;
            net_debt?: number;
            current_liabilities?: number;
            non_current_liabilities?: number;
            period?: string;
        };
        previous_balance?: {
            current_assets?: number;
            non_current_assets?: number;
            total_assets?: number;
            equity?: number;
            net_debt?: number;
            current_liabilities?: number;
            non_current_liabilities?: number;
            period?: string;
        };
        ratios?: {
            current_ratio?: number;
            quick_ratio?: number;
            roe?: number;
            roa?: number;
            debt_to_equity?: number;
        };
        multiples?: {
            pe_ratio?: number;
            pb_ratio?: number;
            ev_ebitda?: number;
            dividend_yield?: number;
            market_cap?: number;
            beta?: number;
            free_float_rate?: number;
            volume?: number;
        };
    };
    quarterly: {
        periods: string[];
        revenue: number[];
        gross_profit: number[];
        operating_profit: number[];
        net_profit: number[];
        ebitda: number[];
    };
    score: {
        profitability: number;
        leverage: number;
        liquidity: number;
        overall: number;
        grade: string;
    };
    shareholders?: Array<{ name: string; share: number;[key: string]: unknown }>;
    subsidiaries?: Array<{ name: string; share: number;[key: string]: unknown }>;
}

export async function fetchCompanyFinancials(symbol: string): Promise<CompanyFinancials> {
    return fetchFromEngine<CompanyFinancials>(`/market/company/${symbol}/financials`, {
        timeout: 60000,
        cacheTime: 300000,
    });
}

export interface ShareholderInfo {
    name: string;
    share: number;
    [key: string]: unknown;
}

export async function fetchCompanyShareholders(symbol: string): Promise<{ shareholders: ShareholderInfo[] }> {
    return fetchFromEngine(`/market/company/${symbol}/shareholders`);
}

export interface SubsidiaryInfo {
    name: string;
    share: number;
    [key: string]: unknown;
}

export async function fetchCompanySubsidiaries(symbol: string): Promise<{ subsidiaries: SubsidiaryInfo[] }> {
    return fetchFromEngine(`/market/company/${symbol}/subsidiaries`);
}

/**
 * Trigger company data refresh (ETL)
 */
export async function refreshCompanyData(symbol: string): Promise<{ status: string; message: string }> {
    return fetchFromEngine(`/market/company/${symbol}/refresh`, {
        method: "POST",
    });
}

// ==========================================
// MARKET ANALYSIS ENDPOINTS
// ==========================================

export interface MarketAnalysisData {
    gainers: Array<{
        symbol: string;
        name: string;
        last: number;
        change_percent: number;
        volume?: number;
        market_cap?: number;
        market_signal?: {
            score?: number;
            action?: string;
            horizon?: string;
            reason?: string;
            regime?: string;
            confidence?: number;
            probability_positive?: number;
            probability_outperform?: number;
            expected_return_pct?: number;
            expected_excess_return_pct?: number;
            risk_forecast_pct?: number;
            calibration_confidence?: number;
            signal_version?: string;
            calibration_version?: string;
            decision_band?: string;
            [key: string]: unknown;
        };
        adil_deger?: { premium_discount_pct?: number; [key: string]: unknown };
        hakiki_alfa_pct?: number;
        fund_type?: string;
        currency?: string;
    }>;
    losers: Array<{
        symbol: string;
        name: string;
        last: number;
        change_percent: number;
        volume?: number;
        market_cap?: number;
        market_signal?: {
            score?: number;
            action?: string;
            horizon?: string;
            reason?: string;
            regime?: string;
            confidence?: number;
            probability_positive?: number;
            probability_outperform?: number;
            expected_return_pct?: number;
            expected_excess_return_pct?: number;
            risk_forecast_pct?: number;
            calibration_confidence?: number;
            signal_version?: string;
            calibration_version?: string;
            decision_band?: string;
            [key: string]: unknown;
        };
        adil_deger?: { premium_discount_pct?: number; [key: string]: unknown };
        hakiki_alfa_pct?: number;
        fund_type?: string;
        currency?: string;
    }>;
    all: Array<{
        symbol: string;
        name: string;
        last: number;
        change_percent: number;
        volume?: number;
        market_cap?: number;
        market_signal?: {
            score?: number;
            action?: string;
            horizon?: string;
            reason?: string;
            regime?: string;
            confidence?: number;
            probability_positive?: number;
            probability_outperform?: number;
            expected_return_pct?: number;
            expected_excess_return_pct?: number;
            risk_forecast_pct?: number;
            calibration_confidence?: number;
            signal_version?: string;
            calibration_version?: string;
            decision_band?: string;
            [key: string]: unknown;
        };
        adil_deger?: { premium_discount_pct?: number; [key: string]: unknown };
        hakiki_alfa_pct?: number;
        fund_type?: string;
        currency?: string;
    }>;
    count: number;
    market?: string;
    generated_at?: string;
    captured_at?: string;
    snapshot_date?: string;
    benchmark_daily_return_pct?: number;
}

/**
 * Get comprehensive BIST stocks analysis
 */
export async function fetchBistStocksAnalysis(): Promise<MarketAnalysisData> {
    return fetchFromEngine<MarketAnalysisData>("/market/analysis/bist-stocks");
}

/**
 * Get US stocks analysis
 */
export async function fetchUsStocksAnalysis(): Promise<MarketAnalysisData> {
    return fetchFromEngine<MarketAnalysisData>("/market/analysis/us-stocks");
}

/**
 * Get commodities analysis
 */
export async function fetchCommoditiesAnalysis(): Promise<MarketAnalysisData> {
    return fetchFromEngine<MarketAnalysisData>("/market/analysis/commodities");
}

/**
 * Get crypto analysis
 */
export async function fetchCryptoAnalysis(): Promise<MarketAnalysisData> {
    return fetchFromEngine<MarketAnalysisData>("/market/analysis/crypto");
}

/**
 * Get Turkish funds analysis
 */
export async function fetchFundsAnalysis(): Promise<MarketAnalysisData> {
    return fetchFromEngine<MarketAnalysisData>("/market/analysis/funds");
}

/**
 * Get funds summary for dashboard
 */
export async function fetchFundsSummary(): Promise<{
    funds: Array<{
        symbol: string;
        name: string;
        last: number;
        change_percent: number;
        return_ytd?: number;
    }>;
}> {
    return fetchFromEngine("/market/funds/summary", { cacheTime: 60000 });
}

// ==========================================
// ECONOMIC DATA ENDPOINTS
// ==========================================

export interface EconomicEvent {
    date: string;
    time: string;
    country: string;
    importance: string;
    event: string;
    actual: string | null;
    forecast: string | null;
    previous: string | null;
    period: string;
}

export interface InflationData {
    date: string;
    year_month: string;
    yearly: number;
    monthly: number;
}

/**
 * Get economic calendar events
 */
export async function fetchEconomicCalendar(
    period: "today" | "week" | "month" = "today",
    importance: "all" | "high" = "all"
): Promise<{ events: EconomicEvent[]; count: number }> {
    return fetchFromEngine(`/market/economic-calendar?period=${period}&importance=${importance}`);
}

/**
 * Get Turkish and Global inflation data
 */
export async function fetchInflation(
    months: number = 6
): Promise<{
    tufe: {
        latest: { date: string; yearly: number; monthly: number };
        history: InflationData[];
    };
    ufe: {
        latest: { date: string; yearly: number; monthly: number };
        history: InflationData[];
    };
    us_cpi: {
        yearly: number;
        monthly: number;
        date: string;
        next_update: string;
    };
    error?: string;
}> {
    return fetchFromEngine(`/market/inflation?months=${months}`);
}

/**
 * Get comprehensive macro indicators
 */
export async function fetchMacroIndicators(): Promise<{
    tr: {
        inflation: { yearly: number; monthly: number; date: string };
        policy_rate: { value: number; date: string; trend: string };
        unemployment: { value: number; date: string; trend: string };
    };
    us: {
        inflation: { yearly: number; monthly: number; date: string };
        fed_rate: { value: number; date: string; trend: string };
        unemployment: { value: number; date: string; trend: string };
    };
    error?: string;
}> {
    return fetchFromEngine("/market/macro-indicators");
}

/**
 * Get benchmark comparison data for portfolio performance tracking
 * @param period - 'daily' | 'weekly' | 'monthly' | 'all'
 * @param startDate - Optional ISO date string for custom 'all' period calculation
 */
export interface BenchmarkData {
    period: string;
    inflation: number;
    gold: number;
    bist100: number;
    interest_rate: number;
    usd: number;
    eur: number;
    data_source: string;
    last_updated: string;
    from_cache?: boolean;
}

export async function fetchBenchmarks(period: string = 'all', startDate?: string): Promise<BenchmarkData> {
    const params = startDate ? `?start_date=${encodeURIComponent(startDate)}` : '';
    return fetchFromEngine(`/analysis/benchmarks/${period}${params}`);
}

/**
 * Get change percentages for multiple symbols for a specific period
 */
export async function fetchBatchChanges(symbols: string[], period: string): Promise<{
    results: Array<{ symbol: string, change_percent: number }>,
    period: string
}> {
    try {
        return await fetchFromEngine(`/market/batch-changes?symbols=${symbols.join(',')}&period=${period}`);
    } catch (error) {
        console.warn(`[fetchBatchChanges] ${period} fetch failed, using empty fallback`, error);
        return { results: [], period };
    }
}

/**
 * Get current prices and daily change for multiple symbols
 */
export interface BatchQuoteResult {
    symbol: string;
    last: number;
    change_percent: number;
    currency: string;
    source: string;
}

export async function fetchBatchQuotes(symbols: string[]): Promise<{
    results: BatchQuoteResult[]
}> {
    if (symbols.length === 0) return { results: [] };
    return fetchFromEngine(`/market/batch-quotes?symbols=${symbols.join(',')}`, {
        timeout: 30000,
        cacheTime: 60000,
    });
}

/**
 * Get engine connection URL (for display purposes)
 */
export function getEngineUrl(): string {
    return PYTHON_ENGINE_URL;
}

// ==========================================
// Borsapy 0.7.2 New API Functions
// ==========================================

/**
 * Get TCMB (Turkish Central Bank) interest rates
 */
export interface TCMBRates {
    policy_rate: number;
    overnight: {
        borrowing: number;
        lending: number;
    };
    late_liquidity: {
        borrowing: number;
        lending: number;
    };
    rates_df: Array<{
        type: string;
        borrowing: number | null;
        lending: number;
    }>;
}

export async function fetchTCMBRates(): Promise<TCMBRates> {
    return fetchFromEngine<TCMBRates>("/v2/tcmb/rates");
}

/**
 * Get Turkish Eurobonds
 */
export interface Eurobond {
    isin: string;
    maturity: string;
    days_to_maturity: number;
    currency: "USD" | "EUR";
    bid_price: number;
    bid_yield: number;
    ask_price: number;
    ask_yield: number;
}

export interface EurobondsResponse {
    currency: string;
    bonds: Eurobond[];
    count: number;
}

export async function fetchEurobonds(currency?: "USD" | "EUR"): Promise<EurobondsResponse> {
    const params = currency ? `?currency=${currency}` : "";
    return fetchFromEngine<EurobondsResponse>(`/v2/eurobonds${params}`);
}

/**
 * Get fast info for a stock (quick price data)
 */
export interface FastInfo {
    symbol: string;
    currency: string;
    exchange: string;
    last_price: number;
    open: number;
    day_high: number;
    day_low: number;
    previous_close: number | null;
    volume: number;
    amount: number | null;
    market_cap: number;
    shares: number;
    pe_ratio: number;
    pb_ratio: number;
    year_high: number;
    year_low: number;
    fifty_day_average: number;
    two_hundred_day_average: number;
    free_float: number;
    foreign_ratio: number;
    net_margin: number;
    ebitda_margin: number;
    ev_ebitda: number;
    ev_sales: number;
    source: string;
}

export async function fetchFastInfo(symbol: string): Promise<FastInfo> {
    return fetchFromEngine<FastInfo>(`/v2/fast-info/${symbol}`);
}

/**
 * Technical scan using borsapy scan() function
 */
export interface ScanResult {
    results: Array<{
        symbol: string;
        name: string;
        close: number;
        volume: number;
        rsi?: number;
        macd?: number;
        change: number;
        market_cap: number;
    }>;
    count: number;
    condition: string;
    index: string;
}

export async function fetchTechnicalScan(
    condition: string,
    index: string = "XU100",
    interval: string = "1d"
): Promise<ScanResult> {
    return fetchFromEngine<ScanResult>(
        `/v2/scan?index=${encodeURIComponent(index)}&condition=${encodeURIComponent(condition)}&interval=${interval}`
    );
}

/**
 * Get stock screener data with criteria
 */
export interface ScreenerStock {
    symbol: string;
    name: string;
    last: number;
    change_percent: number;
    volume: number;
    market_cap: number;
    pe: number;
    pb: number;
    dividend_yield: number;
    roe: number;
    roa: number;
    p1w: number;
    p1m: number;
    p1y: number;
    return_ytd: number;
    upside: number;
    foreign_ratio: number;
    net_margin: number;
    ebitda_margin: number;
    ev_ebitda: number;
    ev_sales: number;
}

export interface ScreenerResponse {
    results: ScreenerStock[];
    count: number;
    error?: string;
}

export async function fetchScreenerStocks(
    group: string = "getiri",
    index?: string,
    sector?: string
): Promise<ScreenerResponse> {
    const params = new URLSearchParams({ group });
    if (index) params.append("index", index);
    if (sector) params.append("sector", sector);
    return fetchFromEngine<ScreenerResponse>(`/market/screener/stocks?${params}`);
}

/**
 * Get Supertrend indicator data
 */
export interface SupertrendData {
    symbol: string;
    period: string;
    current_signal: string;
    supertrend: number;
    data: Array<{
        date: string;
        close: number;
        supertrend: number;
        signal: string;
    }>;
}

export async function fetchSupertrend(
    symbol: string,
    period: string = "6mo",
    atrPeriod: number = 10,
    multiplier: number = 3.0
): Promise<SupertrendData> {
    return fetchFromEngine<SupertrendData>(
        `/v2/supertrend/${symbol}?period=${period}&atr_period=${atrPeriod}&multiplier=${multiplier}`
    );
}

/**
 * Get all BIST indices list
 */
export async function fetchAllIndices(): Promise<{
    indices: Array<{ symbol: string; name: string }>;
    count: number;
}> {
    return fetchFromEngine("/api/v2/indices");
}

/**
 * Get risk-free rate (for portfolio calculations)
 */
export async function fetchRiskFreeRate(): Promise<{ rate: number; source: string }> {
    return fetchFromEngine("/api/v2/risk-free-rate");
}

export interface DashboardIndicator {
    symbol: string;
    name: string;
    type: string;
    value: number | null;
    change: number | null;
}

export interface GlobalAlphaItem {
    key: string;
    label: string;
    symbol: string;
    estimated_value_trillion_usd: number;
    share?: number;
    color: string;
    source: string;
    period_return_pct?: number;
    daily_return_pct?: number;
}

export interface GlobalAlphaResponse {
    as_of: string;
    total_trillion_usd: number;
    daily_return_pct: number;
    core_daily_return_pct?: number;
    period: string;
    items: GlobalAlphaItem[];
    core_items?: GlobalAlphaItem[];
    macro_sidecar_items?: GlobalAlphaItem[];
    count: number;
    core_count?: number;
    macro_sidecar_count?: number;
    macro_regime_label?: string;
    ga_label?: string;
    macro_label?: string;
    from_cache: boolean;
}

export async function fetchDashboardIndicators(): Promise<DashboardIndicator[]> {
    // Python backend'de /dashboard/indicators endpoint'i var
    return fetchFromEngine<DashboardIndicator[]>("/dashboard/indicators");
}

export async function fetchGlobalAlpha(
    force: boolean = false,
    period: "daily" | "weekly" | "monthly" | "ytd" | "yearly" | "five_years" | "all" = "daily",
): Promise<GlobalAlphaResponse> {
    const params = new URLSearchParams();
    if (force) params.set("force", "true");
    params.set("period", period);
    const query = `?${params.toString()}`;
    const candidates = [
        `/dashboard/global-alpha${query}`,
        `/dashboard/dashboard/global-alpha${query}`,
    ];

    let lastError: unknown = null;

    for (const endpoint of candidates) {
        try {
            return await fetchFromEngine<GlobalAlphaResponse>(endpoint, {
                timeout: 45000,
                cacheTime: force ? undefined : 60000,
                bypassCache: force,
            });
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Global alpha fetch failed");
}
