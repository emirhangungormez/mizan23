import * as React from "react";
import { usePortfolioStore, type Timeframe, type PerformanceMetrics, type Portfolio, type PortfolioAsset } from "@/store/portfolio-store";
import { useDashboardStore } from "@/store/dashboard-store";
import { fetchBatchChanges, fetchBatchQuotes, type BatchQuoteResult } from "@/lib/api-client";
import type { MarketQuote } from "@/services/market.service";
import { MathUtils } from "@/lib/math-utils";

// Extended market data type with optional period returns
interface MarketDataItem extends MarketQuote {
    p1w?: number;
    p1m?: number;
    p1y?: number;
    p5y?: number;
    return_ytd?: number;
}

export function usePerformanceCalculator(specificPortfolios?: Portfolio[]) {
    const allPortfolios = usePortfolioStore(state => state.portfolios);
    const selectedTimeframe = usePortfolioStore(state => state.globalMetrics.selectedTimeframe);
    const displayCurrency = usePortfolioStore(state => state.globalMetrics.displayCurrency);
    const updateGlobalMetrics = usePortfolioStore(state => state.updateGlobalMetrics);

    // Live quotes for assets in the portfolio
    const [liveQuotes, setLiveQuotes] = React.useState<Record<string, BatchQuoteResult>>({});
    const [isFetchingQuotes, setIsFetchingQuotes] = React.useState(false);

    // Stable Portfolios Hook: Prevent re-renders when parent passes a new array [portfolio]
    const portfolios = React.useMemo(() => {
        return specificPortfolios || allPortfolios;
    }, [specificPortfolios, allPortfolios]);

    // Stable Symbols Hook: Specific dependency for fetching
    const portfolioSymbolsKey = React.useMemo(() => {
        const symbols = portfolios
            .flatMap((p) => p.assets.map((a) => (typeof a.symbol === "string" ? a.symbol.trim() : "")))
            .filter((symbol) => symbol.length > 0);
        return Array.from(new Set(symbols)).sort().join(",");
    }, [portfolios]);

    const dashboardData = useDashboardStore(state => state.dashboardData);
    
    // Global Cache from Store
    const globalPeriodCache = usePortfolioStore(state => state.periodChanges);
    const isFetchingChanges = usePortfolioStore(state => state.isFetchingPeriodChanges);
    const setIsFetchingChanges = usePortfolioStore(state => state.setFetchingPeriodChanges);
    const updatePeriodCache = usePortfolioStore(state => state.setPeriodChanges);

    // Get the changes for the CURRENTLY selected timeframe for internal metrics calculation
    const periodChanges = React.useMemo(() => {
        return globalPeriodCache[selectedTimeframe] || {};
    }, [globalPeriodCache, selectedTimeframe]);

    const isSelectedTimeframeReady = React.useMemo(() => {
        if (selectedTimeframe === '1D' || selectedTimeframe === 'ALL') return true;
        return Boolean(globalPeriodCache[selectedTimeframe]);
    }, [globalPeriodCache, selectedTimeframe]);

    // Standard Market Data Lookup
    const allMarketData = React.useMemo(() => {
        if (!dashboardData) return [];
        return [
            ...(dashboardData.indices || []),
            ...(dashboardData.us_markets || []),
            ...(dashboardData.commodities || []),
            ...(dashboardData.fx || []),
            ...(dashboardData.crypto || []),
            ...(dashboardData.stocks || []),
            ...(dashboardData.funds || [])
        ];
    }, [dashboardData]);

    // Base Currency (TRY) Conversion Rate - Priority: Live Quote > Dashboard > Fallback
    const usdRate = React.useMemo(() => {
        const liveUsd = liveQuotes['USD']?.last;
        if (liveUsd) return liveUsd;

        const usdItem = (dashboardData?.fx || []).find(f => f.symbol === 'USD' || f.symbol === 'USDTRY' || f.symbol === 'USDTRY=X');
        return usdItem?.last || 36.5; // Updated fallback for 2026
    }, [dashboardData, liveQuotes]);

    const normalizeToTRY = React.useCallback((val: number, currency?: string) => {
        if (!currency || currency === 'TRY' || currency === 'NONE') return val;
        if (currency === 'USD') return MathUtils.mul(val, usdRate);
        return val;
    }, [usdRate]);

    const convertToDisplay = React.useCallback((valInTRY: number) => {
        if (displayCurrency === 'TRY') return valInTRY;
        if (displayCurrency === 'USD') return MathUtils.div(valInTRY, usdRate);
        return valInTRY;
    }, [displayCurrency, usdRate]);

    const getDataItem = React.useCallback((symbol: string) => {
        const cleanSymbol = symbol.split('.')[0]; // Handle .IS, .US etc
        return allMarketData.find(m => m.symbol === symbol || m.symbol === cleanSymbol);
    }, [allMarketData]);

    // Currency Helper: Determine if an asset is USD or TRY based on multiple hints
    const getAssetCurrency = React.useCallback((asset: PortfolioAsset, live?: BatchQuoteResult, item?: MarketDataItem) => {
        if (live?.currency) return live.currency;
        if (item?.currency) return item.currency;
        if (asset.currency && asset.currency !== 'NONE') return asset.currency;

        const sym = asset.symbol?.toUpperCase() || "";
        if (sym.endsWith('TRY') || sym.endsWith('.IS') || sym === 'USD' || sym === 'EUR') return 'TRY';
        if (sym.includes('.') && !sym.endsWith('.IS')) return 'USD';
        if (asset.type === 'crypto') return 'USD'; // Default crypto to USD if not TRY-suffixed

        return 'TRY'; // Default fallback
    }, []);

    // Live Quotes Effect: Fetch current prices for all symbols in portfolios
    React.useEffect(() => {
        const fetchQuotes = async () => {
            const symbols = portfolioSymbolsKey.split(',').filter(s => s);

            // Always include USD for conversion rate stabilization
            const fetchSymbols = [...symbols];
            if (!fetchSymbols.includes('USD')) fetchSymbols.push('USD');

            setIsFetchingQuotes(true);
            try {
                const data = await fetchBatchQuotes(fetchSymbols);
                const quoteMap: Record<string, BatchQuoteResult> = {};
                data.results.forEach(r => {
                    quoteMap[r.symbol] = r;
                });
                setLiveQuotes(quoteMap);
            } catch (error) {
                console.error("[usePerformanceCalculator] Quote fetch error:", error);
            } finally {
                setIsFetchingQuotes(false);
            }
        };

        fetchQuotes();
        const interval = setInterval(fetchQuotes, 60000); // Daily updates every 1 min
        return () => clearInterval(interval);
    }, [portfolioSymbolsKey]);

    // Total Value Calculation (Converted to Display Currency)
    const totalValue = React.useMemo(() => {
        let totalTRY = 0;
        portfolios.forEach(p => {
            p.assets.forEach(asset => {
                const live = liveQuotes[asset.symbol];
                const item = getDataItem(asset.symbol);

                // Priority: Live Fetch > Dashboard Data > Asset Record Avg (Fallback)
                const currentPrice = live?.last || item?.last || asset.avg_price || asset.avgPrice || 0;
                const assetCurrency = getAssetCurrency(asset, live, item);

                const assetVal = MathUtils.mul(asset.quantity || 0, normalizeToTRY(currentPrice, assetCurrency));
                totalTRY = MathUtils.add(totalTRY, assetVal);
            });
        });
        return convertToDisplay(totalTRY);
    }, [portfolios, liveQuotes, normalizeToTRY, convertToDisplay, getDataItem, getAssetCurrency]);

    // ─── Track selectedTimeframe in a ref for use inside async callbacks ─────
    const selectedTimeframeRef = React.useRef(selectedTimeframe);
    React.useEffect(() => { selectedTimeframeRef.current = selectedTimeframe; }, [selectedTimeframe]);

    // ─── PARALLEL PREFETCH: Fetch ALL timeframes simultaneously on page load ──
    const prefetchRef = React.useRef<string>(""); // tracks last prefetched symbolKey

    const fetchSingleTimeframe = React.useCallback(async (tf: Timeframe, symbols: string[]) => {
        let apiPeriod = "1d";
        switch (tf) {
            case '1W': apiPeriod = '1w'; break;
            case '1M': apiPeriod = '1m'; break;
            case '1Y': apiPeriod = '1y'; break;
            case '5Y': apiPeriod = '5y'; break;
            case 'YTD': apiPeriod = 'ytd'; break;
            default: return;
        }

        try {
            const data = await fetchBatchChanges(symbols, apiPeriod);
            const changeMap: Record<string, number> = {};
            data.results.forEach(r => { changeMap[r.symbol] = r.change_percent; });
            updatePeriodCache(tf, changeMap);
        } catch (e) {
            console.error(`[fetch] ${tf} failed:`, e);
        }
    }, [updatePeriodCache]);

    React.useEffect(() => {
        const symbols = portfolioSymbolsKey.split(',').filter(Boolean);
        if (symbols.length === 0) return;
        if (prefetchRef.current === portfolioSymbolsKey) return;
        prefetchRef.current = portfolioSymbolsKey;

        const PERIODS: Timeframe[] = ['1W', '1M', 'YTD', '1Y', '5Y'];

        setIsFetchingChanges(true);
        Promise.allSettled(
            PERIODS.map(tf => fetchSingleTimeframe(tf, symbols))
        ).finally(() => setIsFetchingChanges(false));
    }, [portfolioSymbolsKey, fetchSingleTimeframe, setIsFetchingChanges]);

    // ─── Tab switch: read from cache or fallback fetch ──
    React.useEffect(() => {
        if (selectedTimeframe === '1D' || selectedTimeframe === 'ALL') return;

        const cached = globalPeriodCache[selectedTimeframe];
        if (!cached) {
            const symbols = portfolioSymbolsKey.split(',').filter(Boolean);
            if (symbols.length > 0) {
                setIsFetchingChanges(true);
                fetchSingleTimeframe(selectedTimeframe, symbols).finally(() => setIsFetchingChanges(false));
            }
        }
    }, [selectedTimeframe, portfolioSymbolsKey, fetchSingleTimeframe, globalPeriodCache, setIsFetchingChanges]);

    // Main Performance Calculation
    const metrics: PerformanceMetrics = React.useMemo(() => {
        let totalPeriodProfitTRY = 0;
        let hasMissingDates = false;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let startDate: Date | null = null;
        let label = "Bugünkü";

        switch (selectedTimeframe) {
            case '1D': startDate = new Date(now); label = "1G"; break;
            case '1W': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); label = "1H"; break;
            case '1M': {
                const d = new Date(now);
                d.setMonth(d.getMonth() - 1);
                startDate = d;
                label = "1A";
                break;
            }
            case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); label = "YTD"; break;
            case '1Y': {
                const d = new Date(now);
                d.setFullYear(d.getFullYear() - 1);
                startDate = d;
                label = "1Y";
                break;
            }
            case '5Y': {
                const d = new Date(now);
                d.setFullYear(d.getFullYear() - 5);
                startDate = d;
                label = "5Y";
                break;
            }
            case 'ALL': startDate = null; label = "HEPSİ"; break;
        }

        if (totalValue === 0) return { profit: 0, percent: 0, profitValue: 0, hasMissingDates: false, label };



        portfolios.forEach(p => {
            p.assets.forEach(asset => {
                if (!asset.purchase_date) {
                    hasMissingDates = true;
                }

                const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date(0);
                const live = liveQuotes[asset.symbol];
                const item = getDataItem(asset.symbol);

                if (!live && !item) return;

                const currentPrice = live?.last || item?.last || 0;
                const quantity = asset.quantity || 0;
                const avgPrice = asset.avg_price || asset.avgPrice || 0;
                const assetCurrency = getAssetCurrency(asset, live, item);

                // Current and Cost values in TRY (using MathUtils)
                const assetCurrentValueTRY = MathUtils.mul(quantity, normalizeToTRY(currentPrice, assetCurrency));
                const assetCostBasisTRY = MathUtils.mul(quantity, normalizeToTRY(avgPrice, assetCurrency));

                if (!startDate || purchaseDate >= startDate) {
                    // Bought DURING or after the period (or viewing ALL)
                    const profit = MathUtils.sub(assetCurrentValueTRY, assetCostBasisTRY);
                    totalPeriodProfitTRY = MathUtils.add(totalPeriodProfitTRY, profit);
                } else {
                    // Bought BEFORE the period
                    let periodChangePct = periodChanges[asset.symbol];

                    if (periodChangePct === undefined && isSelectedTimeframeReady) {
                        const daysSinceYearStart = Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)));
                        const dailyChange = live?.change_percent ?? item?.change_percent ?? 0;
                        switch (selectedTimeframe) {
                            case '1D': periodChangePct = dailyChange; break;
                            case '1W': periodChangePct = (item as MarketDataItem)?.p1w || dailyChange * 5; break;
                            case '1M': periodChangePct = (item as MarketDataItem)?.p1m || dailyChange * 20; break;
                            case 'YTD': periodChangePct = (item as MarketDataItem)?.return_ytd || ((item as MarketDataItem)?.p1m ? ((item as MarketDataItem).p1m! * (daysSinceYearStart / 30)) : (dailyChange * daysSinceYearStart)); break;
                            case '1Y': periodChangePct = (item as MarketDataItem)?.p1y || dailyChange * 250; break;
                            case '5Y': periodChangePct = (item as MarketDataItem)?.p5y || dailyChange * 1250; break;
                        }
                    }

                    if (periodChangePct === undefined) {
                        return;
                    }

                    // Estimated Start Value TRY: currentValue / (1 + (changePct / 100))
                    const changeFactor = MathUtils.add(1, MathUtils.div(periodChangePct, 100));
                    const estimatedStartValueTRY = MathUtils.div(assetCurrentValueTRY, changeFactor);
                    const profitSincePeriodStart = MathUtils.sub(assetCurrentValueTRY, estimatedStartValueTRY);

                    totalPeriodProfitTRY = MathUtils.add(totalPeriodProfitTRY, profitSincePeriodStart);
                }
            });
        });

        const profitDisplay = convertToDisplay(totalPeriodProfitTRY);
        const totalValueTRY = displayCurrency === 'TRY' ? totalValue : MathUtils.mul(totalValue, usdRate);
        const costBasisTRY = MathUtils.sub(totalValueTRY, totalPeriodProfitTRY);

        const percent = costBasisTRY > 0 ? MathUtils.mul(MathUtils.div(totalPeriodProfitTRY, costBasisTRY), 100) : 0;

        return {
            profit: profitDisplay,
            percent: MathUtils.round(percent, 2),
            profitValue: profitDisplay,
            hasMissingDates,
            label
        };
    }, [selectedTimeframe, portfolios, totalValue, displayCurrency, usdRate, periodChanges, getDataItem, convertToDisplay, normalizeToTRY, getAssetCurrency, liveQuotes, isSelectedTimeframeReady]);

    const setSelectedTimeframe = React.useCallback((tf: Timeframe) => {
        updateGlobalMetrics({ selectedTimeframe: tf });
    }, [updateGlobalMetrics]);

    const toggleCurrency = React.useCallback(() => {
        updateGlobalMetrics({ displayCurrency: displayCurrency === 'TRY' ? 'USD' : 'TRY' });
    }, [displayCurrency, updateGlobalMetrics]);

    return {
        metrics,
        selectedTimeframe,
        isSelectedTimeframeReady,
        setSelectedTimeframe,
        displayCurrency,
        toggleCurrency,
        isFetchingChanges,
        isFetchingQuotes,
        totalValue,
        usdRate,
        liveQuotes,
        periodChanges,
        normalizeToTRY,
        convertToDisplay,
        getDataItem,
        getAssetCurrency,
        currencySymbol: displayCurrency === 'USD' ? '$' : '₺',
        locale: displayCurrency === 'USD' ? 'en-US' : 'tr-TR'
    };
}
