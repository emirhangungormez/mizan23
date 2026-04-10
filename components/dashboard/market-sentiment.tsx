"use client";

import React, { useEffect, useState } from "react";
import {
    Gauge,
    TrendingUp,
    TrendingDown,
    Activity,
    Zap,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight
} from "lucide-react";
import { MarketService } from "@/services/market.service";
import { cn } from "@/lib/utils";

type SignalSummaryResponse = {
    summary?: {
        recommendation?: string;
    };
};

export function MarketSentiment() {
    const [sentiment, setSentiment] = useState<{
        score: number;
        recommendation: string;
        bist: { rec: string; change: number };
        us: { rec: string; change: number };
        crypto: { rec: string; change: number };
        loading: boolean;
    }>({
        score: 50,
        recommendation: "NEUTRAL",
        bist: { rec: "NEUTRAL", change: 0 },
        us: { rec: "NEUTRAL", change: 0 },
        crypto: { rec: "NEUTRAL", change: 0 },
        loading: true
    });

    useEffect(() => {
        const fetchSentiment = async () => {
            try {
                const [bistS, usS, cryptoS, quotes] = await Promise.all([
                    MarketService.getTASignals("XU100"),
                    MarketService.getTASignals("^GSPC"),
                    MarketService.getTASignals("BTC-USD"),
                    MarketService.getDashboardData()
                ]) as [SignalSummaryResponse | null, SignalSummaryResponse | null, SignalSummaryResponse | null, Awaited<ReturnType<typeof MarketService.getDashboardData>>];

                const getQuoteChange = (sym: string) => {
                    const all = [...quotes.indices, ...quotes.us_markets, ...quotes.crypto];
                    return all.find(q => q.symbol === sym)?.change_percent || 0;
                };

                const mapScore = (rec?: string) => {
                    if (rec === "STRONG_BUY") return 100;
                    if (rec === "BUY") return 75;
                    if (rec === "SELL") return 25;
                    if (rec === "STRONG_SELL") return 0;
                    return 50;
                };

                const bS = mapScore(bistS?.summary?.recommendation);
                const uS = mapScore(usS?.summary?.recommendation);
                const cS = mapScore(cryptoS?.summary?.recommendation);

                const avgScore = Math.floor((bS + uS + cS) / 3);

                let compositeRec = "NÖTR";
                if (avgScore > 70) compositeRec = "GÜÇLÜ AL";
                else if (avgScore > 55) compositeRec = "AL";
                else if (avgScore < 30) compositeRec = "GÜÇLÜ SAT";
                else if (avgScore < 45) compositeRec = "SAT";

                setSentiment({
                    score: avgScore,
                    recommendation: compositeRec,
                    bist: { rec: bistS?.summary?.recommendation || "NEUTRAL", change: getQuoteChange("XU100") },
                    us: { rec: usS?.summary?.recommendation || "NEUTRAL", change: getQuoteChange("^GSPC") },
                    crypto: { rec: cryptoS?.summary?.recommendation || "NEUTRAL", change: getQuoteChange("BTC-USD") },
                    loading: false
                });
            } catch (error) {
                console.error("Failed to fetch sentiment:", error);
                setSentiment(prev => ({ ...prev, loading: false }));
            }
        };

        fetchSentiment();
        const interval = setInterval(fetchSentiment, 300000);
        return () => clearInterval(interval);
    }, []);

    if (sentiment.loading) {
        return <div className="h-9 w-64 bg-muted/20 animate-pulse rounded-lg" />;
    }

    const isBullish = sentiment.score > 55;
    const isBearish = sentiment.score < 45;

    const statusColor = isBullish ? "text-emerald-500" : isBearish ? "text-red-500" : "text-amber-500";
    const statusBg = isBullish ? "bg-emerald-500/10" : isBearish ? "bg-red-500/10" : "bg-amber-500/10";
    const statusBorder = isBullish ? "border-emerald-500/20" : isBearish ? "border-red-500/20" : "border-amber-500/20";

    const MarketIcon = ({ rec, change }: { rec: string, change: number }) => {
        const isUp = change >= 0;
        const color = rec.includes("BUY") ? "text-emerald-500" : rec.includes("SELL") ? "text-red-500" : "text-amber-500";
        return (
            <div className="flex flex-col items-center gap-0.5 min-w-[45px]">
                <div className={cn("text-[9px] font-black leading-none", color)}>{rec === "STRONG_BUY" ? "S.AL" : rec === "BUY" ? "AL" : rec === "SELL" ? "SAT" : rec === "STRONG_SELL" ? "S.SAT" : "NÖTR"}</div>
                <div className={cn("text-[8px] font-mono leading-none opacity-60 flex items-center gap-0.5", isUp ? "text-emerald-500" : "text-red-500")}>
                    {isUp ? <ArrowUpRight className="size-2" /> : <ArrowDownRight className="size-2" />}
                    %{Math.abs(change).toFixed(1)}
                </div>
            </div>
        );
    };

    return (
        <div className="flex items-center gap-5">
            <div className={cn(
                "group flex items-center gap-3 px-3 py-1.5 rounded-xl border transition-all hover:bg-muted/20",
                statusBg,
                statusBorder
            )}>
                <div className="relative">
                    <Gauge className={cn("size-4 relative z-10", statusColor)} />
                    <div className={cn("absolute inset-0 blur-sm opacity-50", statusColor)} />
                </div>

                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest leading-none mb-0.5">Pazar Modu</span>
                    <span className={cn("text-[11px] font-black tracking-tight leading-none uppercase", statusColor)}>
                        {sentiment.recommendation}
                    </span>
                </div>

                <div className="h-6 w-px bg-border/20 mx-1 hidden sm:block" />

                <div className="hidden sm:flex items-center gap-1.5">
                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="size-1.5 rounded-full bg-red-500 animate-pulse delay-150" />
                    <div className="size-1.5 rounded-full bg-amber-500 animate-pulse delay-300" />
                </div>
            </div>

            <div className="hidden xl:flex items-center gap-6 border-l pl-5 border-border/40">
                <div className="flex flex-col">
                    <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mb-1">TR (XU100)</span>
                    <MarketIcon rec={sentiment.bist.rec} change={sentiment.bist.change} />
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mb-1">ABD (S&P)</span>
                    <MarketIcon rec={sentiment.us.rec} change={sentiment.us.change} />
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mb-1">BTC (7/24)</span>
                    <MarketIcon rec={sentiment.crypto.rec} change={sentiment.crypto.change} />
                </div>
            </div>
        </div>
    );
}
