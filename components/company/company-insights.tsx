"use client";

import React, { useEffect, useState } from "react";
import {
    Activity,
    ShieldCheck,
    Globe,
    Info,
    Zap,
    Gauge
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MarketService } from "@/services/market.service";

interface CompanyInsightsProps {
    symbol: string;
}

interface TASignalsData {
    summary?: {
        recommendation?: string;
        buy?: number;
        neutral?: number;
        sell?: number;
    };
    oscillators?: {
        recommendation?: string;
    };
    moving_averages?: {
        recommendation?: string;
    };
}

interface ETFHolderItem {
    symbol?: string;
    name?: string;
    exchange?: string;
    weight?: number;
}

const SIGNAL_COLOR_MAP = {
    STRONG_BUY: "text-emerald-500",
    BUY: "text-emerald-400",
    NEUTRAL: "text-amber-500",
    SELL: "text-red-400",
    STRONG_SELL: "text-red-500",
} as const;

export function CompanyInsights({ symbol }: CompanyInsightsProps) {
    const [signals, setSignals] = useState<TASignalsData | null>(null);
    const [etfHolders, setEtfHolders] = useState<ETFHolderItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [sig, etf] = await Promise.all([
                    MarketService.getTASignals(symbol),
                    MarketService.getETFHolders(symbol)
                ]);
                setSignals(sig);
                setEtfHolders(etf?.holders || []);
            } catch (error) {
                console.error("Failed to fetch insights:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [symbol]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                <div className="h-[300px] bg-muted rounded-xl" />
                <div className="h-[300px] bg-muted rounded-xl" />
            </div>
        );
    }

    const recommendation = (signals?.summary?.recommendation || "NEUTRAL") as keyof typeof SIGNAL_COLOR_MAP;
    const statusColor = SIGNAL_COLOR_MAP[recommendation] || "text-muted-foreground";
    const hasSignals =
        Boolean(signals?.summary)
        && (
            Number(signals?.summary?.buy || 0) > 0
            || Number(signals?.summary?.neutral || 0) > 0
            || Number(signals?.summary?.sell || 0) > 0
        );
    const hasEtfHolders = etfHolders.length > 0;

    if (!hasSignals && !hasEtfHolders) {
        return null;
    }

    return (
        <div className={cn("grid grid-cols-1 gap-6", hasSignals && hasEtfHolders ? "md:grid-cols-2" : "md:grid-cols-1")}>
            {hasSignals && (
                <Card className="border-border/40 overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Gauge className="size-5 text-primary" />
                                Teknik Sinyaller
                            </CardTitle>
                            <Badge variant="outline" className={cn("font-bold", statusColor)}>
                                {recommendation}
                            </Badge>
                        </div>
                        <CardDescription>26 göstergenin TradingView analiz özeti</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-6">
                            {/* Signal Meter */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="text-center flex-1">
                                    <div className="text-2xl font-bold text-emerald-500">{signals?.summary?.buy || 0}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">AL</div>
                                </div>
                                <div className="text-center flex-1 border-x px-4">
                                    <div className="text-2xl font-bold text-amber-500">{signals?.summary?.neutral || 0}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">TUT</div>
                                </div>
                                <div className="text-center flex-1">
                                    <div className="text-2xl font-bold text-red-500">{signals?.summary?.sell || 0}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">SAT</div>
                                </div>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Zap className="size-3 text-amber-500" /> Osilatörler
                                        </span>
                                        <span className="font-medium text-amber-500 uppercase">{signals?.oscillators?.recommendation}</span>
                                    </div>
                                    <Progress value={50} className="h-1 bg-muted" />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Activity className="size-3 text-blue-500" /> Hareketli Ortalamalar
                                        </span>
                                        <span className="font-medium text-emerald-500 uppercase">{signals?.moving_averages?.recommendation}</span>
                                    </div>
                                    <Progress value={75} className="h-1 bg-muted" />
                                </div>
                            </div>

                            <div className="p-3 bg-muted/30 rounded-lg flex items-start gap-2 border border-border/50">
                                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Bu veriler RSI, MACD, Ichimoku, Bollinger Bantları ve Üstel Hareketli Ortalamalar gibi popüler teknik göstergelerin anlık birleşiminden oluşur.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {hasEtfHolders && (
                <Card className="border-border/40 overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Globe className="size-5 text-primary" />
                            Yabancı ETF Ortaklığı
                        </CardTitle>
                        <CardDescription>Dev fonların portföyündeki ağırlığı</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {etfHolders.length > 0 ? (
                            <div className="space-y-4">
                                <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {etfHolders.slice(0, 6).map((etf, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border/40">
                                            <div className="flex items-center gap-2.5">
                                                <div className="size-7 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                    {etf.symbol}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{etf.name || etf.symbol}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase">{etf.exchange}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-bold">{etf.weight ? `${etf.weight.toFixed(2)}%` : "-"}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">Ağırlık</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-center p-1 bg-muted/30 rounded-lg border border-border/40">
                                    <span className="text-[11px] text-muted-foreground">
                                        Vanguard, iShares ve MSCI gibi küresel fonları içerir.
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <ShieldCheck className="size-12 mb-2 opacity-10" />
                                <p className="text-sm">Yabancı ETF verisi bulunamadı</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
