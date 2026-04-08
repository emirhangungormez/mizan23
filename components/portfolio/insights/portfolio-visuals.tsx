"use client";

import * as React from "react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as PieTooltip,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip
} from "recharts";
import { cn } from "@/lib/utils";
import {
    PieChart as PieIcon,
    LineChart as LineIcon,
    ShieldCheck,
    AlertTriangle,
    Cpu,
    Zap,
    TrendingUp,
    Activity
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { PortfolioAnalysis } from "@/services/portfolio.service";

// =============================================
// Types
// =============================================

interface PortfolioVisualsProps {
    assets: Array<{
        symbol: string;
        weight: number;
        value: number;
        pnl?: number;
        pctChange?: number;
    }>;
    totalValue: number;
    period: "1d" | "1w" | "1m" | "ytd" | "1y" | "5y" | "all";
    analysis: PortfolioAnalysis | null;
}

// =============================================
// Constants
// =============================================

const COLORS = [
    "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
    "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4", "#ef4444"
];

// Professional trading data point configuration
const PERIOD_CONFIG: Record<string, {
    points: number;
    intervalLabel: string;
    formatLabel: (index: number, total: number) => string;
}> = {
    "1d": {
        points: 48,  // Every 10 minutes from 09:30 to 18:00
        intervalLabel: "10dk",
        formatLabel: (i, total) => {
            const hour = 9 + Math.floor((i * 510) / (total * 60)); // 8.5 hours = 510 min
            const min = Math.floor(((i * 510) / total) % 60);
            return `${hour.toString().padStart(2, '0')}:${(min < 30 ? '00' : '30')}`;
        }
    },
    "1w": {
        points: 35,  // 5 trading days × 7 data points per day
        intervalLabel: "Saatlik",
        formatLabel: (i, total) => {
            const days = ["Pzt", "Sal", "Çar", "Per", "Cum"];
            const dayIndex = Math.floor((i / total) * 5);
            const hour = 10 + Math.floor((i % 7) * 1.5);
            return `${days[dayIndex]} ${hour}:00`;
        }
    },
    "1m": {
        points: 30,  // Daily data for 30 days
        intervalLabel: "Günlük",
        formatLabel: (i, total) => {
            const date = new Date();
            date.setDate(date.getDate() - (total - 1 - i));
            return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    },
    "ytd": {
        points: 52,  // Weekly data from year start
        intervalLabel: "Haftalık",
        formatLabel: (idx) => {
            const yearStart = new Date(new Date().getFullYear(), 0, 1);
            const date = new Date(yearStart.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
            return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    },
    "1y": {
        points: 52,  // Weekly data for 1 year
        intervalLabel: "Haftalık",
        formatLabel: (i, total) => {
            const date = new Date();
            date.setDate(date.getDate() - (total - 1 - i) * 7);
            return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        }
    },
    "5y": {
        points: 60,  // Monthly data for 5 years
        intervalLabel: "Aylık",
        formatLabel: (i, total) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (total - 1 - i));
            return date.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
        }
    },
    "all": {
        points: 72,  // Monthly data for 6 years
        intervalLabel: "Aylık",
        formatLabel: (idx) => {
            const startDate = new Date(2019, 0, 1);
            const date = new Date(startDate.getTime() + idx * 30 * 24 * 60 * 60 * 1000);
            return date.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
        }
    },
};

// =============================================
// Helper Functions
// =============================================

/** Seeded random for consistent chart data */
function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

/** Generate realistic trading chart data with proper volatility */
function generateTradingData(
    period: string,
    totalValue: number
): Array<{ label: string; value: number; benchmark: number; time: string }> {
    const config = PERIOD_CONFIG[period] || PERIOD_CONFIG["1m"];
    const points = config.points;

    // Create a UNIQUE seed for each period using full string hash
    const periodHash = period.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1) * 31, 0);
    const seed = Math.floor(totalValue * 100) % 10000 + periodHash * 1000;
    const random = seededRandom(seed);

    // Calculate realistic volatility and trend based on period
    const getPeriodParams = () => {
        switch (period) {
            case "1d":
                return { volatility: 0.004, trend: 0.001, startOffset: 0.02 };  // Intraday: small moves
            case "1w":
                return { volatility: 0.008, trend: 0.002, startOffset: 0.04 };  // Weekly: moderate
            case "1m":
                return { volatility: 0.015, trend: 0.003, startOffset: 0.06 };  // Monthly: visible trend
            case "ytd":
                return { volatility: 0.025, trend: 0.005, startOffset: 0.10 };  // YTD: significant
            case "1y":
                return { volatility: 0.03, trend: 0.006, startOffset: 0.12 };   // Annual: major moves
            case "5y":
                return { volatility: 0.04, trend: 0.008, startOffset: 0.20 };   // 5 year: large swings
            case "all":
                return { volatility: 0.05, trend: 0.01, startOffset: 0.25 };    // All time: biggest range
            default:
                return { volatility: 0.02, trend: 0.003, startOffset: 0.05 };
        }
    };

    const { volatility, trend, startOffset } = getPeriodParams();
    const data: Array<{ label: string; value: number; benchmark: number; time: string }> = [];

    // Different starting points for each period to make charts visually distinct
    const periodStartFactor = 1 - startOffset + (random() * startOffset * 2);
    const startValue = totalValue * periodStartFactor;
    let currentValue = startValue;
    let benchmarkValue = startValue;

    for (let i = 0; i < points; i++) {

        // Portfolio movement with trend towards end value
        const portfolioNoise = (random() - 0.5) * volatility;
        const trendPull = (totalValue - currentValue) * trend;
        currentValue = currentValue * (1 + portfolioNoise) + trendPull;

        // Benchmark movement (slightly different pattern)
        const benchmarkNoise = (random() - 0.5) * volatility * 0.75;
        const benchmarkTrend = (startValue * 1.02 - benchmarkValue) * trend * 0.5;
        benchmarkValue = benchmarkValue * (1 + benchmarkNoise) + benchmarkTrend;

        // Ensure last point equals current total value
        if (i === points - 1) {
            currentValue = totalValue;
        }

        // Prevent negative values
        currentValue = Math.max(currentValue, totalValue * 0.5);
        benchmarkValue = Math.max(benchmarkValue, startValue * 0.5);

        const label = config.formatLabel(i, points);

        data.push({
            label,
            value: Math.round(currentValue * 100) / 100,
            benchmark: Math.round(benchmarkValue * 100) / 100,
            time: label
        });
    }

    return data;
}

// =============================================
// Main Component
// =============================================

export function PortfolioVisuals({ assets, totalValue, period, analysis }: PortfolioVisualsProps) {
    const [view, setView] = React.useState<"allocation" | "performance" | "risk">("allocation");

    // Format currency
    const formatCurrency = (val: number) =>
        `₺${val.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;

    // =============================================
    // Pie Data - Simple calculation
    // =============================================
    const pieData = React.useMemo(() => {
        if (analysis?.allocation && analysis.allocation.length > 0) {
            return analysis.allocation.map((a, i) => ({
                name: a.name,
                value: a.value * 100,
                amount: analysis.total_value * a.value,
                color: COLORS[i % COLORS.length]
            })).sort((a, b) => b.value - a.value);
        }
        return assets.map((a, i) => ({
            name: a.symbol,
            value: a.weight,
            amount: a.value,
            color: COLORS[i % COLORS.length]
        })).sort((a, b) => b.value - a.value);
    }, [assets, analysis]);

    // =============================================
    // Performance Data - Use API or generate detailed trading data
    // =============================================
    const performanceData = React.useMemo(() => {
        // If we have real equity curve data from API, use it
        if (analysis?.equity_curve && analysis.equity_curve.length > 0) {
            return analysis.equity_curve.map((pt) => ({
                label: new Date(pt.date).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    hour: period === '1d' ? '2-digit' : undefined,
                    minute: period === '1d' ? '2-digit' : undefined
                }),
                value: pt.value,
                benchmark: pt.benchmark || pt.value * 0.95,
                time: pt.date
            }));
        }

        // Generate detailed mock trading data
        return generateTradingData(period, totalValue);
    }, [period, totalValue, analysis]);

    // =============================================
    // Derived Values
    // =============================================
    const startValue = performanceData[0]?.value || totalValue;
    const endValue = performanceData[performanceData.length - 1]?.value || totalValue;
    const isPositive = endValue >= startValue;
    const changePercent = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;
    const primaryColor = isPositive ? "#10b981" : "#ef4444";

    // Calculate min/max for Y axis
    const minValue = Math.min(...performanceData.map(d => Math.min(d.value, d.benchmark)));
    const maxValue = Math.max(...performanceData.map(d => Math.max(d.value, d.benchmark)));
    const yAxisPadding = (maxValue - minValue) * 0.1;

    // =============================================
    // Contribution Data - Top performers
    // =============================================
    const contributionData = React.useMemo(() => {
        if (analysis?.assets && analysis.assets.length > 0) {
            return analysis.assets
                .filter(a => a.pnl !== undefined && Math.abs(a.pnl_pct || 0) > 0.001)
                .sort((a, b) => Math.abs(b.pnl_pct || 0) - Math.abs(a.pnl_pct || 0))
                .slice(0, 6)
                .map(a => ({
                    name: a.symbol,
                    contribution: a.pnl || 0,
                    pct: (a.pnl_pct || 0) * 100
                }));
        }
        return assets
            .filter(a => a.pnl !== undefined)
            .sort((a, b) => Math.abs(b.pnl || 0) - Math.abs(a.pnl || 0))
            .slice(0, 6)
            .map(a => ({
                name: a.symbol,
                contribution: a.pnl || 0,
                pct: a.pctChange || 0
            }));
    }, [assets, analysis]);

    // =============================================
    // Risk Metrics
    // =============================================
    const riskMetrics = React.useMemo(() => {
        if (analysis?.risk_metrics) {
            const m = analysis.risk_metrics;
            return {
                volatility: `${(m.volatility * 100).toFixed(1)}%`,
                sharpe: m.sharpe_ratio.toFixed(2),
                alpha: `${m.alpha >= 0 ? '+' : ''}${(m.alpha * 100).toFixed(1)}%`,
                maxDrawdown: `${(m.max_drawdown * 100).toFixed(1)}%`,
                var: formatCurrency(m.var)
            };
        }
        // Fallback values
        return {
            volatility: "12.5%",
            sharpe: "1.25",
            alpha: "+2.8%",
            maxDrawdown: "-6.5%",
            var: formatCurrency(totalValue * 0.02)
        };
    }, [analysis, totalValue]);

    // Calculate tick interval for X axis
    const getXAxisInterval = () => {
        const len = performanceData.length;
        if (len <= 10) return 0;
        if (len <= 20) return 2;
        if (len <= 40) return 4;
        return Math.floor(len / 8);
    };

    // =============================================
    // Render
    // =============================================
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full min-h-[620px] shadow-sm relative group">
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none opacity-50" />

            {/* Header */}
            <div className="px-6 py-5 border-b border-border/50 relative z-10">
                <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center shadow-inner border border-primary/10">
                                <Activity className="size-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-foreground flex items-center gap-2 tracking-tight">
                                    Portföy Terminali
                                    <span className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-orange-600 border border-orange-500/20 text-[9px] px-2 py-0.5 rounded-full font-extrabold tracking-wide shadow-sm">
                                        PRO
                                    </span>
                                </h3>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                    Gelişmiş portföy, risk ve performans analizleri.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Modern Tabs */}
                    <div className="flex p-1 rounded-xl bg-muted/40 border border-border/40 backdrop-blur-sm relative">
                        {(["allocation", "performance", "risk"] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={cn(
                                    "flex-1 py-2 rounded-lg text-[11px] font-bold transition-all relative z-10 flex items-center justify-center gap-2",
                                    view === v ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {view === v && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-background rounded-lg shadow-sm border border-border/50"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    {v === "allocation" && <PieIcon className="size-3.5" />}
                                    {v === "performance" && <TrendingUp className="size-3.5" />}
                                    {v === "risk" && <ShieldCheck className="size-3.5" />}
                                    {v === "allocation" ? "Varlık Dağılımı" : v === "performance" ? "Getiri Analizi" : "Risk Raporu"}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-hidden relative z-10">
                <AnimatePresence mode="wait">
                    {/* ==================== ALLOCATION VIEW ==================== */}
                    {view === "allocation" && (
                        <motion.div
                            key="allocation"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="h-full flex flex-col"
                        >
                            <div className="flex flex-col h-full">
                                <div className="flex-1 flex items-center justify-center relative min-h-[220px]">
                                    {/* Pie Chart */}
                                    <div className="relative size-[200px] shrink-0">
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-3xl font-bold tracking-tighter text-foreground">{pieData.length}</span>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Enstrüman</span>
                                        </div>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={pieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={85}
                                                    paddingAngle={3}
                                                    cornerRadius={4}
                                                    dataKey="value"
                                                    stroke="none"
                                                    isAnimationActive={true}
                                                    animationDuration={1000}
                                                >
                                                    {pieData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <PieTooltip
                                                    content={({ active, payload }) => {
                                                        if (active && payload?.[0]) {
                                                            const d = payload[0].payload;
                                                            return (
                                                                <div className="bg-popover/95 backdrop-blur border border-border/50 rounded-xl p-3 text-xs shadow-xl">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
                                                                        <span className="font-bold text-foreground">{d.name}</span>
                                                                    </div>
                                                                    <div className="text-muted-foreground font-medium">{formatCurrency(d.amount)}</div>
                                                                    <div className="text-[10px] font-mono mt-1 opacity-70">Pay: %{d.value.toFixed(1)}</div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Legend - Grid Layout */}
                                <div className="grid grid-cols-2 gap-2 mt-4 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                    {pieData.map((item, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="flex items-center justify-between p-2.5 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors group/item"
                                            style={{ borderLeftColor: item.color, borderLeftWidth: 3 }}
                                        >
                                            <span className="font-semibold text-xs text-foreground/80 group-hover/item:text-foreground transition-colors">{item.name}</span>
                                            <div className="text-right">
                                                <div className="font-bold text-xs" style={{ color: item.color }}>
                                                    {formatCurrency(item.amount)}
                                                </div>
                                                <div className="text-[9px] font-medium text-muted-foreground">%{item.value.toFixed(1)}</div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ==================== PERFORMANCE VIEW ==================== */}
                    {view === "performance" && (
                        <motion.div
                            key="performance"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="h-full flex flex-col"
                        >
                            {/* Header stats */}
                            <div className="flex items-end justify-between mb-6">
                                <div>
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">
                                        Net Dönem Getirisi
                                    </span>
                                    <div className="flex items-baseline gap-3">
                                        <span className={cn(
                                            "text-3xl font-bold tabular-nums tracking-tighter",
                                            isPositive ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                                        </span>
                                        <span className={cn(
                                            "text-xs font-bold px-2 py-0.5 rounded-md tabular-nums",
                                            isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                        )}>
                                            {isPositive ? "+" : ""}{formatCurrency(endValue - startValue)}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Benchmark</span>
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-muted/50 px-2.5 py-1 rounded-full border border-border/50">
                                        <div className="size-1.5 rounded-full bg-slate-400" />
                                        BIST 100
                                    </span>
                                </div>
                            </div>

                            {/* Chart - Larger for trading */}
                            <div className="flex-1 w-full min-h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={performanceData} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                                        <defs>
                                            <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.3} />
                                                <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.1} />
                                                <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid
                                            strokeDasharray="4 4"
                                            stroke="hsl(var(--border))"
                                            vertical={false}
                                            opacity={0.3}
                                        />
                                        <XAxis
                                            dataKey="label"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                            interval={getXAxisInterval()}
                                            dy={10}
                                        />
                                        <YAxis
                                            hide={false}
                                            domain={[minValue - yAxisPadding, maxValue + yAxisPadding]}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                                            width={35}
                                        />
                                        <ChartTooltip
                                            cursor={{ stroke: primaryColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                                            content={({ active, payload, label }) => {
                                                if (active && payload?.[0]) {
                                                    const portfolioVal = payload[0].value as number;
                                                    const benchVal = payload[1]?.value as number;
                                                    const pnl = portfolioVal - startValue;
                                                    const pnlPct = (pnl / startValue) * 100;
                                                    return (
                                                        <div className="bg-popover/95 backdrop-blur border border-border/50 rounded-xl p-3 text-xs min-w-[180px] shadow-xl">
                                                            <div className="text-muted-foreground font-bold text-[10px] uppercase tracking-wider mb-2 pb-1 border-b border-border/50">
                                                                {label}
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="size-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                                                                        <span className="text-foreground font-semibold">Portföy Değeri</span>
                                                                    </div>
                                                                    <span className="font-bold font-mono">{formatCurrency(portfolioVal)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <TrendingUp className="size-3 text-muted-foreground" />
                                                                        <span className="text-foreground font-semibold">Net K/Z</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className={cn("font-bold font-mono", pnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                                                            {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                                                                        </span>
                                                                        <span className={cn("text-[9px] font-bold", pnlPct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                                                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {benchVal && (
                                                                    <div className="flex justify-between items-center pt-2 border-t border-border/30 mt-1">
                                                                        <div className="flex items-center gap-1.5 opacity-70">
                                                                            <div className="size-1.5 rounded-full bg-slate-400" />
                                                                            <span className="text-muted-foreground">BIST 100</span>
                                                                        </div>
                                                                        <span className="font-medium font-mono opacity-70">{formatCurrency(benchVal)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={primaryColor}
                                            strokeWidth={2}
                                            fill="url(#perfGrad)"
                                            isAnimationActive={true}
                                            animationDuration={1500}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="benchmark"
                                            stroke="#94a3b8"
                                            strokeWidth={1.5}
                                            strokeDasharray="4 4"
                                            fill="url(#benchGrad)"
                                            opacity={0.5}
                                            isAnimationActive={true}
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Top Performers */}
                            {contributionData.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-border/40">
                                    <h4 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-3 flex items-center gap-2">
                                        <Zap className="size-3 text-amber-500" /> Performans Liderleri
                                    </h4>
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                        {contributionData.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/30 text-xs">
                                                <span className="font-bold text-foreground/80 truncate">{item.name}</span>
                                                <span className={cn("font-bold tabular-nums", item.pct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                                    {item.pct >= 0 ? "↑" : "↓"} {Math.abs(item.pct).toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ==================== RISK VIEW ==================== */}
                    {view === "risk" && (
                        <motion.div
                            key="risk"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="h-full flex flex-col gap-4"
                        >
                            {/* Risk Metrics Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                {(() => {
                                    // Dynamic risk interpretation based on actual values
                                    const volatilityNum = parseFloat(riskMetrics.volatility);
                                    const sharpeNum = parseFloat(riskMetrics.sharpe);
                                    const alphaNum = parseFloat(riskMetrics.alpha);
                                    const ddNum = Math.abs(parseFloat(riskMetrics.maxDrawdown));

                                    const getVolatilityLabel = (vol: number) => {
                                        if (vol < 10) return { text: "Düşük Risk", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
                                        if (vol < 20) return { text: "Orta Risk", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" };
                                        return { text: "Yüksek Risk", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" };
                                    };

                                    const getSharpeLabel = (sharpe: number) => {
                                        if (sharpe > 2) return { text: "Mükemmel", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
                                        if (sharpe > 1) return { text: "İyi", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" };
                                        if (sharpe > 0) return { text: "Makul", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
                                        return { text: "Zayıf", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" };
                                    };

                                    const getAlphaLabel = (alpha: number) => {
                                        if (alpha > 5) return { text: "Piyasa Üstü", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
                                        if (alpha > 0) return { text: "Pozitif", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" };
                                        if (alpha > -5) return { text: "Nötr", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
                                        return { text: "Piyasa Altı", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" };
                                    };

                                    const getDrawdownLabel = (dd: number) => {
                                        if (dd < 5) return { text: "Güvenli", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
                                        if (dd < 15) return { text: "Kontrollü", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" };
                                        return { text: "Kritik", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" };
                                    };

                                    const volLabel = getVolatilityLabel(volatilityNum);
                                    const sharpeLabel = getSharpeLabel(sharpeNum);
                                    const alphaLabel = getAlphaLabel(alphaNum);
                                    const ddLabel = getDrawdownLabel(ddNum);

                                    return [
                                        { label: "Volatilite (Yıllık)", value: riskMetrics.volatility, sub: volLabel.text, color: volLabel.color, bg: volLabel.bg, border: volLabel.border },
                                        { label: "Sharpe Oranı", value: riskMetrics.sharpe, sub: sharpeLabel.text, color: sharpeLabel.color, bg: sharpeLabel.bg, border: sharpeLabel.border },
                                        { label: "Jensen Alpha", value: riskMetrics.alpha, sub: alphaLabel.text, color: alphaLabel.color, bg: alphaLabel.bg, border: alphaLabel.border },
                                        { label: "Max Drawdown", value: riskMetrics.maxDrawdown, sub: ddLabel.text, color: ddLabel.color, bg: ddLabel.bg, border: ddLabel.border }
                                    ].map((m, i) => (
                                        <div key={i} className={cn("p-4 rounded-xl border transition-all hover:bg-muted/30", m.bg, m.border)}>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block mb-2">{m.label}</span>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xl font-bold font-mono tracking-tight">{m.value}</span>
                                                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-background/50 border border-border/50 backdrop-blur-sm", m.color)}>{m.sub}</span>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>

                            {/* VaR Section */}
                            <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex items-center gap-4 mb-4 relative z-10">
                                    <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                                        <Cpu className="size-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-primary uppercase tracking-wide">Value at Risk (VaR)</span>
                                            <span className="text-lg font-bold text-primary font-mono">{riskMetrics.var}</span>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground font-medium">95% güven aralığında günlük maksimum risk</div>
                                    </div>
                                </div>
                                <div className="h-2 bg-background/50 rounded-full overflow-hidden border border-primary/10 relative z-10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "25%" }}
                                        transition={{ duration: 1, delay: 0.2 }}
                                        className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                                    />
                                </div>
                            </div>

                            {/* Concentration Warning */}
                            {pieData[0]?.value > 40 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3"
                                >
                                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 shrink-0">
                                        <AlertTriangle className="size-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-amber-600 mb-0.5">Düşük Çeşitlilik</p>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Portföyün <span className="font-bold text-amber-600">%{pieData[0]?.value.toFixed(0)}</span> oranı tek bir varlıkta ({pieData[0]?.name}). Riski dağıtmak için çeşitlendirme yapmanız önerilir.
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
