"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ValuationBandProps {
    min: number;
    max: number;
    current: number;
    lowFairValue: number;
    midFairValue: number;
    highFairValue: number;
}

export function ValuationBand({
    min,
    max,
    current,
    lowFairValue,
    midFairValue,
    highFairValue
}: ValuationBandProps) {
    const range = max - min;
    const getPercent = (val: number) => Math.min(100, Math.max(0, ((val - min) / range) * 100));

    const currentPercent = getPercent(current);
    const lowPercent = getPercent(lowFairValue);
    const highPercent = getPercent(highFairValue);

    // Determine status color
    const isUndervalued = current < lowFairValue;
    const isOvervalued = current > highFairValue;
    const statusColor = isUndervalued ? "text-emerald-600" : isOvervalued ? "text-red-500" : "text-amber-600";
    const statusBg = isUndervalued ? "bg-emerald-600" : isOvervalued ? "bg-red-500" : "bg-amber-500";
    const statusBorder = isUndervalued ? "border-emerald-200" : isOvervalued ? "border-red-200" : "border-amber-200";

    return (
        <div className="w-full pt-10 pb-6 px-2">
            <div className="relative w-full h-4">

                {/* 1. Base Track (Background) */}
                <div className="absolute top-1/2 -mt-1 w-full h-2 bg-secondary/60 rounded-full" />

                {/* 2. Fair Value Range (The Target) */}
                <div
                    className="absolute top-1/2 -mt-1 h-2 bg-emerald-500/80 rounded-full z-10"
                    style={{ left: `${lowPercent}%`, width: `${highPercent - lowPercent}%` }}
                />

                {/* Range Markers (Tick lines for Fair Value Limits) */}
                <div className="absolute top-1/2 -mt-2 w-[2px] h-4 bg-emerald-600 z-10" style={{ left: `${lowPercent}%` }} />
                <div className="absolute top-1/2 -mt-2 w-[2px] h-4 bg-emerald-600 z-10" style={{ left: `${highPercent}%` }} />

                {/* Fair Value Labels (Bottom) */}
                <div className="absolute top-5 w-full pointer-events-none">
                    <span className="absolute text-[10px] font-medium text-muted-foreground -translate-x-1/2" style={{ left: `${lowPercent}%` }}>
                        {lowFairValue.toFixed(2)}
                    </span>
                    <span className="absolute text-[10px] font-medium text-muted-foreground -translate-x-1/2" style={{ left: `${highPercent}%` }}>
                        {highFairValue.toFixed(2)}
                    </span>
                </div>

                {/* 3. Current Price Pointer */}
                <div
                    className="absolute top-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-all duration-700 ease-out"
                    style={{ left: `${currentPercent}%` }}
                >
                    {/* The Label Bubble (Top) */}
                    <div className={cn(
                        "mb-2 px-2.5 py-1 rounded-md border text-xs font-bold tabular-nums whitespace-nowrap transform -translate-y-1/2",
                        "bg-background text-foreground", // Keep it clean contrast
                        statusBorder
                    )}>
                        {current.toFixed(2)}
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">TRY</span>
                    </div>

                    {/* The Needle/Pin */}
                    <div className={cn("w-[2px] h-6 -mt-1 rounded-full", statusBg)} />

                    {/* The Anchor Point */}
                    <div className={cn("size-3 rounded-full border-2 -mt-1.5 bg-background", statusBg.replace("bg-", "border-"))} />
                </div>
            </div>

            {/* Bottom Legend / Status Text */}
            <div className="mt-8 flex items-center justify-between text-xs text-muted-foreground border-t border-dashed pt-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-1.5 bg-emerald-500 rounded-full" />
                        <span>Adil Değer</span>
                    </div>
                </div>
                <div className={cn("font-medium flex items-center gap-1.5", statusColor)}>
                    {isUndervalued ? "Potansiyel Var (İskontolu)" : isOvervalued ? "Primli (Pahalı)" : "Adil Değerinde"}
                </div>
            </div>
        </div>
    );
}
