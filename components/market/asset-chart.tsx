"use client";

import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid
} from "recharts";

interface ChartDataItem {
    Date?: string;
    time?: string;
    index?: number;
    Close?: number;
    close?: number;
    last?: number;
    Volume?: number;
    volume?: number;
}

interface AssetChartProps {
    data: ChartDataItem[];
}

export function AssetChart({ data }: AssetChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                Grafik verisi bulunamadı
            </div>
        );
    }

    // Map data to expected format
    const chartData = data.map(item => {
        const dateValue = item.Date || item.time || item.index;
        const date = dateValue ? new Date(dateValue).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
        return {
            date,
            price: item.Close || item.close || item.last,
            vol: item.Volume || item.volume || 0
        };
    });

    const prices = chartData.map(d => d.price).filter((p): p is number => p !== undefined);
    const minPrice = prices.length > 0 ? Math.min(...prices) * 0.99 : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.01 : 0;

    const firstPrice = chartData[0]?.price ?? 0;
    const lastPrice = chartData[chartData.length - 1]?.price ?? 0;
    const isUp = lastPrice >= firstPrice;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.1} />
                        <stop offset="95%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.1)" />
                <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    minTickGap={30}
                />
                <YAxis
                    domain={[minPrice, maxPrice]}
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => value.toLocaleString('tr-TR')}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: "bold"
                    }}
                    formatter={(value) => typeof value === 'number' ? [value.toLocaleString('tr-TR') + " TL", "Fiyat"] : ['', '']}
                />
                <Area
                    type="monotone"
                    dataKey="price"
                    stroke={isUp ? "#10b981" : "#ef4444"}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPrice)"
                    animationDuration={1500}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
