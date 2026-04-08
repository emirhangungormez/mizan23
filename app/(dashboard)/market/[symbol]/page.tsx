"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
    fetchAssetDetails,
    fetchBistStockSnapshot,
    fetchIndexConstituents,
    type AssetDetails,
    type BistProprietarySnapshot,
    type IndexConstituent,
} from "@/lib/api-client";
import {
    RefreshCw,
    TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboard-store";
import { PriceChart } from "@/components/charts/price-chart";
import { StockTreemap } from "@/components/charts/stock-treemap";
import { FundamentalGrid } from "@/components/market/fundamental-grid";
import { Info, Building2, Star, Gauge, Sparkles, Waves, ShieldCheck } from "lucide-react";
import { CompanyFinancialsView } from "@/components/company/company-financials-view";
import { CompanyNavbar } from "@/components/company/company-navbar";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { FastInfoCard } from "@/components/company/fast-info-card";
import { SupertrendIndicator } from "@/components/company/supertrend-indicator";
import { TradingViewAdvancedChart } from "@/components/charts/tradingview-advanced-chart";
import { FavoriteListPicker } from "@/components/favorites/favorite-list-picker";

// Period configuration
const PERIODS = [
    { label: "Gün içi", val: "1d", key: "daily" },
    { label: "1 Hafta", val: "5d", key: "weekly" },
    { label: "1 Ay", val: "1mo", key: "monthly" },
    { label: "3 Ay", val: "3mo", key: "threeMonth" },
    { label: "6 Ay", val: "6mo", key: "sixMonth" },
    { label: "1 Yıl", val: "1y", key: "yearly" },
    { label: "5 Yıl", val: "5y", key: "fiveYear" },
    { label: "Tümü", val: "max", key: "max" },
];

// Stats Component
function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <span className="text-xs whitespace-nowrap">
            <span className="text-muted-foreground">{label}: </span>
            <span className={cn("font-mono font-medium", color)}>{value}</span>
        </span>
    );
}

// Period Button
function PeriodButton({
    label,
    returnPercent,
    isActive,
    onClick
}: {
    label: string;
    returnPercent?: number;
    isActive: boolean;
    onClick: () => void;
}) {
    const hasReturn = returnPercent !== undefined && returnPercent !== null;
    const isPositive = (returnPercent ?? 0) >= 0;
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center px-3 py-1.5 rounded transition-all min-w-[70px]",
                isActive
                    ? "bg-muted border border-border"
                    : "hover:bg-muted/50"
            )}
        >
            <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
            {hasReturn && (
                <span className={cn(
                    "text-xs font-bold font-mono",
                    isPositive ? "text-emerald-500" : "text-red-500"
                )}>
                    %{returnPercent?.toFixed(2)}
                </span>
            )}
        </button>
    );
}

type HistoryCandle = {
    Close?: number;
    close?: number;
    High?: number;
    high?: number;
    Low?: number;
    low?: number;
    Volume?: number;
    volume?: number;
};

type AssetDetailData = AssetDetails & {
    info?: Record<string, string | number | boolean | null | undefined>;
    history?: HistoryCandle[];
    returns?: Record<string, number>;
};

function pickNumber(...values: unknown[]) {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }
    return 0;
}

// Stock Table Row
function StockTableRow({ stock, index, onClick, currencySymbol, locale }: { stock: IndexConstituent; index: number; onClick?: () => void; currencySymbol: string; locale: string }) {
    const change = stock.change ?? 0;
    const isPositive = change >= 0;
    const price = stock.price ?? 0;
    const volume = stock.volume ?? 0;
    const weight = stock.weight ?? 0;
    const impact = stock.impact ?? (change * weight / 100);
    const impactPositive = impact >= 0;

    return (
        <tr
            onClick={onClick}
            className={cn(
                "border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer",
                index % 2 === 0 ? "bg-transparent" : "bg-muted/5"
            )}
        >
            <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "size-6 rounded flex items-center justify-center text-[9px] font-bold text-white",
                        isPositive ? "bg-emerald-600" : change < 0 ? "bg-red-600" : "bg-neutral-500"
                    )}>
                        {stock.symbol?.substring(0, 2) || "??"}
                    </div>
                    <span className="font-semibold text-sm">{stock.symbol}</span>
                </div>
            </td>
            <td className="py-2.5 px-3 font-mono text-sm">
                <span className="text-emerald-500">{currencySymbol}</span>
                {price.toLocaleString(locale, { minimumFractionDigits: 2 })}
            </td>
            <td className={cn("py-2.5 px-3 font-mono text-sm font-medium", isPositive ? "text-emerald-500" : "text-red-500")}>
                %{change.toFixed(2)}
            </td>
            <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">
                <span className="text-emerald-500">{currencySymbol}</span>
                {(volume / 1000000).toFixed(2)} mr
            </td>
            <td className="py-2.5 px-3 font-mono text-sm">%{weight.toFixed(2)}</td>
            <td className={cn("py-2.5 px-3 font-mono text-sm font-medium", impactPositive ? "text-emerald-500" : "text-red-500")}>
                {impact >= 0 ? "+" : ""}{impact.toFixed(2)}
            </td>
        </tr>
    );
}

function ProprietaryMetricCard({
    title,
    score,
    description,
    icon: Icon,
}: {
    title: string;
    score: number;
    description: string;
    icon: React.ElementType;
}) {
    return (
        <div className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
                    <p className={cn(
                        "mt-2 text-3xl font-bold tracking-tight",
                        score >= 75 ? "text-emerald-600" : score >= 55 ? "text-amber-600" : "text-slate-700"
                    )}>
                        {Math.round(score)}
                    </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                    <Icon className="size-4" />
                </div>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(
                        "h-full rounded-full transition-all",
                        score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-amber-500" : "bg-slate-400"
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
    );
}

function formatSignedPercent(value?: number | null) {
    if (value === undefined || value === null || Number.isNaN(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}%${value.toFixed(2)}`;
}

function getSignalTone(score?: number) {
    if ((score ?? 0) >= 80) return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    if ((score ?? 0) >= 62) return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    return "text-slate-600 bg-slate-500/10 border-slate-500/20";
}

// Helper to determine asset type
function getAssetType(symbol: string): "STOCK" | "INDEX" | "FOREX" | "CRYPTO" | "FUND" {
    // Indices (BIST and Global)
    if (symbol.startsWith("XU") || symbol.startsWith("XB") || symbol.startsWith("^") || ["XUTUM", "XUSIN", "XHOLD", "XUTEK", "XGIDA", "XTRZM", "XULAS"].includes(symbol)) {
        return "INDEX";
    }
    // Crypto
    if (symbol.endsWith("-USD") || symbol.includes("BTC") || symbol.includes("ETH")) {
        return "CRYPTO";
    }
    // Forex / Commodities (Gold/Silver often resemble pairs or futures)
    if (symbol.includes("USD") || symbol.includes("EUR") || symbol === "GC=F" || symbol === "SI=F" || symbol.includes("=X")) {
        return "FOREX";
    }
    // Funds (Placeholder logic, TEFAS codes usually 3 chars and not BIST logic might be tricky, assuming explicit for now if needed later)
    // For now default to STOCK for everything else
    return "STOCK";
}

function getFavoriteMarket(assetType: "STOCK" | "INDEX" | "FOREX" | "CRYPTO" | "FUND"): "bist" | "us" | "crypto" | "commodities" | "funds" | "fx" {
    if (assetType === "CRYPTO") return "crypto";
    if (assetType === "FOREX") return "fx";
    if (assetType === "FUND") return "funds";
    return "bist";
}

export default function AssetDetailPage() {
    const params = useParams();
    const router = useRouter();
    const symbol = params.symbol as string;
    const assetType = getAssetType(symbol);
    const favoriteMarket = getFavoriteMarket(assetType);
    const assetCurrency = symbol.endsWith("-USD") || (symbol.includes(".") && !symbol.endsWith(".IS")) ? "USD" : "TRY";
    const currencySymbol = assetCurrency === "USD" ? "$" : "₺";
    const locale = assetCurrency === "USD" ? "en-US" : "tr-TR";

    const { refreshTrigger } = useDashboardStore();
    const [data, setData] = React.useState<AssetDetailData | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [period, setPeriod] = React.useState("1mo");
    const [periodReturns, setPeriodReturns] = React.useState<Record<string, number>>({});
    const [constituents, setConstituents] = React.useState<IndexConstituent[]>([]);
    const [loadingConstituents, setLoadingConstituents] = React.useState(false);
    const [proprietarySnapshot, setProprietarySnapshot] = React.useState<BistProprietarySnapshot | null>(null);
    const [activeSection, setActiveSection] = React.useState("overview");
    const [chartSurface, setChartSurface] = React.useState<"tradingview" | "native">("tradingview");
    const [chartType, setChartType] = React.useState<"line" | "candle" | "ha">("line");

    // Fetch index constituents
    React.useEffect(() => {
        const fetchConstituents = async () => {
            if (assetType !== "INDEX") return;

            setLoadingConstituents(true);
            try {
                const result = await fetchIndexConstituents(symbol);
                if (result?.constituents) {
                    setConstituents(result.constituents);
                }
            } catch (err) {
                console.error("[Constituents] Error:", err);
            } finally {
                setLoadingConstituents(false);
            }
        };

        fetchConstituents();
    }, [symbol, refreshTrigger, assetType]);

    // Auto-refresh every 15 minutes
    React.useEffect(() => {
        if (assetType !== "INDEX") return;

        const interval = setInterval(() => {
            console.log("[AutoRefresh] Refreshing constituents...");
            fetchIndexConstituents(symbol).then(result => {
                if (result?.constituents) {
                    setConstituents(result.constituents);
                }
            }).catch(console.error);
        }, 15 * 60 * 1000); // 15 minutes

        return () => clearInterval(interval);
    }, [symbol, assetType]);

    // Sorting state for table
    const [sortBy] = React.useState<"change" | "weight" | "volume" | "impact">("change");
    const [sortOrder] = React.useState<"asc" | "desc">("desc");

    const safeConstituents = React.useMemo(() => (Array.isArray(constituents) ? constituents : []), [constituents]);

    // Treemap data sorted by absolute change (biggest movers first)
    const treemapData = React.useMemo(() =>
        [...safeConstituents]
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .map(s => ({
                symbol: s.symbol,
                name: s.name,
                weight: s.weight,
                change: s.change
            })), [safeConstituents]);

    // Sorted constituents for table
    const sortedConstituents = React.useMemo(() => {
        return [...safeConstituents].sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            if (sortOrder === "desc") {
                return bVal - aVal;
            }
            return aVal - bVal;
        });
    }, [safeConstituents, sortBy, sortOrder]);

    // Calculate return from history data
    const calculateReturn = (history: HistoryCandle[]) => {
        if (!Array.isArray(history) || history.length < 2) return 0;
        const firstClose = history[0]?.Close ?? history[0]?.close ?? 0;
        const lastClose = history[history.length - 1]?.Close ?? history[history.length - 1]?.close ?? 0;
        if (firstClose === 0) return 0;
        return ((lastClose - firstClose) / firstClose) * 100;
    };

    // Calculate stats based on history (Chart Data) - MOVED UP due to Hooks Rules
    const { info, history } = data || {};

    // Price data with defaults
    const currentPrice = pickNumber(info?.last, info?.currentPrice, info?.regularMarketPrice);
    const previousClose = pickNumber(info?.close, info?.previousClose, info?.regularMarketPreviousClose);
    const changePercent = pickNumber(info?.change_percent);
    const assetDisplayName =
        (typeof info?.longName === "string" && info.longName)
        || (typeof info?.name === "string" && info.name)
        || symbol;

    const stats = React.useMemo(() => {
        if (!history || !Array.isArray(history) || history.length === 0) {
            return {
                high: pickNumber(info?.dayHigh, info?.regularMarketDayHigh, info?.high),
                low: pickNumber(info?.dayLow, info?.regularMarketDayLow, info?.low),
                volume: pickNumber(info?.volume, info?.regularMarketVolume)
            };
        }

        let maxH = -Infinity;
        let minL = Infinity;
        let totalVol = 0;

        history.forEach((candle: HistoryCandle) => {
            const h = candle.High ?? candle.high ?? -Infinity;
            const l = candle.Low ?? candle.low ?? Infinity;
            const v = candle.Volume ?? candle.volume ?? 0;

            if (h > maxH) maxH = h;
            if (l < minL) minL = l;
            totalVol += v;
        });

        return {
            high: maxH !== -Infinity ? maxH : 0,
            low: minL !== Infinity ? minL : 0,
            volume: totalVol
        };
    }, [history, info]);

    // BIST Limits (Theoretical +/- 10%)
    const ceilingPrice = assetType === "STOCK" && previousClose ? previousClose * 1.10 : null;
    const floorPrice = assetType === "STOCK" && previousClose ? previousClose * 0.90 : null;

    const fetchData = React.useCallback(async (targetPeriod?: string) => {
        const p = targetPeriod || period;
        const cacheKey = `asset_detail_${symbol}_${p}`;
        setIsLoading(true);
        setError(null);

        try {
            const [detailsResult, bistSnapshotResult] = await Promise.allSettled([
                fetchAssetDetails(symbol, p) as Promise<AssetDetailData>,
                assetType === "STOCK" ? fetchBistStockSnapshot(symbol) : Promise.resolve(null),
            ]);
            if (detailsResult.status !== "fulfilled") {
                throw detailsResult.reason;
            }

            const details = detailsResult.value;
            const bistSnapshot = bistSnapshotResult.status === "fulfilled" ? bistSnapshotResult.value : null;

            setData(details);
            setProprietarySnapshot(bistSnapshot);

            if (bistSnapshotResult.status === "rejected") {
                console.warn("[BIST Snapshot] Optional snapshot fetch failed:", bistSnapshotResult.reason);
            }

            // Cache successful response
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    data: details
                }));
            } catch (e) {
                console.warn("Cache save failed", e);
            }

            // Calculate and store return for this period
            if (details?.returns) {
                setPeriodReturns(prev => ({ ...prev, ...details.returns }));
            } else if (details?.history) {
                const periodKey = PERIODS.find(per => per.val === p)?.key || p;
                const returnVal = calculateReturn(details.history);
                setPeriodReturns(prev => ({ ...prev, [periodKey]: returnVal }));
            }
        } catch (err: unknown) {
            console.error("Error fetching asset details:", err);

            // Try to load from cache on failure
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Optional: Check if cache is too old (e.g. > 24 hours)? 
                    // For now, let's just use it to keep system "running"
                    setData(parsed.data);
                    setProprietarySnapshot(null);
                    // Recalculate returns from cached data
                    if (parsed.data?.returns) {
                        setPeriodReturns(prev => ({ ...prev, ...parsed.data.returns }));
                    }
                    // Show valid data but maybe indicate offline status via toast (not blocking UI)
                    // We don't have toast imported here yet, let's just log or set a soft error state?
                    // Setting error=null allows the UI to render the cached data.
                    setError(null);
                    return;
                }
            } catch (e) {
                console.error("Cache load failed", e);
            }

            setError(err instanceof Error ? err.message : "Veri yuklenirken bir hata olustu");
        } finally {
            setIsLoading(false);
        }
    }, [assetType, period, symbol]);

    // Fetch Data on mount or refresh
    React.useEffect(() => {
        fetchData();
    }, [symbol, refreshTrigger, fetchData]);

    const handlePeriodChange = (newPeriod: string) => {
        setPeriod(newPeriod);
        fetchData(newPeriod);
    };

    // Loading skeleton
    if (isLoading && !data) {
        return (
            <div className="w-full h-full p-4 space-y-4">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-8 w-2/3 rounded-lg" />
                <Skeleton className="h-[400px] w-full rounded-lg" />
                <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
        );
    }

    // Error state
    if (error && !data) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <TrendingDown className="size-8" />
                </div>
                <div>
                    <h2 className="text-lg font-bold">Veri Bağlantı Hatası</h2>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">{error}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.back()}>Geri Dön</Button>
                    <Button size="sm" onClick={() => fetchData()}>Tekrar Dene</Button>
                </div>
            </div>
        );
    }

    const primarySignal = proprietarySnapshot?.signals?.firsatlar;
    const tradeSignal = proprietarySnapshot?.signals?.trade;
    const longSignal = proprietarySnapshot?.signals?.uzun_vade;
    const hakikiAlfa = proprietarySnapshot?.hakiki_alfa;
    const fairValuePrice = proprietarySnapshot?.adil_deger?.fair_value_price ?? null;
    const fairValueGapPct = fairValuePrice && currentPrice ? ((fairValuePrice - currentPrice) / currentPrice) * 100 : null;
    const currentActionReason = primarySignal?.thesis ?? String(proprietarySnapshot?.portfolio_action_reason ?? "Motor notu hazırlanıyor.");

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-background">
            {/* COMPANY HEADER (Fintables Style) */}
            <div className="border-b bg-card shrink-0">
                <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between px-4 py-4 lg:px-6">
                    <div className="flex items-center gap-4">
                        <div className="size-12 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                            {symbol.substring(0, 2)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight">{symbol}</h1>
                                <FavoriteListPicker
                                    symbol={symbol}
                                    name={assetDisplayName}
                                    market={favoriteMarket}
                                    size="icon"
                                />
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">{assetDisplayName}</p>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="flex items-baseline justify-end gap-3">
                            <div className="flex flex-col items-end mr-4">
                                <span className="text-[10px] text-muted-foreground uppercase">Taban / Tavan</span>
                                <div className="flex gap-2 font-mono text-xs">
                                    <span className="text-red-500">{floorPrice ? floorPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                                    <span className="text-muted-foreground">/</span>
                                    <span className="text-emerald-500">{ceilingPrice ? ceilingPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                                </div>
                            </div>

                            <span className="text-sm text-muted-foreground font-medium">G</span>
                            <span className="text-3xl font-bold font-mono">
                                {currentPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={cn(
                                "text-lg font-bold font-mono",
                                (changePercent >= 0) ? "text-emerald-500" : "text-red-500"
                            )}>
                                %{Math.abs(changePercent).toFixed(2)}
                            </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}, {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto flex w-full max-w-[1760px] flex-1 overflow-hidden px-4 lg:px-6">
                {/* LEFT NAVIGATION - Only for STOCKS */}
                {assetType === "STOCK" && (
                    <div className="w-64 border-r bg-card/50 overflow-y-auto hidden md:block shrink-0">
                        <CompanyNavbar
                            activeSection={activeSection}
                            onSectionChange={(id) => setActiveSection(id)}
                        />
                    </div>
                )}

                {/* MAIN CONTENT AREA */}
                <div className="flex-1 overflow-y-auto">
                    {/* OVERVIEW CONTENT */}
                    {["overview", "chart", "score", "financials"].includes(activeSection) && (
                        <div className="h-full">
                            {/* Stats Bar */}
                            <div className="border-b bg-card/30 px-6 py-2.5 flex items-center gap-8 text-xs font-medium overflow-x-auto">
                                <StatItem label="Dönem Yüksek" value={stats.high.toLocaleString(locale, { minimumFractionDigits: 2 })} color="text-emerald-500" />
                                <StatItem label="Dönem Düşük" value={stats.low.toLocaleString(locale, { minimumFractionDigits: 2 })} color="text-red-500" />
                                <StatItem
                                    label="Dönem Hacim"
                                    value={stats.volume > 1e9
                                        ? `${currencySymbol}${(stats.volume / 1e9).toFixed(2)} Mr`
                                        : stats.volume > 1e6
                                            ? `${currencySymbol}${(stats.volume / 1e6).toFixed(2)} Mn`
                                            : `${currencySymbol}${stats.volume.toLocaleString(locale)}`}
                                    color="text-foreground"
                                />
                                <StatItem label="Önceki Kapanış" value={previousClose.toLocaleString(locale, { minimumFractionDigits: 2 })} />
                            </div>

                            <div className="p-6 space-y-6">
                                {activeSection === "overview" && assetType === "STOCK" && (
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4 md:grid-cols-2">
                                        <div className="rounded-2xl border bg-card p-5 xl:col-span-2">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Ana Karar</p>
                                                    <h2 className="mt-2 text-2xl font-bold tracking-tight">{primarySignal?.action ?? "İzle"}</h2>
                                                </div>
                                                <span className={cn("inline-flex min-w-16 justify-center rounded-lg border px-3 py-1.5 text-sm font-bold", getSignalTone(primarySignal?.score))}>
                                                    {Math.round(primarySignal?.score ?? proprietarySnapshot?.firsat_skoru ?? 0)}
                                                </span>
                                            </div>
                                            <p className="mt-4 text-sm leading-6 text-muted-foreground">
                                                {currentActionReason}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border bg-card p-5">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Adil Değer</p>
                                            <div className="mt-2 text-2xl font-bold tracking-tight">
                                                {fairValuePrice
                                                    ? `${currencySymbol}${fairValuePrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                    : "-"}
                                            </div>
                                            <p className={cn(
                                                "mt-3 text-sm font-medium",
                                                (fairValueGapPct ?? 0) > 0 ? "text-emerald-600" : (fairValueGapPct ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground"
                                            )}>
                                                {fairValueGapPct == null ? "Değerleme hazırlanıyor" : `Fiyat farkı ${formatSignedPercent(fairValueGapPct)}`}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border bg-card p-5">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Hakiki Alfa</p>
                                            <div className={cn(
                                                "mt-2 text-2xl font-bold tracking-tight",
                                                (hakikiAlfa?.hakiki_alfa_pct ?? 0) > 0 ? "text-emerald-600" : (hakikiAlfa?.hakiki_alfa_pct ?? 0) < 0 ? "text-rose-600" : "text-foreground"
                                            )}>
                                                {formatSignedPercent(hakikiAlfa?.hakiki_alfa_pct)}
                                            </div>
                                            <p className="mt-3 text-sm text-muted-foreground">
                                                Rejim: <span className="font-medium text-foreground">{String(proprietarySnapshot?.regime_label ?? "balanced")}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {activeSection === "score" && assetType === "STOCK" && proprietarySnapshot && (
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                                            <div>
                                                <h2 className="text-lg font-bold tracking-tight">Proprietary Motor</h2>
                                            </div>
                                            {primarySignal && (
                                                <div className={cn("inline-flex w-fit items-center gap-3 rounded-xl border px-4 py-2", getSignalTone(primarySignal.score))}>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">Bugunun Karari</p>
                                                        <p className="text-sm font-semibold">{primarySignal.action}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">Skor</p>
                                                        <p className="text-lg font-bold">{Math.round(primarySignal.score ?? 0)}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 md:grid-cols-2">
                                            <ProprietaryMetricCard
                                                title="Hakiki Alfa"
                                                score={hakikiAlfa?.hakiki_alfa_score ?? 0}
                                                description={`Hissenin gunluk hareketi, global referans sepete gore ${formatSignedPercent(hakikiAlfa?.hakiki_alfa_pct)} fark uretiyor.`}
                                                icon={Sparkles}
                                            />
                                            <ProprietaryMetricCard
                                                title="Trend Skoru"
                                                score={proprietarySnapshot?.trend_score ?? 0}
                                                description="Fiyat akisi, teknik teyit ve trend konumu birlikte olculur."
                                                icon={Gauge}
                                            />
                                            <ProprietaryMetricCard
                                                title="Likidite Skoru"
                                                score={proprietarySnapshot?.liquidity_score ?? 0}
                                                description="Hacim, buyukluk ve yabanci ilgisiyle hareketin islenebilirligi olculur."
                                                icon={Waves}
                                            />
                                            <ProprietaryMetricCard
                                                title="Kalite Skoru"
                                                score={proprietarySnapshot?.quality_score ?? 0}
                                                description="Uzun trend yapisi, denge ve tasinabilir kalite izi kontrol edilir."
                                                icon={ShieldCheck}
                                            />
                                            <ProprietaryMetricCard
                                                title="KAP Etki"
                                                score={proprietarySnapshot?.kap_etki_skoru ?? proprietarySnapshot?.catalyst_score ?? 0}
                                                description="Son KAP ve takvim akisinin fiyatlayici gucu pozitif, notr veya riskli olarak okunur."
                                                icon={Info}
                                            />
                                            <ProprietaryMetricCard
                                                title="Sahiplik Kalitesi"
                                                score={proprietarySnapshot?.sahiplik_kalitesi_skoru ?? proprietarySnapshot?.ownership_score ?? 0}
                                                description="Halka aciklik, yabanci ilgisi, ETF izi ve temettu duzeni birlikte yorumlanir."
                                                icon={Building2}
                                            />
                                            <ProprietaryMetricCard
                                                title="Sektor Konumu"
                                                score={proprietarySnapshot?.sector_context_score ?? 0}
                                                description="Hissenin kendi sektorunde onde mi geride mi oldugu ve sektor momentumu birlikte olculur."
                                                icon={Star}
                                            />
                                            <ProprietaryMetricCard
                                                title="Temettu Motoru"
                                                score={proprietarySnapshot?.temettu_guven_skoru ?? 0}
                                                description={`Temettu guveni ${Math.round(proprietarySnapshot?.temettu_guven_skoru ?? 0)}/100, tuzak riski ${Math.round(proprietarySnapshot?.temettu_tuzagi_riski ?? 0)}/100 olarak okunur.`}
                                                icon={Info}
                                            />
                                            <ProprietaryMetricCard
                                                title="Portfoye Uygunluk"
                                                score={proprietarySnapshot?.portfolio_fit_score ?? 0}
                                                description={String(proprietarySnapshot?.portfolio_action_reason ?? "Bu hisse icin portfoy uygunluk yorumu hazirlaniyor.")}
                                                icon={Building2}
                                            />
                                            <ProprietaryMetricCard
                                                title="Makro Rejim Etkisi"
                                                score={proprietarySnapshot?.regime_label === "risk_on" ? 82 : proprietarySnapshot?.regime_label === "risk_off" ? 38 : proprietarySnapshot?.regime_label === "energy_stress" ? 30 : proprietarySnapshot?.regime_label === "inflation_pressure" ? 42 : proprietarySnapshot?.regime_label === "thin_liquidity" ? 36 : 58}
                                                description={`Aktif rejim: ${String(proprietarySnapshot?.regime_label ?? proprietarySnapshot?.global_reference?.macro_regime_label ?? "balanced")}. Bu etki firsat ve trade agirliklarini degistirir.`}
                                                icon={Waves}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                                            <div className="rounded-2xl border bg-card p-5">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Aksiyon Ozeti</p>
                                                        <h3 className="mt-2 text-xl font-bold tracking-tight">{primarySignal?.action ?? "Bekle"}</h3>
                                                    </div>
                                                    <span className={cn("inline-flex min-w-16 justify-center rounded-lg border px-3 py-1.5 text-sm font-bold", getSignalTone(primarySignal?.score))}>
                                                        {Math.round(primarySignal?.score ?? proprietarySnapshot?.firsat_skoru ?? 0)}
                                                    </span>
                                                </div>
                                                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                                    {primarySignal?.thesis ?? "Bu hisse icin proprietary motor notu hazirlaniyor."}
                                                </p>
                                                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                                                    <div className="rounded-xl bg-muted/40 p-3">
                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Firsat</p>
                                                        <p className="mt-1 text-lg font-bold">{Math.round(proprietarySnapshot?.firsat_skoru ?? 0)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-muted/40 p-3">
                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Trade</p>
                                                        <p className="mt-1 text-lg font-bold">{Math.round(proprietarySnapshot?.trade_skoru ?? 0)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-muted/40 p-3">
                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Uzun Vade</p>
                                                        <p className="mt-1 text-lg font-bold">{Math.round(proprietarySnapshot?.uzun_vade_skoru ?? 0)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-muted/40 p-3">
                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Radar</p>
                                                        <p className="mt-1 text-lg font-bold">{Math.round(proprietarySnapshot?.radar_skoru ?? 0)}</p>
                                                    </div>
                                                </div>
                                                <div className="mt-4 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                                                    Skor guveni: <span className="font-semibold text-foreground">{proprietarySnapshot?.data_quality?.score_confidence_label ?? "unknown"}</span>
                                                    {" "}({Math.round(proprietarySnapshot?.data_quality?.score_confidence ?? 0)}/100)
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border bg-card p-5">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Goreli Performans</p>
                                                <div className="mt-4 space-y-3 text-sm">
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Hisse Gunluk Getiri</span>
                                                        <span className="font-mono font-bold">{formatSignedPercent(hakikiAlfa?.daily_return_pct)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Global Alpha (Core)</span>
                                                        <span className="font-mono font-bold">{formatSignedPercent(hakikiAlfa?.global_reference_return_pct)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Hakiki Alfa</span>
                                                        <span className={cn(
                                                            "font-mono font-bold",
                                                            (hakikiAlfa?.hakiki_alfa_pct ?? 0) > 0 ? "text-emerald-600" : (hakikiAlfa?.hakiki_alfa_pct ?? 0) < 0 ? "text-rose-600" : "text-slate-600"
                                                        )}>
                                                            {formatSignedPercent(hakikiAlfa?.hakiki_alfa_pct)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Risk / Ufuk</span>
                                                        <span className="text-right font-medium">{primarySignal?.risk ?? "Normal"} / {primarySignal?.horizon ?? "Takip"}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Portfoy Karari</span>
                                                        <span className="text-right font-medium">{String(proprietarySnapshot?.portfolio_action ?? "Tut")}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                                                        <span className="text-muted-foreground">Temettu Motoru</span>
                                                        <span className="text-right font-medium">{Math.round(proprietarySnapshot?.temettu_guven_skoru ?? 0)}/100</span>
                                                    </div>
                                                </div>
                                                {(tradeSignal || longSignal) && (
                                                    <div className="mt-4 border-t pt-4 text-xs text-muted-foreground space-y-2">
                                                        {tradeSignal && <p>Trade modu: <span className="font-medium text-foreground">{tradeSignal.action}</span></p>}
                                                        {longSignal && <p>Uzun vade modu: <span className="font-medium text-foreground">{longSignal.action}</span></p>}
                                                        <p>
                                                            KAP etki: <span className="font-medium text-foreground">{Math.round(proprietarySnapshot?.kap_etki_skoru ?? proprietarySnapshot?.catalyst_score ?? 0)}/100</span>
                                                            {" "}• Sahiplik kalitesi: <span className="font-medium text-foreground">{Math.round(proprietarySnapshot?.sahiplik_kalitesi_skoru ?? proprietarySnapshot?.ownership_score ?? 0)}/100</span>
                                                        </p>
                                                        <p>
                                                            Sektor konumu: <span className="font-medium text-foreground">{Math.round(proprietarySnapshot?.sector_context_score ?? 0)}/100</span>
                                                            {proprietarySnapshot?.sector_momentum_label && (
                                                                <>
                                                                    {" "}• Momentum: <span className="font-medium text-foreground">{String(proprietarySnapshot?.sector_momentum_label)}</span>
                                                                </>
                                                            )}
                                                        </p>
                                                        {proprietarySnapshot?.public_float_pct && (
                                                            <p>
                                                                Halka aciklik: <span className="font-medium text-foreground">%{Number(proprietarySnapshot?.public_float_pct).toFixed(2)}</span>
                                                            </p>
                                                        )}
                                                        <p>
                                                            Portfoy uygunlugu: <span className="font-medium text-foreground">{Math.round(proprietarySnapshot?.portfolio_fit_score ?? 0)}/100</span>
                                                            {" "}• Temettu guveni: <span className="font-medium text-foreground">{Math.round(proprietarySnapshot?.temettu_guven_skoru ?? 0)}/100</span>
                                                        </p>
                                                        <p>
                                                            Rejim: <span className="font-medium text-foreground">{String(proprietarySnapshot?.regime_label ?? proprietarySnapshot?.global_reference?.macro_regime_label ?? "balanced")}</span>
                                                        </p>
                                                        <p>Global referans guveni: <span className="font-medium text-foreground">{proprietarySnapshot?.global_reference?.confidence_label ?? "unknown"}</span> ({Math.round(proprietarySnapshot?.global_reference?.confidence_score ?? 0)}/100)</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(assetType !== "STOCK" || activeSection === "chart") && (
                                <>
                                {/* Chart Header */}
                                <div className="rounded-2xl border bg-card p-4">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-lg font-bold">{symbol} Grafik Merkezi</h2>
                                                <div className="flex items-center gap-1 rounded-md bg-muted p-1">
                                                    <Button
                                                        variant={chartSurface === "tradingview" ? "secondary" : "ghost"}
                                                        size="xs"
                                                        className="h-7 text-[10px]"
                                                        onClick={() => setChartSurface("tradingview")}
                                                    >
                                                        TradingView
                                                    </Button>
                                                    <Button
                                                        variant={chartSurface === "native" ? "secondary" : "ghost"}
                                                        size="xs"
                                                        className="h-7 text-[10px]"
                                                        onClick={() => setChartSurface("native")}
                                                    >
                                                        Yerel Grafik
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="max-w-2xl text-sm text-muted-foreground">
                                                TradingView görünümü profesyonel takip için kullanılabilir. Yerel grafik görünümü ise
                                                hızlı ve uygulama içi okumaya uygun şekilde kalır.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm md:min-w-[360px]">
                                            <div className="rounded-xl border bg-background px-3 py-2.5">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Son fiyat</div>
                                                <div className="mt-1 font-mono font-semibold">
                                                    {currencySymbol}{currentPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border bg-background px-3 py-2.5">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dönem getirisi</div>
                                                <div className={cn("mt-1 font-mono font-semibold", changePercent >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                    {changePercent >= 0 ? "+" : ""}%{changePercent.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border bg-background px-3 py-2.5">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dönem zirve</div>
                                                <div className="mt-1 font-mono font-semibold">
                                                    {currencySymbol}{stats.high.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border bg-background px-3 py-2.5">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dönem dip</div>
                                                <div className="mt-1 font-mono font-semibold">
                                                    {currencySymbol}{stats.low.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-bold">{chartSurface === "tradingview" ? `${symbol} TradingView` : `${symbol} Yerel Grafik`}</h2>
                                        <div className={cn("flex items-center gap-1 bg-muted p-1 rounded-md", chartSurface !== "native" && "hidden")}>
                                            <Button
                                                variant={chartType === "line" ? "secondary" : "ghost"}
                                                size="xs"
                                                className="h-7 text-[10px]"
                                                onClick={() => setChartType("line")}
                                            >Çizgi</Button>
                                            <Button
                                                variant={chartType === "candle" ? "secondary" : "ghost"}
                                                size="xs"
                                                className="h-7 text-[10px]"
                                                onClick={() => setChartType("candle")}
                                            >Mum</Button>
                                            <Button
                                                variant={chartType === "ha" ? "secondary" : "ghost"}
                                                size="xs"
                                                className="h-7 text-[10px]"
                                                onClick={() => setChartType("ha")}
                                            >H. Ashi</Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg self-end md:self-auto">
                                        {PERIODS.map(p => (
                                            <PeriodButton
                                                key={p.val}
                                                label={p.label}
                                                returnPercent={periodReturns[p.key]}
                                                isActive={period === p.val}
                                                onClick={() => handlePeriodChange(p.val)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Price Chart */}
                                <div className="bg-card border rounded-xl p-4 overflow-hidden">
                                    {isLoading ? (
                                        <div className="h-[460px] flex items-center justify-center">
                                            <RefreshCw className="size-8 animate-spin text-primary/30" />
                                        </div>
                                    ) : chartSurface === "tradingview" ? (
                                        <TradingViewAdvancedChart
                                            symbol={symbol}
                                            assetType={assetType}
                                            period={period}
                                            height={460}
                                        />
                                    ) : chartType === "line" ? (
                                        <PriceChart
                                            data={history || []}
                                            height={460}
                                            showPrediction={false}
                                            currencySymbol={currencySymbol}
                                            locale={locale}
                                        />
                                    ) : (
                                        <CandlestickChart
                                            data={history || []}
                                            height={460}
                                            symbol={symbol}
                                            useHeikinAshi={chartType === "ha"}
                                        />
                                    )}
                                </div>
                                </>
                                )}

                                {/* Index Specific Content */}
                                {assetType === "INDEX" && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-bold">Endeks Bileşenleri</h2>
                                            <span className="text-sm text-muted-foreground">{constituents.length} hisse</span>
                                        </div>
                                        <div className="bg-card border rounded-xl overflow-hidden p-4">
                                            {loadingConstituents ? (
                                                <Skeleton className="h-[320px] w-full" />
                                            ) : (
                                                <StockTreemap
                                                    data={treemapData}
                                                    height={320}
                                                    onItemClick={(s) => router.push(`/market/${s}`)}
                                                />
                                            )}
                                        </div>

                                        <div className="border rounded-xl overflow-hidden bg-card">
                                            <table className="w-full">
                                                <thead className="bg-muted/30">
                                                    <tr className="text-xs text-muted-foreground border-b uppercase tracking-wider">
                                                        <th className="text-left py-3 px-4 font-bold">Şirket</th>
                                                        <th className="text-left py-3 px-4 font-bold">Son Fiyat</th>
                                                        <th className="text-left py-3 px-4 font-bold">%</th>
                                                        <th className="text-left py-3 px-4 font-bold">Hacim</th>
                                                        <th className="text-left py-3 px-4 font-bold">Ağırlık</th>
                                                        <th className="text-left py-3 px-4 font-bold">Etki</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedConstituents.map((stock, i) => (
                                                        <StockTableRow
                                                            key={stock.symbol}
                                                            stock={stock}
                                                            index={i}
                                                            currencySymbol={currencySymbol}
                                                            locale={locale}
                                                            onClick={() => router.push(`/market/${stock.symbol}`)}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Individual Stock/Forex Metrics (Fundamentals) */}
                                {(assetType === "STOCK" || assetType === "FOREX" || assetType === "CRYPTO") && (assetType !== "STOCK" || activeSection === "overview") && (
                                    <FundamentalGrid info={data?.info} className="h-full" />
                                )}

                                {/* Fast Info & Supertrend - ONLY FOR STOCKS */}
                                {assetType === "STOCK" && activeSection === "overview" && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <FastInfoCard symbol={symbol} />
                                        <SupertrendIndicator symbol={symbol} />
                                    </div>
                                )}

                                {/* Consolidated Company Report (Financials, Score, Info) - ONLY FOR STOCKS */}
                                {assetType === "STOCK" && activeSection === "financials" && (
                                    <div className="border-t pt-8">
                                        <CompanyFinancialsView
                                            symbol={symbol}
                                            currentPrice={currentPrice || undefined}
                                            valuationSnapshot={proprietarySnapshot?.adil_deger ?? null}
                                            valuationScore={proprietarySnapshot?.adil_deger_skoru ?? null}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Placeholder for other sections */}
                    {!["overview", "financials", "score", "chart"].includes(activeSection) && (
                        <div className="h-full flex items-center justify-center text-muted-foreground p-12 text-center">
                            <div>
                                <Building2 className="size-12 mx-auto mb-4 opacity-20" />
                                <h3 className="text-lg font-bold mb-1">{activeSection}</h3>
                                <p className="text-sm max-w-xs">Bu bölüm için veri entegrasyonu devam ediyor.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
