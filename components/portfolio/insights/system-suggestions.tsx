"use client";

import * as React from "react";
import { MessageSquare, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortfolioStore } from "@/store/portfolio-store";

export default function SystemSuggestions() {
    const activePortfolio = usePortfolioStore(state => {
        const id = state.activePortfolioId;
        return state.portfolios.find(p => p.id === id);
    });

    const hasAssets = activePortfolio && activePortfolio.assets.length > 0;

    const SUGGESTIONS = hasAssets ? [
        {
            title: "Varlık Dengesi",
            message: "Mevcut varlık dağılımınız piyasa koşullarıyla uyumlu görünüyor.",
            type: "info",
            icon: Info
        }
    ] : [];

    return (
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col h-full min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-primary" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-foreground/70">Zekâ Önerileri</h3>
                </div>
                {hasAssets && (
                    <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-primary">1</span>
                    </div>
                )}
            </div>

            <div className="space-y-3 flex-1">
                {hasAssets ? SUGGESTIONS.map((item, idx) => (
                    <div key={idx} className={cn(
                        "p-3 rounded-xl border border-border/50 transition-all hover:bg-muted/10 group cursor-pointer bg-primary/[0.02]"
                    )}>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg shrink-0 bg-primary/10 text-primary">
                                <item.icon className="size-3.5" />
                            </div>
                            <div className="space-y-0.5">
                                <h4 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                                    {item.title}
                                </h4>
                                <p className="text-[11px] text-muted-foreground leading-snug font-medium">
                                    {item.message}
                                </p>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center opacity-30">
                        <Sparkles className="size-6 text-muted-foreground mb-2" />
                        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">Veri Bekleniyor</p>
                    </div>
                )}
            </div>

            {hasAssets && (
                <button className="mt-4 w-full py-2.5 rounded-xl border border-dashed border-border/60 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-foreground hover:border-border transition-all">
                    Tümünü Gör
                </button>
            )}
        </div>
    );
}
