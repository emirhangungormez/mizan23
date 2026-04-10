"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  PortfolioService,
  type Portfolio,
  type PortfolioAnalysis,
  type PortfolioAsset,
  type PortfolioAssetType,
  type PortfolioTransactionType,
  type Transaction,
} from "@/services/portfolio.service";
import {
  createTransactionInput,
  deleteSymbolTransactions as deleteTransactionsForSymbol,
  deleteTransactionById,
  derivePortfolioState,
  normalizePortfolio,
  upsertTransaction,
} from "@/lib/portfolio-transactions";
import {
  DEFAULT_PORTFOLIO_TARGET_PROFILE,
  getDefaultTargetReturnPct,
  type PortfolioTargetMode,
  type PortfolioTargetProfile,
} from "@/lib/portfolio-targets";
import { useUserStore } from "@/store/user-store";

export type { Portfolio, PortfolioAsset, PortfolioAnalysis, Transaction };

export type Timeframe = "1D" | "1W" | "1M" | "1Y" | "5Y" | "YTD" | "ALL";

export interface PerformanceMetrics {
  profit: number;
  percent: number;
  profitValue: number;
  hasMissingDates: boolean;
  label: string;
}

export interface GlobalMetrics {
  totalValue: number;
  buyingPower: number;
  dailyChangePct: number;
  weeklyChangePct: number;
  allTimeProfit: number;
  riskMode: string;
  efsScore: number;
  selectedTimeframe: Timeframe;
  performanceMetrics: PerformanceMetrics;
  displayCurrency: "TRY" | "USD";
}

type TransactionPayload = {
  symbol: string;
  type: PortfolioTransactionType;
  market?: string;
  quantity: number;
  price: number;
  date: string;
  currency?: string;
  assetType?: PortfolioAssetType;
  assetName?: string;
  note?: string;
  fee?: number;
};

interface PortfolioState {
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  activeAnalysis: PortfolioAnalysis | null;
  globalMetrics: GlobalMetrics;
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  periodChanges: Record<string, Record<string, number>>; // { '1M': { 'THYAO': 5.2, ... } }
  isFetchingPeriodChanges: boolean;

  fetchPortfolios: () => Promise<void>;
  createPortfolio: (name: string) => Promise<Portfolio | null>;
  deletePortfolio: (id: string) => Promise<boolean>;
  renamePortfolio: (id: string, name: string) => Promise<boolean>;
  setActivePortfolio: (id: string) => void;
  updatePortfolioAssets: (portfolioId: string, assets: PortfolioAsset[]) => Promise<boolean>;
  updateAssetSettings: (
    portfolioId: string,
    symbol: string,
    updates: Partial<Pick<PortfolioAsset, "target_profile" | "target_mode" | "target_return_pct" | "notes" | "name">>
  ) => Promise<boolean>;
  addAsset: (portfolioId: string, asset: { symbol: string; type?: string; market?: string; quantity?: number; purchasePrice?: number; purchaseDate?: string; currency?: string; name?: string; note?: string }) => Promise<boolean>;
  removeAsset: (portfolioId: string, symbol: string) => Promise<boolean>;
  sellAsset: (portfolioId: string, request: { symbol: string; quantity: number; sell_price: number; sell_date: string }) => Promise<boolean>;
  addTransaction: (portfolioId: string, transaction: TransactionPayload) => Promise<boolean>;
  updateTransaction: (portfolioId: string, transactionId: string, transaction: TransactionPayload) => Promise<boolean>;
  deleteTransaction: (portfolioId: string, transactionId: string) => Promise<boolean>;
  deleteSymbolTransactions: (portfolioId: string, symbol: string) => Promise<boolean>;
  runAnalysis: (portfolioId?: string) => Promise<void>;
  updateGlobalMetrics: (metrics: Partial<GlobalMetrics>) => void;
  setPeriodChanges: (tf: string, changes: Record<string, number>) => void;
  setFetchingPeriodChanges: (fetching: boolean) => void;
  clearError: () => void;
}

const DEFAULT_METRICS: GlobalMetrics = {
  totalValue: 0,
  buyingPower: 0,
  dailyChangePct: 0,
  weeklyChangePct: 0,
  allTimeProfit: 0,
  riskMode: "Notr",
  efsScore: 0,
  selectedTimeframe: "1D",
  performanceMetrics: {
    profit: 0,
    percent: 0,
    profitValue: 0,
    hasMissingDates: false,
    label: "Bugunku",
  },
  displayCurrency: "TRY",
};

const PORTFOLIO_STORAGE_KEY = "mizan23-portfolio-ui";

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("portfolio-storage");
    const stored = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.state = {
        portfolios: [],
        activePortfolioId: null,
        globalMetrics: {
          ...DEFAULT_METRICS,
          displayCurrency: parsed?.state?.globalMetrics?.displayCurrency || "TRY",
          selectedTimeframe: parsed?.state?.globalMetrics?.selectedTimeframe || "1D",
        },
      };
      localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Ignore storage migration failures.
  }
}

function applyNormalizedPortfolios(portfolios: Portfolio[]): Portfolio[] {
  return portfolios.map((portfolio) => normalizePortfolio(portfolio));
}

async function persistTransactionsForPortfolio(
  portfolio: Portfolio,
  transactions: Transaction[],
  extraUpdates: Partial<Portfolio> = {}
): Promise<Portfolio | null> {
  const derived = derivePortfolioState(transactions, portfolio.assets || []);
  return PortfolioService.update(portfolio.id, {
    ...extraUpdates,
    assets: derived.assets,
    transactions: derived.transactions,
  });
}

async function ensurePortfolioInState(
  portfolioId: string,
  statePortfolios: Portfolio[]
): Promise<Portfolio | null> {
  const existing = statePortfolios.find((portfolio) => portfolio.id === portfolioId);
  if (existing) return existing;

  const fetched = await PortfolioService.getById(portfolioId);
  return fetched ? normalizePortfolio(fetched) : null;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: [],
      activePortfolioId: null,
      activeAnalysis: null,
      globalMetrics: DEFAULT_METRICS,
      isLoading: false,
      isAnalyzing: false,
      error: null,
      periodChanges: {},
      isFetchingPeriodChanges: false,

      fetchPortfolios: async () => {
        set({ isLoading: true, error: null });
        try {
          const userId = useUserStore.getState().currentUser?.id || null;
          const rawPortfolios = await PortfolioService.getAll(userId);
          const portfolios = applyNormalizedPortfolios(rawPortfolios);
          set((state) => ({
            portfolios,
            activePortfolioId: portfolios.some((item) => item.id === state.activePortfolioId)
              ? state.activePortfolioId
              : null,
            activeAnalysis: portfolios.some((item) => item.id === state.activePortfolioId)
              ? state.activeAnalysis
              : null,
            isLoading: false,
          }));
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to fetch portfolios",
          });
        }
      },

      createPortfolio: async (name: string) => {
        set({ isLoading: true, error: null });
        try {
          const userId = useUserStore.getState().currentUser?.id || null;
          const created = await PortfolioService.create({ name, assets: [], userId });
          if (!created) {
            set({ isLoading: false });
            return null;
          }

          const portfolio = normalizePortfolio({
            ...created,
            transactions: [],
          });

          set((state) => ({
            portfolios: [...state.portfolios, portfolio],
            activePortfolioId: portfolio.id,
            isLoading: false,
          }));
          return portfolio;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to create portfolio",
          });
          return null;
        }
      },

      deletePortfolio: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const success = await PortfolioService.delete(id);
          if (!success) {
            set({ isLoading: false });
            return false;
          }

          set((state) => ({
            portfolios: state.portfolios.filter((portfolio) => portfolio.id !== id),
            activePortfolioId: state.activePortfolioId === id ? null : state.activePortfolioId,
            activeAnalysis: state.activePortfolioId === id ? null : state.activeAnalysis,
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to delete portfolio",
          });
          return false;
        }
      },

      renamePortfolio: async (id: string, name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          set({ error: "Sepet adi bos olamaz." });
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const updated = await PortfolioService.update(id, { name: trimmedName });
          if (!updated) {
            set({ isLoading: false, error: "Sepet adi guncellenemedi" });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((portfolio) => (portfolio.id === id ? normalized : portfolio)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to rename portfolio",
          });
          return false;
        }
      },

      setActivePortfolio: (id: string) => {
        set({ activePortfolioId: id || null, activeAnalysis: null });
      },

      updatePortfolioAssets: async (portfolioId: string, assets: PortfolioAsset[]) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await PortfolioService.update(portfolioId, { assets });
          if (!updated) {
            set({ isLoading: false });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((portfolio) => (portfolio.id === portfolioId ? normalized : portfolio)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to update portfolio",
          });
          return false;
        }
      },

      updateAssetSettings: async (portfolioId, symbol, updates) => {
        set({ isLoading: true, error: null });
        try {
          const portfolio = await ensurePortfolioInState(portfolioId, get().portfolios);
          if (!portfolio) {
            set({ isLoading: false, error: "Portfolio not found" });
            return false;
          }

          const nextAssets = portfolio.assets.map((asset) =>
            asset.symbol === symbol
              ? {
                  ...asset,
                  ...updates,
                }
              : asset
          );

          const updated = await PortfolioService.update(portfolioId, { assets: nextAssets });
          if (!updated) {
            set({ isLoading: false, error: "Portfolio ayarlari guncellenemedi" });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((item) => (item.id === portfolioId ? normalized : item)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to update asset settings",
          });
          return false;
        }
      },

      addAsset: async (portfolioId, asset) => {
        const success = await get().addTransaction(portfolioId, {
          symbol: asset.symbol,
          type: "buy",
          market: asset.market,
          quantity: asset.quantity || 0,
          price: asset.purchasePrice || 0,
          date: asset.purchaseDate || new Date().toISOString(),
          currency: asset.currency || "TRY",
          assetType: (asset.type || "stock") as PortfolioAssetType,
          assetName: asset.name,
          note: asset.note,
        });

        if (!success) {
          return false;
        }

        return get().updateAssetSettings(portfolioId, asset.symbol, {
          target_profile: DEFAULT_PORTFOLIO_TARGET_PROFILE as PortfolioTargetProfile,
          target_mode: "system" as PortfolioTargetMode,
          target_return_pct: getDefaultTargetReturnPct(DEFAULT_PORTFOLIO_TARGET_PROFILE),
        });
      },

      removeAsset: async (portfolioId, symbol) => {
        return get().deleteSymbolTransactions(portfolioId, symbol);
      },

      sellAsset: async (portfolioId, request) => {
        const portfolio = get().portfolios.find((item) => item.id === portfolioId);
        const currentAsset = portfolio?.assets.find((asset) => asset.symbol === request.symbol);

        return get().addTransaction(portfolioId, {
          symbol: request.symbol,
          type: "sell",
          market: currentAsset?.market,
          quantity: request.quantity,
          price: request.sell_price,
          date: request.sell_date,
          currency: currentAsset?.currency || "TRY",
          assetType: currentAsset?.type || "stock",
          assetName: currentAsset?.name,
        });
      },

      addTransaction: async (portfolioId, transaction) => {
        set({ isLoading: true, error: null });
        try {
          const portfolio = await ensurePortfolioInState(portfolioId, get().portfolios);
          if (!portfolio) {
            set({ isLoading: false, error: "Portfolio not found" });
            return false;
          }

          if (!get().portfolios.some((item) => item.id === portfolio.id)) {
            set((state) => ({
              portfolios: [...state.portfolios, portfolio],
            }));
          }

          const nextTransactions = upsertTransaction(
            portfolio.transactions || [],
            createTransactionInput(transaction)
          );
          const updated = await persistTransactionsForPortfolio(portfolio, nextTransactions);
          if (!updated) {
            set({ isLoading: false, error: "Portfolio kaydi guncellenemedi" });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((item) => (item.id === portfolioId ? normalized : item)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to save transaction",
          });
          return false;
        }
      },

      updateTransaction: async (portfolioId, transactionId, transaction) => {
        set({ isLoading: true, error: null });
        try {
          const portfolio = get().portfolios.find((item) => item.id === portfolioId);
          if (!portfolio) {
            set({ isLoading: false, error: "Portfolio not found" });
            return false;
          }

          const nextTransactions = upsertTransaction(
            portfolio.transactions || [],
            createTransactionInput({ ...transaction, id: transactionId })
          );
          const updated = await persistTransactionsForPortfolio(portfolio, nextTransactions);
          if (!updated) {
            set({ isLoading: false });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((item) => (item.id === portfolioId ? normalized : item)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to update transaction",
          });
          return false;
        }
      },

      deleteTransaction: async (portfolioId, transactionId) => {
        set({ isLoading: true, error: null });
        try {
          const portfolio = get().portfolios.find((item) => item.id === portfolioId);
          if (!portfolio) {
            set({ isLoading: false, error: "Portfolio not found" });
            return false;
          }

          const nextTransactions = deleteTransactionById(portfolio.transactions || [], transactionId);
          const updated = await persistTransactionsForPortfolio(portfolio, nextTransactions);
          if (!updated) {
            set({ isLoading: false });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((item) => (item.id === portfolioId ? normalized : item)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to delete transaction",
          });
          return false;
        }
      },

      deleteSymbolTransactions: async (portfolioId, symbol) => {
        set({ isLoading: true, error: null });
        try {
          const portfolio = get().portfolios.find((item) => item.id === portfolioId);
          if (!portfolio) {
            set({ isLoading: false, error: "Portfolio not found" });
            return false;
          }

          const nextTransactions = deleteTransactionsForSymbol(portfolio.transactions || [], symbol);
          const updated = await persistTransactionsForPortfolio(portfolio, nextTransactions);
          if (!updated) {
            set({ isLoading: false });
            return false;
          }

          const normalized = normalizePortfolio(updated);
          set((state) => ({
            portfolios: state.portfolios.map((item) => (item.id === portfolioId ? normalized : item)),
            isLoading: false,
          }));
          return true;
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to remove asset",
          });
          return false;
        }
      },

      runAnalysis: async (portfolioId?: string) => {
        const id = portfolioId || get().activePortfolioId;
        if (!id) return;

        const portfolio = get().portfolios.find((item) => item.id === id);
        if (!portfolio || !portfolio.assets.length) {
          set({ isAnalyzing: false, error: null });
          return;
        }

        set({ isAnalyzing: true, error: null });

        try {
          const analysis = await PortfolioService.analyze(id);
          if (!analysis) {
            set({ isAnalyzing: false });
            return;
          }

          set((state) => ({
            activeAnalysis: analysis,
            globalMetrics: {
              ...state.globalMetrics,
              totalValue: analysis.total_value,
              dailyChangePct: analysis.pnl_pct * 100,
            },
            isAnalyzing: false,
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Analysis failed";
          if (errorMessage.includes("empty") || errorMessage.includes("no valid")) {
            set({ isAnalyzing: false, error: null });
            return;
          }

          set({ isAnalyzing: false, error: errorMessage });
        }
      },

      updateGlobalMetrics: (metrics) => {
        set((state) => ({
          globalMetrics: { ...state.globalMetrics, ...metrics },
        }));
      },
      setPeriodChanges: (tf, changes) => {
        set((state) => ({
          periodChanges: { ...state.periodChanges, [tf]: changes },
        }));
      },
      setFetchingPeriodChanges: (fetching) => set({ isFetchingPeriodChanges: fetching }),
      clearError: () => set({ error: null }),
    }),
    {
      name: PORTFOLIO_STORAGE_KEY,
      partialize: (state) => ({
        portfolios: [],
        activePortfolioId: state.activePortfolioId,
        globalMetrics: {
          ...DEFAULT_METRICS,
          displayCurrency: state.globalMetrics.displayCurrency,
          selectedTimeframe: state.globalMetrics.selectedTimeframe,
        },
      }),
    }
  )
);

export const useActivePortfolio = () =>
  usePortfolioStore((state) => {
    if (!state.activePortfolioId) return null;
    return state.portfolios.find((portfolio) => portfolio.id === state.activePortfolioId) || null;
  });

export const usePortfolioAnalysis = () =>
  usePortfolioStore((state) => state.activeAnalysis);

export const usePortfolioGlobalMetrics = () =>
  usePortfolioStore((state) => state.globalMetrics);

export const usePortfolioLoading = () =>
  usePortfolioStore((state) => ({
    isLoading: state.isLoading,
    isAnalyzing: state.isAnalyzing,
  }));
