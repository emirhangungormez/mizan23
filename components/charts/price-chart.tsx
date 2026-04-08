"use client";

import React, { useMemo, useState } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface PriceChartProps {
    data: Array<{
        Date?: string;
        date?: string;
        Datetime?: string;
        datetime?: string;
        Close?: number;
        close?: number;
        Open?: number;
        open?: number;
        High?: number;
        high?: number;
        Low?: number;
        low?: number;
    }>;
    height?: number;
    showPrediction?: boolean;
    predictionDirection?: "up" | "down" | "neutral";
    currencySymbol?: string;
    locale?: string;
}

// Custom Tooltip
function CustomTooltip({ active, payload, label, currencySymbol, locale }: any) {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const time = data.fullDate || data.displayTime || label;
    const price = data.price;
    const open = data.open;
    const high = data.high;
    const low = data.low;

    return (
        <div className="bg-popover border rounded-lg p-3 min-w-[160px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b">
                <Clock className="size-3" />
                <span className="font-mono">{time}</span>
            </div>
            <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fiyat</span>
                    <span className="font-bold font-mono">{currencySymbol}{price?.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
                </div>
                {open !== undefined && (
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Açılış</span>
                        <span className="font-mono">{currencySymbol}{open?.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
                    </div>
                )}
                {high && low && (
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Aralık</span>
                        <span className="font-mono text-emerald-500">{currencySymbol}{high?.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="font-mono text-red-500">{currencySymbol}{low?.toLocaleString(locale, { minimumFractionDigits: 2 })}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export function PriceChart({
    data,
    height = 350,
    showPrediction = false,
    predictionDirection = "neutral",
    currencySymbol = "₺",
    locale = "tr-TR"
}: PriceChartProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return null;

        const totalPoints = data.length;
        const processed = data
            .map(item => {
                const timeStr = item.Datetime || item.datetime || item.Date || item.date || "";
                const date = new Date(timeStr);

                // SMART DATE FORMATTING
                let displayTime = "";
                const hasTime = timeStr.includes(":") || timeStr.includes("T");

                if (hasTime) {
                    // If we have many points (>100), we are likely looking at a multi-day view
                    const showDate = totalPoints > 100 || date.getHours() === 0;
                    displayTime = date.toLocaleString(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                        ...(showDate ? { day: '2-digit', month: '2-digit' } : {})
                    });
                } else {
                    displayTime = date.toLocaleString(locale, {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit'
                    });
                }

                return {
                    time: date.getTime(),
                    displayTime,
                    fullDate: date.toLocaleString(locale),
                    price: item.Close ?? item.close ?? 0,
                    open: item.Open ?? item.open ?? 0,
                    high: item.High ?? item.high ?? 0,
                    low: item.Low ?? item.low ?? 0,
                };
            })
            .filter(item => item.price > 0)
            .sort((a, b) => a.time - b.time);

        if (processed.length === 0) return null;

        const prices = processed.map(p => p.price);
        const startPrice = prices[0];
        const endPrice = prices[prices.length - 1];
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Aggressive padding to show "waviness"
        const range = maxPrice - minPrice;
        const padding = range * 0.3 || maxPrice * 0.005;

        // Ensure we have a valid range even if prices are identical
        const finalMin = minPrice - padding;
        const finalMax = (maxPrice + padding) === (minPrice - padding) ? maxPrice + 1 : maxPrice + padding;

        return {
            data: processed,
            startPrice,
            endPrice,
            minPrice: finalMin,
            maxPrice: finalMax,
            trueMin: minPrice,
            trueMax: maxPrice,
            change: endPrice - startPrice,
            changePercent: startPrice !== 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0,
            isPositive: endPrice >= startPrice
        };
    }, [data]);

    if (!chartData) {
        return (
            <div style={{ height }} className="flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Grafik verisi bekleniyor...</span>
            </div>
        );
    }

    const { data: processedData, minPrice, maxPrice, isPositive, changePercent, endPrice, startPrice, trueMin, trueMax } = chartData;
    const primaryColor = isPositive ? "#10b981" : "#ef4444";
    const gradientId = `areaGradient-${isPositive ? 'up' : 'down'}`;

    return (
        <div className="w-full">
            {/* Header Stats */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold",
                        isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                        {isPositive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        <span>{isPositive ? "+" : ""}{changePercent.toFixed(2)}%</span>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                    {processedData[0]?.displayTime} <span className="mx-1">→</span> {processedData[processedData.length - 1]?.displayTime}
                </div>
            </div>

            {/* Chart */}
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={processedData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        onMouseMove={(e) => {
                            if (e.activeTooltipIndex !== undefined && typeof e.activeTooltipIndex === 'number') {
                                setActiveIndex(e.activeTooltipIndex);
                            }
                        }}
                        onMouseLeave={() => setActiveIndex(null)}
                    >
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.25} />
                                <stop offset="50%" stopColor={primaryColor} stopOpacity={0.1} />
                                <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <XAxis
                            dataKey="displayTime"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: isDark ? '#666' : '#999' }}
                            tickMargin={10}
                            interval="preserveStartEnd"
                            minTickGap={50}
                        />

                        <YAxis
                            domain={[minPrice, maxPrice]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: isDark ? '#666' : '#999' }}
                            tickFormatter={(value) => value.toLocaleString(locale, {
                                minimumFractionDigits: value > 1000 ? 0 : 2,
                                maximumFractionDigits: value > 1000 ? 0 : 2
                            })}
                            width={65}
                            tickMargin={5}
                        />

                        <Tooltip
                            content={<CustomTooltip currencySymbol={currencySymbol} locale={locale} />}
                            cursor={{
                                stroke: isDark ? '#444' : '#ddd',
                                strokeWidth: 1,
                                strokeDasharray: '4 4'
                            }}
                        />

                        <ReferenceLine
                            y={startPrice}
                            stroke={isDark ? '#333' : '#e5e5e5'}
                            strokeDasharray="3 3"
                            label={{
                                position: 'right',
                                value: 'Başlangıç',
                                fill: isDark ? '#555' : '#ccc',
                                fontSize: 9
                            }}
                        />

                        <Area
                            type="monotone"
                            dataKey="price"
                            stroke={primaryColor}
                            strokeWidth={2.5}
                            fill={`url(#${gradientId})`}
                            dot={processedData.length < 50}
                            activeDot={{
                                r: 5,
                                fill: primaryColor,
                                stroke: isDark ? '#1a1a1a' : '#fff',
                                strokeWidth: 2
                            }}
                            animationDuration={1000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Bottom Legend */}
            <div className="flex items-center justify-between mt-3 px-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Zirve: {currencySymbol}{trueMax.toLocaleString(locale)}
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        Dip: {currencySymbol}{trueMin.toLocaleString(locale)}
                    </span>
                </div>
                <div className="font-mono">
                    {processedData.length} Veri Noktası
                </div>
            </div>
        </div>
    );
}
