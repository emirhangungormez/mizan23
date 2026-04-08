"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchSupertrend, fetchFastInfo } from "@/lib/api-client";

interface SupertrendData {
    symbol: string;
    value: number;
    direction: number; // 1 = bullish, -1 = bearish
    upper: number;
    lower: number;
}

interface SupertrendIndicatorProps {
    symbol: string;
    className?: string;
}

export function SupertrendIndicator({ symbol, className }: SupertrendIndicatorProps) {
    const [data, setData] = useState<SupertrendData | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<string>("6mo");

    const periods = [
        { label: "1A", value: "1mo" },
        { label: "3A", value: "3mo" },
        { label: "6A", value: "6mo" },
        { label: "1Y", value: "1y" },
    ];

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [supertrendResult, fastInfoResult] = await Promise.all([
                    fetchSupertrend(symbol, period),
                    fetchFastInfo(symbol)
                ]);
                // Handle the simple format from API
                setData(supertrendResult as unknown as SupertrendData);
                setCurrentPrice(fastInfoResult.last_price || 0);
            } catch (err) {
                console.error("[SupertrendIndicator] Error:", err);
                setError("Veri yüklenemedi");
            } finally {
                setLoading(false);
            }
        };

        if (symbol) {
            fetchData();
        }
    }, [symbol, period]);

    if (loading) {
        return (
            <Card className={cn("animate-pulse", className)}>
                <CardHeader className="pb-2">
                    <div className="h-5 bg-muted rounded w-40" />
                </CardHeader>
                <CardContent>
                    <div className="h-24 bg-muted rounded-lg" />
                </CardContent>
            </Card>
        );
    }

    if (error || !data) {
        return null;
    }

    const isBullish = data.direction === 1;
    const supertrendValue = isBullish ? data.lower : data.upper;
    const distancePercent = currentPrice > 0 ? ((currentPrice - supertrendValue) / currentPrice) * 100 : 0;

    return (
        <Card className={cn("border-border/40", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="size-5 text-primary" />
                        Supertrend Göstergesi
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        {periods.map((p) => (
                            <Button
                                key={p.value}
                                variant={period === p.value ? "default" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setPeriod(p.value)}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Signal Badge */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/20">
                    <div className="flex items-center gap-3">
                        <div
                            className={cn(
                                "size-12 rounded-xl flex items-center justify-center",
                                isBullish
                                    ? "bg-emerald-500/20 text-emerald-500"
                                    : "bg-red-500/20 text-red-500"
                            )}
                        >
                            {isBullish ? (
                                <TrendingUp className="size-6" />
                            ) : (
                                <TrendingDown className="size-6" />
                            )}
                        </div>
                        <div>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-sm font-bold px-3 py-1",
                                    isBullish
                                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
                                        : "border-red-500/50 bg-red-500/10 text-red-500"
                                )}
                            >
                                {isBullish ? "YÜKSELIŞ TRENDİ" : "DÜŞÜŞ TRENDİ"}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                                Supertrend (10, 3.0)
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase">Supertrend Seviyesi</p>
                        <p className="text-lg font-bold font-mono">
                            ₺{supertrendValue.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </p>
                        <p
                            className={cn(
                                "text-xs font-mono",
                                distancePercent > 0 ? "text-emerald-500" : "text-red-500"
                            )}
                        >
                            {distancePercent > 0 ? "+" : ""}
                            {distancePercent.toFixed(2)}% uzaklık
                        </p>
                    </div>
                </div>

                {/* Supertrend Levels */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase">Destek (Lower)</p>
                        <p className="text-lg font-bold font-mono text-emerald-500">
                            ₺{data.lower.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/10 text-center">
                        <p className="text-[10px] text-red-600 dark:text-red-400 uppercase">Direnç (Upper)</p>
                        <p className="text-lg font-bold font-mono text-red-500">
                            ₺{data.upper.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>

                {/* Current Price Position */}
                <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-muted-foreground uppercase">Fiyat Konumu</span>
                        <span className="text-xs font-mono font-bold">
                            ₺{currentPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="relative h-2 bg-gradient-to-r from-red-500/30 via-amber-500/30 to-emerald-500/30 rounded-full">
                        {currentPrice > 0 && data.lower > 0 && data.upper > 0 && (
                            <div
                                className={cn(
                                    "absolute top-1/2 -translate-y-1/2 size-3 rounded-full border-2 border-white dark:border-zinc-900",
                                    isBullish ? "bg-emerald-500" : "bg-red-500"
                                )}
                                style={{
                                    left: `${Math.min(100, Math.max(0, ((currentPrice - data.lower) / (data.upper - data.lower)) * 100))}%`,
                                    transform: "translate(-50%, -50%)",
                                }}
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>Destek</span>
                        <span>Direnç</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
