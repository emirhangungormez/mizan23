"use client";

import * as React from "react";
import { Percent, TrendingUp, TrendingDown, Building2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTCMBRates, type TCMBRates } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface TCMBRatesWidgetProps {
    className?: string;
    compact?: boolean;
}

export function TCMBRatesWidget({ className, compact = false }: TCMBRatesWidgetProps) {
    const [data, setData] = React.useState<TCMBRates | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

    const loadData = React.useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await fetchTCMBRates();
            setData(result);
            setLastUpdated(new Date());
        } catch (e) {
            console.error("TCMB rates fetch error:", e);
            setError("Faiz oranları yüklenemedi");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading && !data) {
        return (
            <div className={cn("bg-card border rounded-xl p-4", className)}>
                <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-4 rounded" />
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className={cn("bg-card border rounded-xl p-4", className)}>
                <div className="text-center text-muted-foreground text-sm py-4">
                    {error}
                    <Button variant="ghost" size="sm" onClick={loadData} className="ml-2">
                        <RefreshCw className="size-3" />
                    </Button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const RateCard = ({ 
        label, 
        value, 
        subLabel, 
        subValue,
        color = "text-amber-500" 
    }: { 
        label: string; 
        value: number; 
        subLabel?: string;
        subValue?: number;
        color?: string;
    }) => (
        <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2">
                <Percent className={cn("size-4", color)} />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="text-right">
                <span className="text-lg font-semibold">%{value.toFixed(1)}</span>
                {subLabel && subValue !== undefined && (
                    <div className="text-xs text-muted-foreground">
                        {subLabel}: %{subValue.toFixed(1)}
                    </div>
                )}
            </div>
        </div>
    );

    if (compact) {
        return (
            <div className={cn("bg-card border rounded-xl p-4", className)}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-amber-500" />
                        <span className="font-medium text-sm">TCMB Faiz Oranları</span>
                    </div>
                </div>
                <div className="flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-amber-500">%{data.policy_rate}</div>
                        <div className="text-xs text-muted-foreground mt-1">Politika Faizi</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("bg-card border rounded-xl p-4", className)}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Building2 className="size-5 text-amber-500" />
                    <span className="font-semibold">TCMB Faiz Oranları</span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="size-7" 
                    onClick={loadData}
                    disabled={loading}
                >
                    <RefreshCw className={cn("size-3", loading && "animate-spin")} />
                </Button>
            </div>

            <div className="space-y-1">
                <RateCard 
                    label="Politika Faizi" 
                    value={data.policy_rate} 
                    color="text-amber-500"
                />
                
                <RateCard 
                    label="Gecelik Borçlanma" 
                    value={data.overnight.borrowing}
                    subLabel="Borç Verme"
                    subValue={data.overnight.lending}
                    color="text-blue-500"
                />
                
                <RateCard 
                    label="Geç Likidite Penceresi" 
                    value={data.late_liquidity.borrowing}
                    subLabel="Borç Verme"
                    subValue={data.late_liquidity.lending}
                    color="text-purple-500"
                />
            </div>

            {lastUpdated && (
                <div className="mt-3 pt-2 border-t text-xs text-muted-foreground text-center">
                    Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
                </div>
            )}
        </div>
    );
}
