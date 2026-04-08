"use client";

import React, { useEffect, useState } from "react";
import {
    Calendar,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Activity,
    Clock,
    Flame
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarketService } from "@/services/market.service";
import { cn } from "@/lib/utils";
import { fetchMacroIndicators } from "@/lib/api-client";

export function EconomicOverview() {
    const [macro, setMacro] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchMacroIndicators();
                setMacro(data);
            } catch (e) {
                console.error("Macro fetch failed", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) return <div className="h-4 w-48 bg-muted animate-pulse rounded" />;

    const trInf = macro?.tr?.inflation?.yearly || 0;
    const usInf = macro?.us?.inflation?.yearly || 0;

    return (
        <div className="flex items-center gap-6 overflow-hidden">
            {/* Inflation Ticker */}
            <div className="flex items-center gap-4 animate-in slide-in-from-right duration-500">
                <div className="flex items-center gap-1.5 min-w-fit">
                    <Flame className="size-3 text-red-500" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">TR Enflasyon:</span>
                    <span className="text-[11px] font-black font-mono text-red-500">%{trInf.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-1.5 min-w-fit border-l pl-4">
                    <Activity className="size-3 text-blue-500" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">ABD TÜFE:</span>
                    <span className="text-[11px] font-black font-mono text-blue-500">%{usInf.toFixed(2)}</span>
                </div>
            </div>

            {/* Next Important Event - Placeholder for now as we need a real calendar API */}
            <div className="hidden lg:flex items-center gap-2 bg-primary/5 px-2 py-1 rounded border border-primary/10">
                <Calendar className="size-3 text-primary" />
                <span className="text-[9px] font-bold text-primary uppercase">Sonraki Faiz Kararı:</span>
                <span className="text-[9px] font-medium text-muted-foreground uppercase">22 Şub (TCMB)</span>
            </div>
        </div>
    );
}
