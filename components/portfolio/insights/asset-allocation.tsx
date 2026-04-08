"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Info, BarChart3 } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolio-store";

export default function AssetAllocation() {
    const activePortfolio = usePortfolioStore(state => {
        const id = state.activePortfolioId;
        return state.portfolios.find(p => p.id === id);
    });

    const hasAssets = activePortfolio && activePortfolio.assets.length > 0;

    const DATA = hasAssets ? activePortfolio.assets.map((a, i) => ({
        name: a.symbol,
        value: Math.round((a.weight || 0) * 100),
        color: ["#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981"][i % 5],
        flow: "neutral"
    })) : [
        { name: "Varlık Yok", value: 100, color: "rgba(107, 114, 128, 0.1)", flow: "neutral" }
    ];

    return (
        <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-foreground/70">Varlık Dağılımı</h3>
                </div>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
            </div>

            <div className="flex-1 flex flex-col sm:flex-row gap-6 items-center">
                {/* Donut Chart */}
                <div className="h-[140px] w-[140px] relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={DATA}
                                innerRadius={50}
                                outerRadius={65}
                                paddingAngle={hasAssets ? 4 : 0}
                                dataKey="value"
                                stroke="none"
                            >
                                {DATA.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} opacity={hasAssets ? 0.9 : 0.2} />
                                ))}
                            </Pie>
                            {hasAssets && (
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px' }}
                                    itemStyle={{ color: 'var(--popover-foreground)', fontSize: '11px', fontWeight: '500' }}
                                />
                            )}
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[9px] font-medium text-muted-foreground uppercase">Toplam</span>
                        <span className="text-lg font-medium tracking-tighter">{hasAssets ? "100%" : "0%"}</span>
                    </div>
                </div>

                {/* Legend - Pragmatic & Small */}
                <div className="space-y-2.5 flex-1 w-full max-h-[160px] overflow-y-auto no-scrollbar pr-1">
                    {hasAssets ? DATA.map((item) => (
                        <div key={item.name} className="flex items-center justify-between group py-0.5 border-b border-border/10 last:border-0">
                            <div className="flex items-center gap-2.5">
                                <div className="size-2 rounded-sm" style={{ backgroundColor: item.color }} />
                                <span className="text-[11px] font-medium text-foreground/70 group-hover:text-foreground transition-colors truncate max-w-[80px]">{item.name}</span>
                            </div>
                            <span className="text-[11px] font-mono font-medium text-muted-foreground tabular-nums">%{item.value}</span>
                        </div>
                    )) : (
                        <div className="h-24 flex items-center justify-center border border-dashed rounded-xl border-border/40">
                            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">Veri Yok</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
