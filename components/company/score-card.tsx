"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
    value: number;
    label: string;
    size?: "sm" | "md" | "lg";
}

export function ScoreGauge({ value, label, size = "md" }: ScoreGaugeProps) {
    const getColor = (v: number) => {
        if (v >= 70) return "text-emerald-500";
        if (v >= 40) return "text-amber-500";
        return "text-red-500";
    };

    // Size mappings
    const sizes = {
        sm: { size: "size-12", stroke: 3, text: "text-xs" },
        md: { size: "size-16", stroke: 4, text: "text-sm" },
        lg: { size: "size-24", stroke: 5, text: "text-lg" },
    };

    const s = sizes[size];

    return (
        <div className="flex flex-col items-center gap-2">
            <div className={`relative ${s.size}`}>
                <svg className={`${s.size} -rotate-90`} viewBox="0 0 36 36">
                    <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        className="stroke-muted/30"
                        strokeWidth={s.stroke}
                    />
                    <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        className={cn(
                            "transition-all duration-500",
                            value >= 70 ? "stroke-emerald-500" : value >= 40 ? "stroke-amber-500" : "stroke-red-500"
                        )}
                        strokeWidth={s.stroke}
                        strokeDasharray={`${value} 100`}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("font-bold", s.text, getColor(value))}>{value}</span>
                </div>
            </div>
            <span className="text-xs text-muted-foreground font-medium text-center uppercase tracking-wide">{label}</span>
        </div>
    );
}

interface CompanyScoreCardProps {
    score: {
        profitability: number;
        leverage: number;
        liquidity: number;
        overall: number;
        grade: string;
    };
    className?: string;
}

export function CompanyScoreCard({ score, className }: CompanyScoreCardProps) {
    return (
        <div className={cn("bg-card border rounded-lg p-6", className)}>
            <div className="text-center mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Finansal Karne
                </h3>
                <div className="flex items-center justify-center gap-2">
                    <span className="text-3xl font-bold">{score.overall}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                </div>
                <div className={cn(
                    "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold mt-2",
                    score.grade === "A" && "bg-emerald-500/10 text-emerald-500",
                    score.grade === "B" && "bg-green-500/10 text-green-500",
                    score.grade === "C" && "bg-amber-500/10 text-amber-500",
                    score.grade === "D" && "bg-orange-500/10 text-orange-500",
                    score.grade === "F" && "bg-red-500/10 text-red-500"
                )}>
                    Not: {score.grade}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <ScoreGauge value={score.profitability} label="Karlılık" />
                <ScoreGauge value={score.leverage} label="Borç Yapısı" />
                <ScoreGauge value={score.liquidity} label="Likidite" />
            </div>
        </div>
    );
}
