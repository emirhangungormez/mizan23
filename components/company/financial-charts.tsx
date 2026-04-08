"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    CartesianGrid,
} from "recharts";

interface QuarterlyChartProps {
    title: string;
    data: number[];
    periods: string[];
    color?: string;
    unit?: string;
    className?: string;
}

export function QuarterlyChart({
    title,
    data = [],
    periods = [],
    color = "#10b981",
    unit = "Mr₺",
    className,
}: QuarterlyChartProps) {
    // Prepare chart data - reverse to show oldest first
    const chartData = React.useMemo(() => {
        if (!periods || !data) return [];
        return periods.map((period, i) => ({
            period: (period || "").replace("Q", "/"),
            value: data[i] || 0,
            isPositive: (data[i] || 0) >= 0,
        })).reverse();
    }, [data, periods]);

    // Calculate YoY growth
    const safeData = Array.isArray(data) ? data : [];
    const latestValue = safeData.length > 0 ? safeData[0] : 0;
    const previousValue = safeData.length > 0 ? safeData[safeData.length - 1] : 0;
    const growth = previousValue !== 0 ? ((latestValue - previousValue) / Math.abs(previousValue)) * 100 : 0;

    const uniqueId = React.useId();

    return (
        <div className={cn("bg-card border rounded-xl p-5 hover:border-primary/40 transition-colors duration-300", className)}>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{title}</h3>
                    <div className="text-2xl font-bold font-mono mt-1 text-foreground">
                        {latestValue.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
                    </div>
                </div>
                <div
                    className={cn(
                        "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1",
                        growth >= 0 ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10"
                    )}
                >
                    {growth >= 0 ? "▲" : "▼"}
                    {Math.abs(growth).toFixed(0)}%
                </div>
            </div>

            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id={`gradient-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                                <stop offset="95%" stopColor={color} stopOpacity={0.2} />
                            </linearGradient>
                            <linearGradient id={`gradient-neg-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.2} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                        <XAxis
                            dataKey="period"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(v) => `${v.toFixed(0)}`}
                        />
                        <Tooltip
                            cursor={{ fill: "transparent" }}
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-popover text-popover-foreground border border-border/40 rounded-lg p-3 text-xs animate-in fade-in zoom-in-95 duration-200">
                                            <div className="font-medium text-muted-foreground mb-1.5">{label}</div>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-1.5 h-6 rounded-full"
                                                    style={{ backgroundColor: payload[0].color || payload[0].fill }}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="font-bold font-mono text-base tracking-tight">
                                                        {Number(payload[0].value).toFixed(2)}
                                                        <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar
                            dataKey="value"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={50}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={`url(#gradient-${entry.isPositive ? "" : "neg-"}${uniqueId})`}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

interface FinancialSummaryTableProps {
    incomeData: {
        revenue?: number;
        gross_profit?: number;
        operating_profit?: number;
        ebitda?: number;
        net_profit?: number;
        period?: string;
    };
    previousIncomeData?: {
        revenue?: number;
        gross_profit?: number;
        operating_profit?: number;
        net_profit?: number;
        period?: string;
    };
    balanceData?: {
        current_assets?: number;
        non_current_assets?: number;
        total_assets?: number;
        current_liabilities?: number;
        equity?: number;
        net_debt?: number;
        period?: string;
    };
    previousBalanceData?: {
        current_assets?: number;
        non_current_assets?: number;
        total_assets?: number;
        current_liabilities?: number;
        equity?: number;
        net_debt?: number;
        period?: string;
    };
    unitLabel?: string;
    className?: string;
}

function formatBillions(num: number | undefined): string {
    if (num === undefined || num === null) return "-";
    return (num / 1e9).toFixed(3); // Increased precision slightly
}

function calculateChange(current: number | undefined, previous: number | undefined): number | null {
    if (!current || !previous) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

export function FinancialSummaryTable({
    incomeData,
    balanceData,
    previousIncomeData,
    previousBalanceData,
    unitLabel = "Milyar TL",
    className,
}: FinancialSummaryTableProps) {
    const incomeRows = [
        {
            label: "Satışlar",
            current: incomeData.revenue,
            previous: previousIncomeData?.revenue,
        },
        {
            label: "Brüt Kar",
            current: incomeData.gross_profit,
            previous: previousIncomeData?.gross_profit,
        },
        {
            label: "Esas Faaliyet Karı",
            current: incomeData.operating_profit,
            previous: previousIncomeData?.operating_profit,
        },
        {
            label: "FAVÖK", // Assuming backend sends this or we calculate it, logic exists to calc if needed but sticking to props
            current: incomeData.operating_profit, // Using Operating Profit as proxy if EBITDA missing, or better just use Op Profit label
            previous: previousIncomeData?.operating_profit,
            isProxy: true
        },
        {
            label: "Net Dönem Karı",
            current: incomeData.net_profit,
            previous: previousIncomeData?.net_profit,
        },
    ];

    const balanceRows = [
        { label: "Dönen Varlıklar", current: balanceData?.current_assets, previous: previousBalanceData?.current_assets },
        { label: "Duran Varlıklar", current: balanceData?.non_current_assets, previous: previousBalanceData?.non_current_assets },
        { label: "Toplam Varlıklar", current: balanceData?.total_assets, previous: previousBalanceData?.total_assets },
        { label: "Finansal Borçlar", current: balanceData?.current_liabilities, previous: previousBalanceData?.current_liabilities, labelNote: "(Kısa Vadeli Yük.)" },
        { label: "Net Borç", current: balanceData?.net_debt, previous: previousBalanceData?.net_debt },
        { label: "Özkaynaklar", current: balanceData?.equity, previous: previousBalanceData?.equity },
    ];

    return (
        <div className={cn("bg-card border rounded-lg overflow-hidden font-mono text-xs", className)}>
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border">
                {/* Income Statement */}
                <div>
                    <div className="px-4 py-3 bg-muted/30 border-b flex justify-between items-center">
                        <h3 className="font-bold uppercase tracking-wider text-muted-foreground">
                            Özet Gelir Tablosu <span className="normal-case text-[10px] opacity-70">{unitLabel}</span>
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b text-muted-foreground bg-muted/10">
                                    <th className="text-left p-2 pl-4 font-medium">Kalem</th>
                                    <th className="text-right p-2 font-medium">{incomeData.period || "Cari"}</th>
                                    <th className="text-right p-2 font-medium">{previousIncomeData?.period || "Önceki"}</th>
                                    <th className="text-right p-2 pr-4 font-medium">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {incomeRows.map((row, i) => {
                                    const change = calculateChange(row.current, row.previous);
                                    if (row.isProxy && row.label === "FAVÖK") {
                                        // Skip duplicate if proxy
                                        if (incomeRows[2].current === row.current) return null;
                                    }
                                    return (
                                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                                            <td className="p-2 pl-4 font-medium">{row.label}</td>
                                            <td className="p-2 text-right">{formatBillions(row.current)}</td>
                                            <td className="p-2 text-right text-muted-foreground">
                                                {formatBillions(row.previous)}
                                            </td>
                                            <td className={cn(
                                                "p-2 pr-4 text-right font-bold",
                                                change !== null && change > 0 ? "text-emerald-500" : (change && change < 0 ? "text-red-500" : "text-muted-foreground")
                                            )}>
                                                {change !== null ? `%${Math.abs(change).toFixed(0)}` : "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Balance Sheet */}
                <div className="border-t lg:border-t-0">
                    <div className="px-4 py-3 bg-muted/30 border-b flex justify-between items-center">
                        <h3 className="font-bold uppercase tracking-wider text-muted-foreground">
                            Özet Bilanço <span className="normal-case text-[10px] opacity-70">{unitLabel}</span>
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b text-muted-foreground bg-muted/10">
                                    <th className="text-left p-2 pl-4 font-medium">Kalem</th>
                                    <th className="text-right p-2 font-medium">{balanceData?.period || "Cari"}</th>
                                    <th className="text-right p-2 font-medium">{previousBalanceData?.period || "Önceki"}</th>
                                    <th className="text-right p-2 pr-4 font-medium">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {balanceRows.map((row, i) => {
                                    const change = calculateChange(row.current, row.previous);
                                    return (
                                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                                            <td className="p-2 pl-4 font-medium">
                                                {row.label}
                                                {/* @ts-ignore */}{row.labelNote && <span className="text-[9px] text-muted-foreground ml-1">{row.labelNote}</span>}
                                            </td>
                                            <td className="p-2 text-right">{formatBillions(row.current)}</td>
                                            <td className="p-2 text-right text-muted-foreground">{formatBillions(row.previous)}</td>
                                            <td className={cn(
                                                "p-2 pr-4 text-right font-bold",
                                                change !== null && change > 0 ? "text-emerald-500" : (change && change < 0 ? "text-red-500" : "text-muted-foreground")
                                            )}>
                                                {change !== null ? `%${Math.abs(change).toFixed(0)}` : "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
