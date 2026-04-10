"use client";

import * as React from "react";
import {
    Activity,
    Globe,
    Users,
    Percent,
    ArrowUpRight,
    ArrowDownRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchMacroIndicators, fetchBenchmarks } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

interface MacroDataProps {
    period?: 'daily' | 'weekly' | 'monthly' | 'ytd' | 'yearly' | 'five_years' | 'all';
    startDate?: string | null;
}

// Benchmark data structure
interface BenchmarkData {
    inflation: number;
    gold: number;
    bist100: number;
    interest_rate: number;
}

// Default fallback values for instant display
const DEFAULT_BENCHMARKS: Record<string, BenchmarkData> = {
    'daily': { inflation: 0.08, gold: 0.45, bist100: -0.32, interest_rate: 0.10 },
    'weekly': { inflation: 0.56, gold: 2.1, bist100: 1.8, interest_rate: 0.73 },
    'monthly': { inflation: 2.4, gold: 4.8, bist100: 6.2, interest_rate: 3.17 },
    'ytd': { inflation: 0.1, gold: 0.5, bist100: 0.2, interest_rate: 0.2 },
    'yearly': { inflation: 32.5, gold: 38.2, bist100: 28.4, interest_rate: 38.0 },
    'five_years': { inflation: 150.5, gold: 280.2, bist100: 450.4, interest_rate: 120.0 },
    'all': { inflation: 32.5, gold: 38.2, bist100: 28.4, interest_rate: 38.0 }
};

// Macro indicator data from API
interface MacroIndicatorData {
    tr: {
        inflation: { yearly: number; monthly?: number };
        policy_rate: { value: number };
        unemployment: { value: number };
        gdp_growth?: { value: number };
    };
    us: {
        inflation: { yearly: number };
        fed_rate: { value: number };
        unemployment: { value: number };
    };
    error?: string;
    using_fallback?: boolean;
}

const DEFAULT_MACRO_DATA: MacroIndicatorData = {
    tr: {
        inflation: { yearly: 32.5, monthly: 2.4 },
        policy_rate: { value: 37.0 },
        unemployment: { value: 8.6 },
        gdp_growth: { value: 4.5 },
    },
    us: {
        inflation: { yearly: 2.4 },
        fed_rate: { value: 4.5 },
        unemployment: { value: 4.2 },
    },
    using_fallback: true,
};

// MacroCard component props
interface MacroCardProps {
    title: string;
    value: number;
    secondaryValue?: number;
    secondaryLabel?: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    trendValue?: number;
    trendDirection?: 'up' | 'down';
    periodLabel?: string;
}

// MacroCard component - moved outside to prevent "cannot create components during render" error
function MacroCard({
    title,
    value,
    secondaryValue,
    secondaryLabel,
    icon: Icon,
    colorClass,
    trendValue,
    trendDirection,
    periodLabel,
    footer
}: MacroCardProps & { footer?: string }) {
    return (
        <div className="bg-card border rounded-xl p-4 flex flex-col justify-between group h-full min-h-[7rem]">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{title}</span>
                <Icon className={cn("size-4", colorClass)} />
            </div>

            <div>
                <span className="text-2xl font-medium">%{value.toFixed(1)}</span>

                <div className="flex items-center gap-2 mt-1">
                    {trendValue ? (
                        <div className={cn(
                            "flex items-center gap-0.5 text-sm font-medium",
                            trendDirection === 'down' ? "text-green-600" : "text-red-500"
                        )}>
                            {trendDirection === 'up' ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                            <span>%{trendValue.toFixed(1)}</span>
                        </div>
                    ) : (
                        <span className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-wider">
                            {periodLabel || 'GÜNCEL'}
                        </span>
                    )}

                    {secondaryValue !== undefined && (
                        <div className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground font-medium">
                            {secondaryLabel}: %{secondaryValue.toFixed(1)}
                        </div>
                    )}
                </div>
                {footer && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] font-medium text-primary">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export function MacroData({ period = 'all', startDate }: MacroDataProps) {
    const [data, setData] = React.useState<MacroIndicatorData | null>(null);
    // Initialize with default values for instant display (SWR: Stale-While-Revalidate)
    const [benchmarkCache, setBenchmarkCache] = React.useState<Record<string, BenchmarkData>>(DEFAULT_BENCHMARKS);
    const [initialLoadDone, setInitialLoadDone] = React.useState(false);

    // Current benchmark from cache - always available, no loading state needed
    const benchmarks = benchmarkCache[period] || DEFAULT_BENCHMARKS[period];

    // Fetch macro indicators (base data) - only on mount
    React.useEffect(() => {
        async function loadData() {
            try {
                const res = await fetchMacroIndicators();
                setData(res?.tr ? res : DEFAULT_MACRO_DATA);
                setInitialLoadDone(true);
            } catch (e) {
                console.error("Macro data load failed:", e);
                setData(DEFAULT_MACRO_DATA);
                setInitialLoadDone(true); // Mark as done even on error to show defaults
            }
        }
        loadData();
    }, []);

    React.useEffect(() => {
        const periods = ['daily', 'weekly', 'monthly', 'ytd', 'yearly', 'five_years', 'all'];

        // Fetch all periods in background without blocking UI
        periods.forEach(async (p) => {
            try {
                const res = await fetchBenchmarks(p);
                // Normalize response shape so downstream code always finds numeric fields
                setBenchmarkCache(prev => ({
                    ...prev,
                    [p]: {
                        inflation: (res as any)?.inflation ?? (res as any)?.inflation_rate ?? 0,
                        gold: (res as any)?.gold ?? (res as any)?.xau ?? 0,
                        bist100: (res as any)?.bist100 ?? (res as any)?.bist ?? 0,
                        interest_rate: (res as any)?.interest_rate ?? (res as any)?.policy_rate ?? 0,
                    }
                }));
            } catch (e) {
                console.warn(`Background fetch for ${p} failed:`, e);
                // Keep default values on error
            }
        });
    }, [startDate]);

    // When period or startDate changes, refresh that specific period in background (no loading state)
    React.useEffect(() => {
        async function refreshBenchmarks() {
            try {
                const res = await fetchBenchmarks(period, startDate || undefined);
                setBenchmarkCache(prev => ({
                    ...prev,
                    [period]: {
                        inflation: (res as any)?.inflation ?? (res as any)?.inflation_rate ?? 0,
                        gold: (res as any)?.gold ?? (res as any)?.xau ?? 0,
                        bist100: (res as any)?.bist100 ?? (res as any)?.bist ?? 0,
                        interest_rate: (res as any)?.interest_rate ?? (res as any)?.policy_rate ?? 0,
                    }
                }));
            } catch (e) {
                console.warn("Background benchmark refresh failed:", e);
            }
        }
        refreshBenchmarks();
    }, [period, startDate]);

    // Calculate period-adjusted values
    const getPeriodInflation = () => {
        // Prefer benchmark value if available
        if (benchmarks?.inflation !== undefined) {
            return benchmarks.inflation;
        }

        if (!data?.tr?.inflation) return 0;

        // Fallback to base data
        const yearly = data.tr.inflation.yearly || 30;
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const ytdFactor = dayOfYear / 365;

        switch (period) {
            case 'daily': return yearly / 365;
            case 'weekly': return yearly / 52;
            case 'monthly': return data.tr.inflation.monthly || yearly / 12;
            case 'ytd': return yearly * ytdFactor;
            case 'yearly': return yearly;
            case 'five_years': return yearly * 5; // Cumulative roughly
            default: return yearly;
        }
    };

    const getPeriodRate = () => {
        if (!data?.tr?.policy_rate) return 0;
        const yearly = data.tr.policy_rate.value || 45;
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const ytdFactor = dayOfYear / 365;

        switch (period) {
            case 'daily': return yearly / 365;
            case 'weekly': return yearly / 52;
            case 'monthly': return yearly / 12;
            case 'ytd': return yearly * ytdFactor;
            case 'yearly': return yearly;
            case 'five_years': return yearly * 5;
            case 'all': return yearly;
            default: return yearly;
        }
    };

    const getPeriodLabel = () => {
        switch (period) {
            case 'daily': return 'GÜNLÜK';
            case 'weekly': return 'HAFTALIK';
            case 'monthly': return 'AYLIK';
            case 'all': return 'TOPLAM';
            default: return 'GÜNCEL';
        }
    };

    const periodLabel = getPeriodLabel();

    return (
        <div className="w-full h-full">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 w-full">
                {!initialLoadDone ? (
                    Array(4).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))
                ) : (data && data.tr) ? (
                    <>
                        {/* INFLATION - Period adjusted */}
                        <MacroCard
                            title="Enflasyon (TÜFE)"
                            value={getPeriodInflation()}
                            secondaryValue={data.us.inflation.yearly / (period === 'daily' ? 365 : period === 'weekly' ? 52 : period === 'monthly' ? 12 : 1)}
                            secondaryLabel="ABD"
                            icon={Activity}
                            colorClass="text-foreground/70"
                            periodLabel={periodLabel}
                        />

                        {/* INTEREST RATE - Period adjusted */}
                        <MacroCard
                            title="Politika Faizi"
                            value={getPeriodRate()}
                            secondaryValue={data.us.fed_rate.value / (period === 'daily' ? 365 : period === 'weekly' ? 52 : period === 'monthly' ? 12 : 1)}
                            secondaryLabel="FED"
                            icon={Percent}
                            colorClass="text-amber-500"
                            periodLabel={periodLabel}
                            footer="Sonraki: 22 Şub (TCMB)"
                        />

                        {/* UNEMPLOYMENT - Same for all periods */}
                        <MacroCard
                            title="İşsizlik Oranı"
                            value={data.tr.unemployment.value}
                            secondaryValue={data.us.unemployment.value}
                            secondaryLabel="ABD"
                            icon={Users}
                            colorClass="text-blue-500"
                            periodLabel="GÜNCEL"
                        />

                        {/* GDP GROWTH - Same for all periods */}
                        <MacroCard
                            title="GSYH Büyüme"
                            value={data.tr.gdp_growth?.value ?? 4.5}
                            secondaryValue={2.1}
                            secondaryLabel="ABD"
                            icon={Globe}
                            colorClass="text-indigo-500"
                            periodLabel="YILLIK"
                        />
                    </>
                ) : (
                    <div className="col-span-full h-full text-center p-8 text-muted-foreground italic text-sm border border-dashed rounded-lg flex items-center justify-center">
                        Makro veriler şu an yüklenemiyor.
                    </div>
                )}
            </div>
        </div>
    );
}
