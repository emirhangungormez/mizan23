"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, MoveRight, Info } from "lucide-react";

interface ProbabilityPanelProps {
    probabilities: {
        up: number;
        down: number;
        sideways: number;
    };
    className?: string;
}

export function ProbabilityPanel({ probabilities, className }: ProbabilityPanelProps) {
    const { up, down, sideways } = probabilities;

    return (
        <section className={cn("bg-card border rounded-lg overflow-hidden", className)}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="size-4 text-emerald-500" />
                    <h3 className="font-bold text-sm uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Olasılık & Karar Destek</h3>
                </div>
                <Info className="size-3 text-muted-foreground" />
            </div>

            <div className="p-4 space-y-4">
                <div className="space-y-3">
                    {/* UP */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                            <span className="flex items-center gap-1.5 text-emerald-600">
                                <TrendingUp className="size-3.5" /> Yukarı Olasılığı
                            </span>
                            <span className="font-mono text-emerald-600">%{up}</span>
                        </div>
                        <div className="h-2 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${up}%` }} />
                        </div>
                    </div>

                    {/* SIDEWAYS */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                            <span className="flex items-center gap-1.5 text-blue-500">
                                <MoveRight className="size-3.5" /> Yatay Olasılığı
                            </span>
                            <span className="font-mono text-blue-500">%{sideways}</span>
                        </div>
                        <div className="h-2 w-full bg-blue-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${sideways}%` }} />
                        </div>
                    </div>

                    {/* DOWN */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                            <span className="flex items-center gap-1.5 text-red-500">
                                <TrendingDown className="size-3.5" /> Aşağı Olasılığı
                            </span>
                            <span className="font-mono text-red-500">%{down}</span>
                        </div>
                        <div className="h-2 w-full bg-red-500/10 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${down}%` }} />
                        </div>
                    </div>
                </div>

                <div className="pt-2 px-3 py-2 bg-muted/40 rounded-lg border border-dashed text-[10px] text-muted-foreground leading-snug">
                    <span className="font-bold text-primary block mb-1">💡 Zekâ Notu:</span>
                    Bu veriler tahmin değil, geçmiş fiyat hareketleri ve teknik indikatorlerin matematiksel olasılık dağılımıdır. Yatırım tavsiyesi içermez.
                </div>
            </div>
        </section>
    );
}

import { Zap } from "lucide-react";
