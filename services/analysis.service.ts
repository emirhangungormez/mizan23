/**
 * Analysis Service - FETCH ONLY
 *
 * This service ONLY calls the Python backend API for analysis.
 * NO mathematics, NO scoring logic, NO calculations allowed here.
 *
 * All analysis, entropy, hurst, volatility, and regime detection
 * happens EXCLUSIVELY in Python.
 */

import { fetchFromEngine } from "@/lib/api-client";

// ============================================
// Type Definitions (mirrors Python responses)
// ============================================

export interface AssetAnalysis {
    symbol: string;
    last_price: number;
    analysis_time: string;

    // Core metrics (calculated in Python)
    score: number;
    entropy: number;
    hurst: number;
    volatility: number;
    regime: string;

    // Probability estimates (calculated in Python)
    probability_up: number;
    probability_down: number;
    probability_sideways: number;

    // Risk classification
    risk_band: "low" | "moderate" | "elevated" | "high";

    // Interpretation
    trend_strength: string;
    predictability: string;
    recommendation_class: string;
}

export interface RegimeAnalysis {
    symbol: string;
    regime: string;
    confidence: number;
    sma_20: number;
    sma_50: number;
    current_price: number;
    trend_direction: string;
    analysis_time: string;
}

export interface ValuationAnalysis {
    symbol: string;
    intrinsic_value: number | null;
    current_price: number;
    margin_of_safety: number | null;
    valuation_status: string;
    balance_strength: number | null;
    analysis_time: string;
}

export interface BatchAnalysisResult {
    symbol: string;
    status: "ok" | "no_data" | "error";
    last_price?: number;
    score?: number;
    entropy?: number;
    hurst?: number;
    volatility?: number;
    regime?: string;
    error?: string;
}

export interface BatchAnalysisResponse {
    count: number;
    results: BatchAnalysisResult[];
}

// ============================================
// Service Class - Pure Fetch Operations
// ============================================

export class AnalysisService {
    /**
     * Get comprehensive analysis for a single asset
     */
    static async analyzeAsset(symbol: string, options?: { market?: string; currency?: string }): Promise<AssetAnalysis | null> {
        try {
            const params = new URLSearchParams();
            if (options?.market) params.set("market", options.market);
            if (options?.currency) params.set("currency", options.currency);
            const query = params.toString();
            const data = await fetchFromEngine<AssetAnalysis>(`/analysis/${symbol}${query ? `?${query}` : ""}`);
            return data;
        } catch (error) {
            console.error(`[AnalysisService] Failed to analyze ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get regime analysis for a symbol
     */
    static async getRegime(symbol: string): Promise<RegimeAnalysis | null> {
        try {
            const data = await fetchFromEngine<RegimeAnalysis>(`/analysis/${symbol}/regime`);
            return data;
        } catch (error) {
            console.error(`[AnalysisService] Failed to get regime for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get valuation analysis for a symbol
     */
    static async getValuation(symbol: string): Promise<ValuationAnalysis | null> {
        try {
            const data = await fetchFromEngine<ValuationAnalysis>(`/analysis/${symbol}/valuation`);
            return data;
        } catch (error) {
            console.error(`[AnalysisService] Failed to get valuation for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Analyze multiple symbols at once
     */
    static async batchAnalyze(symbols: string[]): Promise<BatchAnalysisResponse> {
        try {
            const symbolsParam = symbols.join(",");
            const data = await fetchFromEngine<BatchAnalysisResponse>(`/analysis/batch/analyze?symbols=${symbolsParam}`);
            return data;
        } catch (error) {
            console.error("[AnalysisService] Batch analysis failed:", error);
            return { count: 0, results: [] };
        }
    }
}
