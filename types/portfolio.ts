/**
 * Portfolio Types
 *
 * These types mirror the Python backend models.
 * Frontend and backend should maintain compatible schemas.
 */

// ============================================
// Core Portfolio Types
// ============================================

/**
 * Portfolio asset with weight allocation
 * Matches Python: api/portfolio.py Asset model
 */
export interface PortfolioAsset {
    symbol: string;
    weight: number; // 0-1 decimal representation
}

/**
 * Portfolio entity stored in backend
 * Matches Python: api/portfolio.py Portfolio model
 */
export interface PortfolioEntity {
    id: string;
    name: string;
    created_at: string; // ISO date string
    assets: PortfolioAsset[];
}

// ============================================
// Analysis Result Types
// ============================================

/**
 * Individual asset analysis result from Python engine
 */
export interface AssetAnalysisResult {
    symbol: string;
    weight: number;
    score: number;
    entropy: number;
    hurst: number;
    volatility: number;
    regime: string;
    probability_up: number;
    probability_down: number;
}

/**
 * Portfolio-level analysis result from Python engine
 * Matches Python: api/portfolio.py PortfolioAnalysisResponse
 */
export interface PortfolioAnalysis {
    portfolio_id: string;
    portfolio_name: string;
    aggregate_score: number;
    aggregate_volatility: number;
    aggregate_entropy: number;
    dominant_regime: string;
    risk_band: "low" | "moderate" | "elevated" | "high";
    assets: AssetAnalysisResult[];
}

// ============================================
// Regime Types
// ============================================

/**
 * Market regime classifications
 */
export type MarketRegime =
    | "Bullish Trend"
    | "Bearish Trend"
    | "Sideways/Range"
    | "Unknown";

/**
 * Risk band classifications
 */
export type RiskBand = "low" | "moderate" | "elevated" | "high" | "unknown";

// ============================================
// Historical Data Types
// ============================================

export interface HistoricalDataPoint {
    date: string;
    value: number;
}

export interface PriceHistory {
    daily: HistoricalDataPoint[];
    weekly: HistoricalDataPoint[];
    monthly: HistoricalDataPoint[];
    all: HistoricalDataPoint[];
}

// ============================================
// Probability Types
// ============================================

/**
 * Probability estimates for different time horizons
 */
export interface ProbabilityEstimate {
    up: number;
    down: number;
    sideways: number;
}

export interface ProbabilityMatrix {
    short_term: ProbabilityEstimate;
    mid_term: ProbabilityEstimate;
    long_term: ProbabilityEstimate;
}

// ============================================
// Valuation Types
// ============================================

export interface ValuationResult {
    symbol: string;
    intrinsic_value: number | null;
    current_price: number;
    margin_of_safety: number | null;
    valuation_status: "undervalued" | "overvalued" | "fairly_valued" | "unknown";
    balance_strength: number | null;
    analysis_time: string;
}
