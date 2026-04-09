import { fetchFromEngine } from "@/lib/api-client";
import type { PortfolioTargetMode, PortfolioTargetProfile } from "@/lib/portfolio-targets";
import { useUserStore } from "@/store/user-store";

/**
 * Portfolio Service - Local JSON Database
 *
 * This service interacts with the local Next.js API routes (/api/portfolio)
 * which read/write from data/portfolios.json.
 */

// ============================================
// Type Definitions
// ============================================

export type PortfolioAssetType = 'stock' | 'crypto' | 'fx' | 'fund' | 'cash' | 'gold' | 'commodity';
export type PortfolioTransactionType = 'buy' | 'sell';

export interface PortfolioAsset {
    symbol: string;
    type: PortfolioAssetType;
    quantity: number;
    avg_price: number;
    avgPrice?: number; // Map from avg_price
    weight?: number;
    purchase_date?: string;
    currency?: string;
    notes?: string;
    name?: string;
    asset_type?: string; // Backend compatibility
    target_profile?: PortfolioTargetProfile;
    target_mode?: PortfolioTargetMode;
    target_return_pct?: number;
}

export interface Transaction {
    id: string;
    symbol: string;
    type?: PortfolioTransactionType;
    asset_type?: PortfolioAssetType;
    asset_name?: string;
    quantity: number;
    price?: number;
    date?: string;
    currency?: string;
    note?: string;
    fee?: number;
    hidden?: boolean;
    is_system_generated?: boolean;
    linked_transaction_id?: string;
    realized_profit_loss?: number | null;
    realized_profit_loss_pct?: number | null;

    // Legacy compatibility fields
    buy_price?: number;
    sell_price?: number;
    buy_date?: string;
    sell_date?: string;
    profit_loss?: number;
    profit_loss_pct?: number;
}

export interface Portfolio {
    id: string;
    userId?: string | null;
    name: string;
    description?: string;
    created_at: string;
    updated_at?: string;
    currency?: string;
    assets: PortfolioAsset[];
    transactions?: Transaction[];
}

export interface PerformancePoint {
    date: string;
    value: number;
    benchmark?: number;
}

export interface RiskMetrics {
    volatility: number;
    sharpe_ratio: number;
    sortino_ratio: number;
    max_drawdown: number;
    beta: number;
    alpha: number;
    var: number;
}

export interface AnalyzedAsset {
    symbol: string;
    current_price?: number;
    current_value?: number;
    weight?: number;
    pnl?: number;
    pnl_pct?: number;
    [key: string]: unknown;
}

export interface HoldingDecision {
    symbol: string;
    name?: string;
    quantity?: number;
    avg_price?: number;
    current_price?: number;
    current_value?: number;
    cost_basis?: number;
    pnl?: number;
    pnl_pct?: number;
    holding_days?: number | null;
    status?: string;
    holding_action?: "Tut" | "Sat" | "Kesin Sat" | string;
    holding_action_reason?: string;
    entry_signal?: "Sepete Eklenebilir" | "Bekle" | "Uzak Dur" | string;
    entry_signal_reason?: string;
    firsat_skoru?: number;
    trade_skoru?: number;
    uzun_vade_skoru?: number;
    radar_skoru?: number;
    hakiki_alfa_pct?: number;
    quote_change_percent?: number;
    currency?: string;
    captured_at?: string;
    target_profile?: PortfolioTargetProfile;
    target_mode?: PortfolioTargetMode;
    target_source_label?: string;
    target_profile_label?: string;
    target_return_pct?: number;
    system_target_return_pct?: number;
    target_price?: number;
    system_target_price?: number;
    distance_to_target_pct?: number;
    target_progress_pct?: number;
    target_status?: string;
    target_action?: string;
    target_action_reason?: string;
    target_warning?: string;
    target_system_reason?: string;
    conviction_score?: number;
    probability_positive?: number;
    probability_outperform?: number;
    expected_return_pct?: number;
    expected_excess_return_pct?: number;
    risk_forecast_pct?: number;
    calibration_confidence?: number;
    signal_version?: string;
    calibration_version?: string;
    decision_band?: string;
    probability_horizon_label?: string;
    probability_horizon_days?: number;
    probability_action?: string;
}

export interface RecommendationAlert {
    symbol: string;
    severity: "Sat" | "Kesin Sat" | string;
    status?: string;
    message?: string;
}

export interface RecommendationMemorySummary {
    journal_size?: number;
    followed_entries?: Array<{
        symbol: string;
        buy_date?: string;
        recommendation_at?: string;
        entry_signal?: string;
        quantity?: number;
        buy_price?: number;
        current_outcome_pct?: number;
        profitable_now?: boolean;
    }>;
    followed_recommendations?: number;
    profitable_followed_recommendations?: number;
    losing_followed_recommendations?: number;
    followed_win_rate?: number;
    avg_followed_return_pct?: number;
    evaluated_recommendations?: number;
    actions?: Record<string, {
        count: number;
        win_rate: number;
        avg_return_after_signal_pct: number;
    }>;
    lessons?: string[];
}

export interface PortfolioReportTrade {
    symbol: string;
    name?: string;
    quantity?: number;
    buy_date?: string | null;
    sell_date?: string | null;
    buy_price?: number;
    sell_price?: number;
    holding_days?: number | null;
    realized_pnl?: number;
    realized_return_pct?: number;
    entry_signal?: string | null;
    entry_signal_at?: string | null;
    entry_signal_price?: number | null;
    entry_signal_alignment?: boolean | null;
    entry_probability_positive?: number | null;
    entry_probability_outperform?: number | null;
    entry_expected_return_pct?: number | null;
    entry_expected_excess_return_pct?: number | null;
    entry_decision_band?: string | null;
    exit_action?: string | null;
    exit_signal_at?: string | null;
    exit_signal_price?: number | null;
    exit_move_pct?: number | null;
    exit_signal_alignment?: boolean | null;
    exit_probability_positive?: number | null;
    exit_expected_return_pct?: number | null;
    realized_vs_expected_return_pct?: number | null;
}

export interface PortfolioReportSummary {
    closed_trade_count?: number;
    win_count?: number;
    loss_count?: number;
    win_rate?: number;
    win_rate_confidence_interval?: { lower: number; upper: number };
    avg_realized_return_pct?: number;
    median_realized_return_pct?: number;
    avg_winner_return_pct?: number;
    avg_loser_return_pct?: number;
    profit_factor?: number;
    expectancy_pct?: number;
    avg_holding_days?: number;
    median_holding_days?: number;
    entry_signal_evaluated_count?: number;
    entry_signal_accuracy_pct?: number;
    entry_signal_confidence_interval?: { lower: number; upper: number };
    entry_followed_trade_count?: number;
    entry_followed_win_rate?: number;
    entry_probability_avg?: number;
    entry_outperform_probability_avg?: number;
    expected_return_avg_pct?: number;
    realized_vs_expected_return_avg_pct?: number;
    exit_signal_evaluated_count?: number;
    exit_signal_accuracy_pct?: number;
    exit_signal_confidence_interval?: { lower: number; upper: number };
    exit_probability_avg?: number;
    probability_brier_score?: number;
    signal_bucket_summary?: Record<string, {
        count: number;
        win_rate: number;
        avg_realized_return_pct: number;
    }>;
    recent_closed_trades?: PortfolioReportTrade[];
    lessons?: string[];
}

export interface PortfolioAnalysis {
    portfolio_id: string;
    portfolio_name: string;
    total_value: number;
    pnl: number;
    pnl_pct: number;
    risk_metrics: RiskMetrics;
    equity_curve: PerformancePoint[];
    allocation: { name: string; value: number }[];
    assets: AnalyzedAsset[];
    holding_decisions?: HoldingDecision[];
    alerts?: RecommendationAlert[];
    recommendation_memory?: RecommendationMemorySummary;
    portfolio_report?: PortfolioReportSummary;
}

export interface CreatePortfolioRequest {
    userId?: string | null;
    name: string;
    description?: string;
    currency?: string;
    assets?: PortfolioAsset[];
}

function resolvePortfolioApiUrl(pathname: string): string {
    if (typeof window === "undefined") {
        return pathname;
    }
    return new URL(pathname, window.location.origin).toString();
}

function withUserId(pathname: string, userId?: string | null): string {
    if (!userId) return pathname;
    const separator = pathname.includes("?") ? "&" : "?";
    return `${pathname}${separator}userId=${encodeURIComponent(userId)}`;
}

async function fetchPortfolioApi(pathname: string, init?: RequestInit, retries: number = 2): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fetch(resolvePortfolioApiUrl(pathname), init);
        } catch (error) {
            lastError = error;
            if (attempt >= retries) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Portfolio API fetch failed");
}

// ============================================
// Service Class - Local JSON API
// ============================================

export class PortfolioService {
    /**
     * Get all portfolios from local JSON DB
     */
    static async getAll(userId?: string | null): Promise<Portfolio[]> {
        try {
            const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : "";
            const res = await fetchPortfolioApi(`/api/portfolio${suffix}`, { cache: 'no-store' });
            if (!res.ok) throw new Error("Failed to fetch portfolios");
            return await res.json();
        } catch (error) {
            console.error("[PortfolioService] Failed to fetch portfolios:", error);
            return [];
        }
    }

    /**
     * Get a specific portfolio by ID
     */
    static async getById(portfolioId: string): Promise<Portfolio | null> {
        try {
            const userId = useUserStore.getState().currentUser?.id || null;
            const res = await fetchPortfolioApi(withUserId(`/api/portfolio/${portfolioId}`, userId), { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json();
        } catch (error) {
            console.error(`[PortfolioService] Failed to fetch portfolio ${portfolioId}:`, error);
            return null;
        }
    }

    /**
     * Create a new portfolio
     */
    static async create(request: CreatePortfolioRequest): Promise<Portfolio | null> {
        try {
            const res = await fetchPortfolioApi("/api/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request)
            });
            if (!res.ok) throw new Error("Failed to create portfolio");
            return await res.json();
        } catch (error) {
            console.error("[PortfolioService] Create failed:", error);
            return null;
        }
    }

    /**
     * Update a portfolio document
     */
    static async update(portfolioId: string, updates: Partial<Portfolio>): Promise<Portfolio | null> {
        try {
            const userId = useUserStore.getState().currentUser?.id || null;
            const res = await fetchPortfolioApi(withUserId(`/api/portfolio/${portfolioId}`, userId), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates)
            });
            if (!res.ok) throw new Error("Failed to update portfolio");
            return await res.json();
        } catch (error) {
            console.error("[PortfolioService] Update failed:", error);
            return null;
        }
    }

    /**
     * Delete a portfolio
     */
    static async delete(portfolioId: string): Promise<boolean> {
        try {
            const userId = useUserStore.getState().currentUser?.id || null;
            const res = await fetchPortfolioApi(withUserId(`/api/portfolio/${portfolioId}`, userId), { method: "DELETE" });
            return res.ok;
        } catch (error) {
            console.error("[PortfolioService] Delete failed:", error);
            return false;
        }
    }

    /**
     * Update portfolio assets (used for adding/removing assets)
     */
    static async updateAssets(portfolioId: string, assets: PortfolioAsset[]): Promise<boolean> {
        try {
            return !!(await this.update(portfolioId, { assets }));
        } catch (error) {
            console.error("[PortfolioService] Update assets failed:", error);
            return false;
        }
    }

    /**
     * Run professional analysis using Python engine and borsapy
     */
    static async analyze(portfolioId: string): Promise<PortfolioAnalysis | null> {
        try {
            return await fetchFromEngine<PortfolioAnalysis>(`/portfolio/${portfolioId}/analyze`, {
                method: "POST"
            });
        } catch (error) {
            console.error("[PortfolioService] Analyze failed:", error);
            return null;
        }
    }

    /**
     * Sell an asset and record transaction
     */
    static async sellAsset(portfolioId: string, request: { symbol: string, quantity: number, sell_price: number, sell_date: string }): Promise<Transaction | null> {
        try {
            const res = await fetchFromEngine<{ message: string, transaction: Transaction }>(`/portfolio/${portfolioId}/sell`, {
                method: "POST",
                body: JSON.stringify(request)
            });
            return res.transaction;
        } catch (error) {
            console.error("[PortfolioService] Sell asset failed:", error);
            return null;
        }
    }
}
