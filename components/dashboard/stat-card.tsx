"use client";

import { LucideIcon, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    data?: {
        last: number;
        change: number;
        changePercent?: number;
        change_percent?: number; // API returns snake_case
    };
    icon: LucideIcon;
    isLoading?: boolean;
}

export function StatCard({ title, data, icon: Icon, isLoading }: StatCardProps) {
    // Handle both snake_case (from API) and camelCase
    const changePercent = data?.changePercent ?? data?.change_percent ?? 0;
    const isPositive = changePercent >= 0;

    return (
        <div className="bg-card text-card-foreground rounded-xl border p-4 transition-all hover:border-primary/30 group">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 group-hover:text-primary transition-colors">{title}</span>
                <div className="size-7 rounded-md bg-muted/50 flex items-center justify-center border border-border/50">
                    <Icon className="size-3.5 text-muted-foreground/60" />
                </div>
            </div>

            <div className="bg-muted/30 dark:bg-neutral-900/40 border border-border/40 rounded-lg p-4 transition-all group-hover:bg-muted/40">
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xl sm:text-2xl font-bold tracking-tight font-mono">
                            {isLoading ? (
                                <Loader2 className="size-5 animate-spin text-muted-foreground/30" />
                            ) : (
                                data ? (data.last < 1000 ? data.last.toFixed(2) : data.last.toLocaleString('tr-TR')) : "---"
                            )}
                        </span>

                        {!isLoading && data && (
                            <div className={cn(
                                "flex items-center gap-1",
                                isPositive ? "text-emerald-400" : "text-pink-400"
                            )}>
                                <span className="text-[10px] font-bold">
                                    {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                                </span>
                            </div>
                        )}
                    </div>

                    {!isLoading && data && (
                        <div className="flex items-center justify-between pt-2 border-t border-border/20">
                            <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest font-bold">Günlük Fark</span>
                            <span className={cn(
                                "text-[10px] font-mono font-bold",
                                isPositive ? "text-emerald-500/80" : "text-pink-500/80"
                            )}>
                                {isPositive ? "+" : ""}{(data.change ?? 0).toFixed(2)}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
