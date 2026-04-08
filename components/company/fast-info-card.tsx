"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    TrendingUp,
    TrendingDown,
    Users,
    BarChart2,
    DollarSign,
    Activity,
    Target,
    ArrowUp,
    ArrowDown,
} from "lucide-react";
import { fetchFastInfo, FastInfo } from "@/lib/api-client";

interface FastInfoCardProps {
    symbol: string;
    className?: string;
}

function formatNumber(num: number | undefined | null, decimals: number = 2): string {
    if (num === undefined || num === null || isNaN(num)) return "-";
    return num.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatLargeNumber(num: number | undefined | null): string {
    if (num === undefined || num === null || isNaN(num)) return "-";
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)} T₺`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)} Mr₺`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)} Mn₺`;
    return num.toLocaleString("tr-TR");
}

function MetricItem({
    icon: Icon,
    label,
    value,
    subValue,
    color,
}: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    subValue?: string;
    color?: string;
}) {
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className={cn("size-8 rounded-lg flex items-center justify-center", color || "bg-primary/10 text-primary")}>
                <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-sm font-bold font-mono">{value}</p>
                {subValue && <p className="text-[10px] text-muted-foreground">{subValue}</p>}
            </div>
        </div>
    );
}

export function FastInfoCard({ symbol, className }: FastInfoCardProps) {
    const [data, setData] = useState<FastInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fetchFastInfo(symbol);
                setData(result);
            } catch (err) {
                console.error("[FastInfoCard] Error:", err);
                setError("Veri yüklenemedi");
            } finally {
                setLoading(false);
            }
        };

        if (symbol) {
            fetchData();
        }
    }, [symbol]);

    if (loading) {
        return (
            <Card className={cn("animate-pulse", className)}>
                <CardHeader className="pb-2">
                    <div className="h-5 bg-muted rounded w-32" />
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-16 bg-muted rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error || !data) {
        return null;
    }

    // Calculate position in 52-week range
    const yearRange = data.year_high - data.year_low;
    const yearPosition = yearRange > 0 
        ? ((data.last_price - data.year_low) / yearRange) * 100 
        : 50;

    // Determine trend colors
    const above50DayAvg = data.last_price > data.fifty_day_average;
    const above200DayAvg = data.last_price > data.two_hundred_day_average;

    return (
        <Card className={cn("border-border/40", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="size-5 text-primary" />
                        Detaylı Piyasa Verisi
                    </CardTitle>
                    {data.foreign_ratio > 0 && (
                        <Badge 
                            variant="outline" 
                            className={cn(
                                "font-mono",
                                data.foreign_ratio > 50 ? "border-emerald-500/50 text-emerald-500" : 
                                data.foreign_ratio > 25 ? "border-amber-500/50 text-amber-500" :
                                "border-muted-foreground"
                            )}
                        >
                            <Users className="size-3 mr-1" />
                            %{formatNumber(data.foreign_ratio, 2)} Yabancı
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 52-Week Range Visual */}
                <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-muted-foreground uppercase">52 Haftalık Aralık</span>
                        <span className="text-xs font-mono">
                            %{formatNumber(yearPosition, 0)} konumda
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-red-500">
                            ₺{formatNumber(data.year_low)}
                        </span>
                        <div className="flex-1 h-2 bg-gradient-to-r from-red-500/20 via-amber-500/20 to-emerald-500/20 rounded-full relative">
                            <div
                                className="absolute top-1/2 -translate-y-1/2 size-3 bg-primary rounded-full border-2 border-white dark:border-zinc-900"
                                style={{ left: `${Math.min(100, Math.max(0, yearPosition))}%`, transform: "translate(-50%, -50%)" }}
                            />
                        </div>
                        <span className="text-xs font-mono text-emerald-500">
                            ₺{formatNumber(data.year_high)}
                        </span>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <MetricItem
                        icon={Target}
                        label="50 Günlük Ortalama"
                        value={`₺${formatNumber(data.fifty_day_average)}`}
                        subValue={above50DayAvg ? "Üzerinde" : "Altında"}
                        color={above50DayAvg ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}
                    />
                    <MetricItem
                        icon={Target}
                        label="200 Günlük Ortalama"
                        value={`₺${formatNumber(data.two_hundred_day_average)}`}
                        subValue={above200DayAvg ? "Üzerinde" : "Altında"}
                        color={above200DayAvg ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}
                    />
                    <MetricItem
                        icon={DollarSign}
                        label="Piyasa Değeri"
                        value={formatLargeNumber(data.market_cap)}
                    />
                    <MetricItem
                        icon={BarChart2}
                        label="İşlem Hacmi"
                        value={formatLargeNumber(data.volume)}
                        subValue={data.amount ? `₺${formatLargeNumber(data.amount)}` : undefined}
                    />
                </div>

                {/* Valuation Metrics */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">F/K</p>
                        <p className="text-sm font-bold font-mono">{formatNumber(data.pe_ratio, 1)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">PD/DD</p>
                        <p className="text-sm font-bold font-mono">{formatNumber(data.pb_ratio, 2)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">FD/FAVÖK</p>
                        <p className="text-sm font-bold font-mono">{formatNumber(data.ev_ebitda, 1)}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">Net Marj</p>
                        <p className="text-sm font-bold font-mono">%{formatNumber(data.net_margin, 1)}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
