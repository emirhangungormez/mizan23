/**
 * Dashboard Store (Zustand)
 *
 * Manages dashboard state including market data and UI preferences.
 * All market data comes from the Python backend via services.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MarketService, type DashboardData } from "@/services/market.service";
import { AnalysisService, type AssetAnalysis } from "@/services/analysis.service";

// Analysis Result Type
interface AnalysisResult {
  symbol: string;
  regime: string;
  probabilityUp: number;
  riskScore: number;
}

// Detailed Analysis Type
import type { MarketAnalysisData } from "@/lib/api-client";
interface DetailedAnalysisData {
  bist: MarketAnalysisData | null;
  us: MarketAnalysisData | null;
  commodities: MarketAnalysisData | null;
  crypto: MarketAnalysisData | null;
  funds: MarketAnalysisData | null;
}

interface DashboardState {
  // Market Overview Data
  dashboardData: DashboardData | null;

  // Selected Asset for Detail View
  selectedAsset: string | null;
  selectedAssetAnalysis: AssetAnalysis | null;

  // Loading States
  isLoadingDashboard: boolean;
  isLoadingAssetAnalysis: boolean;
  usdRate: number;
  error: string | null;

  // Last Update Time
  lastUpdated: Date | null;
  lastAnalysisTime: Date | null;

  // Analysis Results (Market Pulse)
  analysisResults: AnalysisResult[];
  isAnalyzing: boolean;
  hasAttemptedAnalysis: boolean;

  // Detailed Analysis (Heavy Data)
  detailedAnalysis: DetailedAnalysisData;

  // Actions
  fetchDashboardData: (bypassCache?: boolean) => Promise<void>;
  runAnalysis: () => Promise<void>;
  setDetailedAnalysis: (data: DetailedAnalysisData) => void;
  selectAsset: (symbol: string) => Promise<void>;
  clearSelectedAsset: () => void;
  refreshData: () => Promise<void>;
  triggerRefresh: () => void;
  refreshTrigger: number;
  clearError: () => void;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
}

// ============================================
// Store Implementation
// ============================================

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      dashboardData: null,
      selectedAsset: null,
      selectedAssetAnalysis: null,
      isLoadingDashboard: false,
      isLoadingAssetAnalysis: false,
      usdRate: 35, // Default fallback
      error: null,
      lastUpdated: null,
      refreshTrigger: 0,
      analysisResults: [],
      isAnalyzing: false,
      hasAttemptedAnalysis: false,
      hasHydrated: false,

      detailedAnalysis: {
        bist: null,
        us: null,
        commodities: null,
        crypto: null,
        funds: null
      },
      lastAnalysisTime: null,
      setHasHydrated: (value: boolean) => set({ hasHydrated: value }),

      /**
       * Set comprehensive market analysis data
       */
      setDetailedAnalysis: (data: DetailedAnalysisData) => {
        set({
          detailedAnalysis: data,
          lastAnalysisTime: new Date()
        });
      },

      /**
       * Fetch main dashboard data from Python backend
       */
      fetchDashboardData: async (bypassCache = false) => {
        const hasExistingData = Boolean(get().dashboardData);
        set({ isLoadingDashboard: !hasExistingData, error: null });
        try {
          const data = await MarketService.getDashboardData(bypassCache);
          const usdQuote = data.fx?.find(f => f.symbol === 'USDTRY' || f.symbol === 'USD/TRY' || f.symbol.includes('USDTRY'));
          const freshUsdRate = usdQuote ? usdQuote.last : get().usdRate;

          set({
            dashboardData: data,
            usdRate: freshUsdRate,
            isLoadingDashboard: false,
            lastUpdated: new Date(),
          });
        } catch (error) {
          set({
            isLoadingDashboard: false,
            error: error instanceof Error ? error.message : "Failed to fetch dashboard data",
          });
        }
      },

      /**
       * Run batch analysis for market pulse
       */
      runAnalysis: async () => {
        set({ isAnalyzing: true });
        try {
          const symbols = ["THYAO", "EREGL", "KCHOL", "BTCUSDT", "ETHUSDT", "XU100"];
          const response = await AnalysisService.batchAnalyze(symbols);

          const results = (response?.results || []).map(r => {
            let mappedRegime = "sideways";
            if (r.regime?.includes("Bullish") || r.regime?.includes("Bearish")) {
              mappedRegime = "trend";
            } else if (r.regime?.includes("Volatile") || r.regime?.includes("High")) {
              mappedRegime = "chaotic";
            }

            return {
              symbol: r.symbol,
              regime: mappedRegime,
              probabilityUp: (r as { probability_up?: number }).probability_up || 0.5,
              riskScore: r.volatility || 0.3
            };
          });

          set({
            analysisResults: results,
            isAnalyzing: false,
            hasAttemptedAnalysis: true
          });
        } catch (error) {
          console.error("Batch analysis failed:", error);
          set({
            isAnalyzing: false,
            hasAttemptedAnalysis: true
          });
        }
      },

      /**
       * Select an asset and fetch its detailed analysis
       */
      selectAsset: async (symbol: string) => {
        set({
          selectedAsset: symbol,
          selectedAssetAnalysis: null,
          isLoadingAssetAnalysis: true,
          error: null,
        });
        try {
          const analysis = await AnalysisService.analyzeAsset(symbol);
          set({
            selectedAssetAnalysis: analysis,
            isLoadingAssetAnalysis: false,
          });
        } catch (error) {
          set({
            isLoadingAssetAnalysis: false,
            error: error instanceof Error ? error.message : `Failed to analyze ${symbol}`,
          });
        }
      },

      /**
       * Clear selected asset
       */
      clearSelectedAsset: () => {
        set({
          selectedAsset: null,
          selectedAssetAnalysis: null,
        });
      },

      /**
       * Refresh all dashboard data
       */
      refreshData: async () => {
        const { selectedAsset } = get();
        await get().fetchDashboardData();
        if (selectedAsset) {
          await get().selectAsset(selectedAsset);
        }
      },

      /**
       * Global trigger to let components know they should refresh
       */
      triggerRefresh: () => {
        set((state) => ({ refreshTrigger: state.refreshTrigger + 1 }));
      },

      /**
       * Clear error state
       */
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "trade-intel-dashboard", // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage),
      // Only keep the essential data, skip UI states
      partialize: (state) => ({
        dashboardData: state.dashboardData,
        detailedAnalysis: state.detailedAnalysis,
        lastAnalysisTime: state.lastAnalysisTime,
        analysisResults: state.analysisResults,
        lastUpdated: state.lastUpdated
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// ============================================
// Selectors
// ============================================

export const useDashboardLoading = () =>
  useDashboardStore((state) => ({
    isLoadingDashboard: state.isLoadingDashboard,
    isLoadingAssetAnalysis: state.isLoadingAssetAnalysis,
  }));

export const useMarketIndices = () =>
  useDashboardStore((state) => state.dashboardData?.indices || []);

export const useMarketCommodities = () =>
  useDashboardStore((state) => state.dashboardData?.commodities || []);

export const useMarketFx = () =>
  useDashboardStore((state) => state.dashboardData?.fx || []);

export const useMarketCrypto = () =>
  useDashboardStore((state) => state.dashboardData?.crypto || []);

export const useMarketUs = () =>
  useDashboardStore((state) => state.dashboardData?.us_markets || []);
