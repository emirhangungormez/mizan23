"use client";

import React, { useEffect, useState } from "react";
import {
    Zap,
    TrendingUp,
    TrendingDown,
    ArrowRight,
    Search,
    ChevronRight,
    Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketService } from "@/services/market.service";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Signal {
    symbol: string;
    recommendation: string;
    close: number;
    change: number;
}

type SignalSummaryResponse = {
    summary?: {
        recommendation?: string;
    };
};

export function TechnicalSignalsWidget() {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSignals = async () => {
            try {
                // Fetch for some top BIST stocks
                const symbols = ["THYAO", "EREGL", "KCHOL", "SISE", "AKBNK", "GARAN", "ISCTR", "YKBNK", "SAHOL", "ASELS"];
                const results = await Promise.all(
                    symbols.map(async (sym) => {
                        const s = await MarketService.getTASignals(sym) as SignalSummaryResponse | null;
                        const quote = await MarketService.getQuote(sym);
                        return {
                            symbol: sym,
                            recommendation: s?.summary?.recommendation || "NEUTRAL",
                            close: quote?.last || 0,
                            change: quote?.change_percent || 0
                        };
                    })
                );

                // Filter for actions (Strong Buy/Sell or Buy/Sell)
                const active = results
                    .filter(r => r.recommendation.includes("BUY") || r.recommendation.includes("SELL"))
                    .sort((a, b) => {
                        if (a.recommendation.includes("STRONG") && !b.recommendation.includes("STRONG")) return -1;
                        if (!a.recommendation.includes("STRONG") && b.recommendation.includes("STRONG")) return 1;
                        return 0;
                    });

                setSignals(active.slice(0, 5));
            } catch (error) {
                console.error("Failed to fetch top signals", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSignals();
    }, []);

    if (loading) {
        return (
            <Card className="border-border/40 bg-card/50">
                <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="bg-card border rounded-xl overflow-hidden flex flex-col h-full transition-all">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                    <Zap className="size-4 text-primary fill-primary/20" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Teknik Sinyaller</h3>
                </div>
                <Link href="/scanner/technical">
                    <Button variant="ghost" size="xs" className="h-7 text-[10px] gap-1 hover:bg-primary/5 hover:text-primary">
                        TÜMÜNÜ TARA <ArrowRight className="size-3" />
                    </Button>
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar border-b border-border/5">
                {signals.length > 0 ? (
                    <div className="divide-y divide-border/30">
                        {signals.map((sig) => {
                            const isBuy = sig.recommendation.includes("BUY");
                            const isStrong = sig.recommendation.includes("STRONG");
                            const color = isBuy ? "text-emerald-500" : "text-red-500";
                            const bgColor = isBuy ? "bg-emerald-500/5" : "bg-red-500/5";

                            return (
                                <Link
                                    key={sig.symbol}
                                    href={`/market/${sig.symbol}`}
                                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded bg-primary/5 flex items-center justify-center font-bold text-[10px] text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                            {sig.symbol.substring(0, 2)}
                                        </div>
                                        <div>
                                            <div className="text-[13px] font-bold">{sig.symbol}</div>
                                            <div className="text-[9px] text-muted-foreground font-mono">
                                                ₺{sig.close.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1">
                                        <div className={cn(
                                            "text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                                            isBuy ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                                        )}>
                                            {sig.recommendation === "STRONG_BUY" ? "GÜÇLÜ AL" : sig.recommendation === "BUY" ? "AL" : sig.recommendation === "SELL" ? "SAT" : "GÜÇLÜ SAT"}
                                        </div>
                                        <div className={cn(
                                            "text-[10px] font-bold font-mono",
                                            sig.change >= 0 ? "text-emerald-500" : "text-red-500"
                                        )}>
                                            {sig.change >= 0 ? "+" : ""}{sig.change.toFixed(2)}%
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground opacity-40">
                        <Activity className="size-8 mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Aktif Sinyal Yok</span>
                    </div>
                )}
            </div>

            <div className="p-3 bg-muted/5">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic leading-tight">
                    <Activity className="size-3 shrink-0 opacity-50" />
                    <span>26 teknik osilatör ve hareketli ortalama özeti.</span>
                </div>
            </div>
        </div>
    );
}

