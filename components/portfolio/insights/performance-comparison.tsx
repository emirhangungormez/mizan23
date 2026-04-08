"use client";

import * as React from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { Activity, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { usePortfolioStore } from "@/store/portfolio-store";

export default function PerformanceComparison() {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    const activePortfolio = usePortfolioStore(state => {
        const id = state.activePortfolioId;
        return state.portfolios.find(p => p.id === id);
    });

    const hasAssets = activePortfolio && activePortfolio.assets.length > 0;

    // Static mock data for empty or initialized state
    const MOCK_DATA = [
        { date: "01/12", portföy: 100, benchmark: 100 },
        { date: "05/12", portföy: 100, benchmark: 101 },
        { date: "10/12", portföy: 100, benchmark: 103 },
        { date: "15/12", portföy: 100, benchmark: 106 },
        { date: "20/12", portföy: 100, benchmark: 105 },
        { date: "25/12", portföy: 100, benchmark: 107 },
        { date: "30/12", portföy: 100, benchmark: 109 },
        { date: "05/01", portföy: 100, benchmark: 110 },
    ];

    return (
        <div className={cn(
            "bg-card border border-border rounded-xl p-4 flex flex-col transition-all duration-300",
            hasAssets ? "h-[320px]" : "h-auto min-h-[200px]"
        )}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">Performans</h3>
                </div>
                {hasAssets && (
                    <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50">
                        {["1A", "3A", "1Y", "MAX"].map(p => (
                            <button key={p} className={cn(
                                "px-2 py-0.5 text-[8px] font-bold rounded-md transition-all",
                                p === "1A" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}>{p}</button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 w-full relative min-h-0">
                {!hasAssets ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center animate-in fade-in zoom-in duration-500">
                        <div className="size-12 rounded-full bg-primary/5 flex items-center justify-center mb-3">
                            <BarChart3 className="size-5 text-primary/40" />
                        </div>
                        <h4 className="text-[10px] font-bold text-foreground/80 uppercase tracking-widest mb-1">Veri Akışı Bekleniyor</h4>
                        <p className="text-[9px] text-muted-foreground max-w-[220px] leading-relaxed">
                            Portföy performans grafiği, ilk varlık eklemesiyle birlikte otomatik olarak oluşturulacaktır.
                        </p>
                    </div>
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={MOCK_DATA}>
                                <defs>
                                    <linearGradient id="colorPort" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.05} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"} vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)', fontSize: 9, fontWeight: 500 }}
                                />
                                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'var(--popover)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '12px',
                                        padding: '8px',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                                    }}
                                    itemStyle={{ fontSize: '11px', fontWeight: 500 }}
                                    labelStyle={{ fontSize: '9px', color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '2px' }}
                                />
                                <Legend
                                    verticalAlign="top"
                                    align="right"
                                    height={24}
                                    iconType="circle"
                                    iconSize={4}
                                    wrapperStyle={{ fontSize: '9px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                />
                                <Area
                                    name="Portföy"
                                    type="monotone"
                                    dataKey="portföy"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorPort)"
                                    animationDuration={1500}
                                />
                                <Area
                                    name="Piyasa"
                                    type="monotone"
                                    dataKey="benchmark"
                                    stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                    fill="transparent"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>

                        <div className="absolute bottom-0 left-0 right-0 p-3 rounded-lg border border-border/40 bg-background/80">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Canlı Piyasa</span>
                                </div>
                                <span className="text-[10px] font-medium text-emerald-500">Alfa Üretiliyor</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
