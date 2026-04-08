"use client";

import * as React from "react";
import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    CartesianGrid,
} from "recharts";

interface ChartDataPoint {
    date: string;
    value: number;
}

interface PortfolioChartProps {
    data: ChartDataPoint[];
}

export default function PortfolioChart({ data }: PortfolioChartProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <Tooltip
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            return (
                                <div className="bg-popover border rounded-lg px-3 py-2 shadow-xl ring-1 ring-black/5">
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{payload[0].payload.date}</p>
                                    <p className="text-sm font-black tabular-nums">₺{payload[0].value?.toLocaleString('tr-TR')}</p>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    animationDuration={500}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
