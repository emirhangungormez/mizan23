"use client";

import * as React from "react";
import { Zap, Info, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

export default function EFSScore({ score }: { score: number }) {
    const { theme } = useTheme();
    const isDark = theme === "dark";

    // Determine color based on score
    const color = score > 0 ? (score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-rose-500") : "text-muted-foreground/30";
    const stroke = score > 0 ? (score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#f43f5e") : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)");

    return (
        <div className="bg-card border border-border rounded-xl p-5 h-full flex flex-col relative overflow-hidden group min-h-[320px]">
            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <Zap className="size-4 text-primary" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-foreground/70">Exposure Fit Score</h3>
                </div>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                <div className="relative size-32 mb-4 group-hover:scale-105 transition-transform duration-500">
                    <svg className="size-full -rotate-90">
                        <circle
                            cx="64"
                            cy="64"
                            r="56"
                            fill="transparent"
                            stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)"}
                            strokeWidth="10"
                        />
                        <circle
                            cx="64"
                            cy="64"
                            r="56"
                            fill="transparent"
                            stroke={stroke}
                            strokeWidth="10"
                            strokeDasharray={2 * Math.PI * 56}
                            strokeDashoffset={2 * Math.PI * 56 * (1 - (score || 1) / 100)}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={cn("text-3xl font-medium tracking-tighter tabular-nums", color)}>{score || 0}</span>
                        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">Skor</span>
                    </div>
                </div>

                <div className="text-center space-y-1">
                    <p className="text-xs font-medium text-foreground/80">Küresel Para Uyumu</p>
                    <p className="text-[10px] text-muted-foreground leading-snug max-w-[180px]">
                        {score > 0 ? (
                            <>Sermaye akışıyla <span className={cn("font-medium", color)}>%{score} uyumlu</span>.</>
                        ) : (
                            "Varlık ekleyerek analizi başlatın."
                        )}
                    </p>
                </div>
            </div>

            <div className="mt-4 space-y-2 relative z-10 opacity-30">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-2">
                        <ArrowUpRight className="size-3 text-muted-foreground" />
                        <span className="text-[9px] font-medium text-muted-foreground uppercase">Beklenen Akış</span>
                    </div>
                    <span className="text-[9px] font-medium text-foreground/40 uppercase">Veri Yok</span>
                </div>
            </div>
        </div>
    );
}
