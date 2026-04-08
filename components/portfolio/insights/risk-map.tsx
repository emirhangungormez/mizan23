"use client";

import * as React from "react";
import { Shield, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortfolioStore } from "@/store/portfolio-store";

export default function RiskHeatmap() {
    const activePortfolio = usePortfolioStore(state => {
        const id = state.activePortfolioId;
        return state.portfolios.find(p => p.id === id);
    });

    const hasAssets = activePortfolio && activePortfolio.assets.length > 0;

    const RISKS = hasAssets ? [
        { name: "Faiz Riski", level: 35, color: "bg-emerald-500", label: "Güvenli" },
        { name: "Döviz Riski", level: 45, color: "bg-blue-500", label: "Stabil" },
        { name: "Likidite Riski", level: 20, color: "bg-emerald-500", label: "Güvenli" },
        { name: "Volatilite Riski", level: 55, color: "bg-amber-500", label: "Dikkat" },
    ] : [
        { name: "Faiz Riski", level: 0, color: "bg-muted", label: "Veri Yok" },
        { name: "Döviz Riski", level: 0, color: "bg-muted", label: "Veri Yok" },
        { name: "Likidite Riski", level: 0, color: "bg-muted", label: "Veri Yok" },
        { name: "Volatilite Riski", level: 0, color: "bg-muted", label: "Veri Yok" },
    ];

    return (
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col h-full min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Shield className="size-4 text-primary" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-foreground/70">Risk Haritası</h3>
                </div>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
            </div>

            <div className="space-y-4 flex-1">
                {RISKS.map((risk) => (
                    <div key={risk.name} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">{risk.name}</span>
                            <span className={cn(
                                "text-[9px] font-medium uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                                risk.level === 0 ? "text-muted-foreground bg-muted/20" :
                                    risk.color === "bg-emerald-500" ? "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20" :
                                        risk.color === "bg-amber-500" ? "text-amber-500 bg-amber-500/10 border border-amber-500/20" :
                                            "text-blue-500 bg-blue-500/10 border border-blue-500/20"
                            )}>
                                {risk.label}
                            </span>
                        </div>
                        <div className="h-1 w-full bg-muted/30 rounded-full overflow-hidden flex">
                            <div
                                className={cn("h-full rounded-full transition-all duration-1000", risk.color, "opacity-60")}
                                style={{ width: `${risk.level}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 shrink-0">
                <div className="p-2.5 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-[9px] font-medium text-muted-foreground uppercase block mb-0.5">Max Drawdown</span>
                    <span className="text-xs font-medium text-foreground/50">{hasAssets ? "-%4.2" : "--"}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-[9px] font-medium text-muted-foreground uppercase block mb-0.5">Sharpe Ratio</span>
                    <span className="text-xs font-medium text-foreground/50">{hasAssets ? "1.82" : "--"}</span>
                </div>
            </div>
        </div>
    );
}
