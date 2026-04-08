"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export interface PriceInfo {
    last?: number;
    regularMarketPrice?: number;
    close?: number;
    previousClose?: number;
    change?: number;
    change_percent?: number;
    currency?: string;
}

interface PriceCardProps {
    info: PriceInfo | null;
}

export function PriceCard({ info }: PriceCardProps) {
    const price = info?.last || info?.regularMarketPrice || 0;
    const prevClose = info?.close || info?.previousClose || price;
    const change = info?.change ?? (price - prevClose);
    const changePercent = info?.change_percent ?? ((change / prevClose) * 100);

    const isPositive = changePercent > 0;
    const isNegative = changePercent < 0;

    return (
        <div className="bg-card border rounded-lg p-4 flex flex-col justify-between h-full min-h-[140px]">
            <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Cari Fiyat</p>
                <div className="flex items-baseline gap-2">
                    <h2 className="text-4xl font-black font-mono tracking-tighter">
                        {price.toLocaleString(info?.currency === 'USD' ? 'en-US' : 'tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                    <span className="text-lg font-bold text-muted-foreground">{info?.currency === 'USD' ? 'USD' : 'TL'}</span>
                </div>
            </div>

            <div className="flex items-center gap-4 mt-4">
                <div className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-sm",
                    isPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        isNegative ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
                )}>
                    {isPositive ? <ArrowUpRight className="size-4" /> :
                        isNegative ? <ArrowDownRight className="size-4" /> : <Minus className="size-4" />}
                    % {Math.abs(changePercent).toFixed(2)}
                </div>

                <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Değişim</span>
                    <span className={cn("text-xs font-bold", isPositive ? "text-emerald-600" : "text-red-500")}>
                        {isPositive ? "+" : ""}{change.toLocaleString(info?.currency === 'USD' ? 'en-US' : 'tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </div>
    );
}
