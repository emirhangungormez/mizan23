"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    BarChart3,
    Search,
    ChevronRight,
    Loader2,
} from "lucide-react";
import Link from "next/link";

export interface ScreenerItem {
    symbol: string;
    name?: string;
    description?: string;
    last: number;
    change_percent?: number;
    volume?: number;
    pe_ratio?: number;
    pb_ratio?: number;
    roe?: number;
}

interface ScreenerTableProps {
    data: ScreenerItem[];
    type: "bist" | "us" | "crypto" | "commodities";
    isLoading: boolean;
}

export function ScreenerTable({ data, type, isLoading }: ScreenerTableProps) {
    if (isLoading) {
        return (
            <div className="w-full h-[400px] flex flex-col items-center justify-center gap-4 bg-card/50 rounded-2xl border border-border/50 border-dashed">
                <Loader2 className="size-8 text-primary animate-spin" />
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Veriler Analiz Ediliyor...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[400px] flex flex-col items-center justify-center gap-4 bg-card/50 rounded-2xl border border-border/50 border-dashed">
                <Search className="size-8 text-muted-foreground/30" />
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Sonuç Bulunamadı</span>
            </div>
        );
    }

    return (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th className="py-4 px-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Enstrüman</th>
                            <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Fiyat</th>
                            <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Değişim</th>

                            {type === "bist" ? (
                                <>
                                    <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">F/K</th>
                                    <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">PD/DD</th>
                                    <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">ROE</th>
                                </>
                            ) : (
                                <th className="py-4 px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Hacim</th>
                            )}

                            <th className="py-4 px-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-right">Analiz</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {data.map((item, i) => (
                            <tr
                                key={item.symbol + i}
                                className="hover:bg-muted/10 transition-all duration-200 group cursor-pointer"
                            >
                                <td className="py-4 px-6">
                                    <Link href={`/market/${item.symbol}`} className="flex items-center gap-4">
                                        <div className="size-10 rounded-xl bg-muted border border-border/40 flex items-center justify-center font-black text-[10px] text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary group-hover:border-primary/20 transition-all">
                                            {item.symbol?.substring(0, 3)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-black tracking-tight text-foreground group-hover:text-primary transition-colors">
                                                {item.symbol}
                                            </span>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider line-clamp-1 max-w-[200px]">
                                                {item.name || item.description || "-"}
                                            </span>
                                        </div>
                                    </Link>
                                </td>

                                <td className="py-4 px-4">
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-black font-mono tabular-nums">
                                            {formatPrice(item.last, type)}
                                        </span>
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Fiyat</span>
                                    </div>
                                </td>

                                <td className="py-4 px-4">
                                    <div className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black tabular-nums transition-all group-hover:scale-105",
                                        (item.change_percent || 0) >= 0
                                            ? "bg-emerald-500/10 text-emerald-500"
                                            : "bg-rose-500/10 text-rose-500"
                                    )}>
                                        {(item.change_percent || 0) >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                        {(item.change_percent || 0) >= 0 ? "+" : ""}{item.change_percent?.toFixed(2)}%
                                    </div>
                                </td>

                                {type === "bist" ? (
                                    <>
                                        <td className="py-4 px-4">
                                            <span className="text-[11px] font-black font-mono opacity-80">{item.pe_ratio?.toFixed(2) || "-"}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-[11px] font-black font-mono opacity-80">{item.pb_ratio?.toFixed(2) || "-"}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className={cn(
                                                "text-[11px] font-black font-mono",
                                                (item.roe || 0) >= 20 ? "text-primary" : "opacity-80"
                                            )}>
                                                {item.roe ? `%${item.roe.toFixed(1)}` : "-"}
                                            </span>
                                        </td>
                                    </>
                                ) : (
                                    <td className="py-4 px-4">
                                        <span className="text-[11px] font-black font-mono opacity-80">
                                            {formatVolume(item.volume)}
                                        </span>
                                    </td>
                                )}

                                <td className="py-4 px-6 text-right">
                                    <Link
                                        href={`/market/${item.symbol}`}
                                        className="inline-flex items-center justify-center size-9 rounded-xl border border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-all duration-300"
                                    >
                                        <ArrowUpRight className="size-4" />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="px-6 py-4 bg-muted/5 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">
                    <div className="flex items-center gap-1.5">
                        <BarChart3 className="size-3.5 text-primary" /> Analiz Motoru Aktif
                    </div>
                    <div className="h-3 w-px bg-border/50" />
                    <span>Son Güncelleme: Anlık</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-2">Sayfalar:</span>
                    {[1, 2, 3].map(p => (
                        <button
                            key={p}
                            className={cn(
                                "size-7 rounded-lg text-[10px] font-black transition-all border",
                                p === 1 ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border/50 hover:bg-muted/50"
                            )}
                        >
                            {p}
                        </button>
                    ))}
                    <button className="size-7 rounded-lg bg-background text-muted-foreground border border-border/50 hover:bg-muted/50 flex items-center justify-center transition-all">
                        <ChevronRight className="size-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatPrice(val: number, type: string) {
    if (!val) return "-";
    const currency = (type === "bist") ? "₺" : "$";
    return `${currency}${val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatVolume(val: number | undefined) {
    if (!val) return "-";
    if (val >= 1000000000) return (val / 1000000000).toFixed(1) + "B";
    if (val >= 1000000) return (val / 1000000).toFixed(1) + "M";
    if (val >= 1000) return (val / 1000).toFixed(1) + "K";
    return val.toString();
}
