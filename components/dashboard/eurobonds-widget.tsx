"use client";

import * as React from "react";
import { Banknote, TrendingUp, TrendingDown, RefreshCw, DollarSign, Euro, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchEurobonds, type Eurobond, type EurobondsResponse } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";

interface EurobondsWidgetProps {
    className?: string;
    compact?: boolean;
    maxRows?: number;
}

export function EurobondsWidget({ className, compact = false, maxRows = 10 }: EurobondsWidgetProps) {
    const [data, setData] = React.useState<EurobondsResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [currency, setCurrency] = React.useState<"all" | "USD" | "EUR">("all");

    const loadData = React.useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await fetchEurobonds();
            setData(result);
        } catch (e) {
            console.error("Eurobonds fetch error:", e);
            setError("Eurobond verileri yüklenemedi");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredBonds = React.useMemo(() => {
        if (!data?.bonds) return [];
        if (currency === "all") return data.bonds;
        return data.bonds.filter(b => b.currency === currency);
    }, [data, currency]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short' });
    };

    const getYieldColor = (yieldValue: number) => {
        if (yieldValue >= 7) return "text-red-500";
        if (yieldValue >= 5) return "text-amber-500";
        return "text-emerald-500";
    };

    if (loading && !data) {
        return (
            <div className={cn("bg-card border rounded-xl p-4", className)}>
                <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-6 w-20" />
                </div>
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
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

    // Summary stats
    const usdBonds = data.bonds.filter(b => b.currency === "USD");
    const eurBonds = data.bonds.filter(b => b.currency === "EUR");
    const avgUsdYield = usdBonds.length > 0 
        ? usdBonds.reduce((sum, b) => sum + b.bid_yield, 0) / usdBonds.length 
        : 0;
    const avgEurYield = eurBonds.length > 0 
        ? eurBonds.reduce((sum, b) => sum + b.bid_yield, 0) / eurBonds.length 
        : 0;

    if (compact) {
        return (
            <div className={cn("bg-card border rounded-xl p-4", className)}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Banknote className="size-4 text-blue-500" />
                        <span className="font-medium text-sm">Türk Eurobondları</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{data.count} tahvil</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <DollarSign className="size-3 text-green-500" />
                            <span className="text-xs text-muted-foreground">USD Ort.</span>
                        </div>
                        <div className={cn("text-lg font-bold", getYieldColor(avgUsdYield))}>
                            %{avgUsdYield.toFixed(2)}
                        </div>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Euro className="size-3 text-blue-500" />
                            <span className="text-xs text-muted-foreground">EUR Ort.</span>
                        </div>
                        <div className={cn("text-lg font-bold", getYieldColor(avgEurYield))}>
                            %{avgEurYield.toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("bg-card border rounded-xl p-4", className)}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Banknote className="size-5 text-blue-500" />
                    <span className="font-semibold">Türk Eurobondları</span>
                    <Badge variant="outline" className="text-xs">{data.count} tahvil</Badge>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <DollarSign className="size-4 text-green-500" />
                        <span>USD Tahviller ({usdBonds.length})</span>
                    </div>
                    <div className={cn("text-2xl font-bold", getYieldColor(avgUsdYield))}>
                        %{avgUsdYield.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Ortalama Getiri</div>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Euro className="size-4 text-blue-500" />
                        <span>EUR Tahviller ({eurBonds.length})</span>
                    </div>
                    <div className={cn("text-2xl font-bold", getYieldColor(avgEurYield))}>
                        %{avgEurYield.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Ortalama Getiri</div>
                </div>
            </div>

            {/* Filter Tabs */}
            <Tabs value={currency} onValueChange={(v) => setCurrency(v as "all" | "USD" | "EUR")} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-3">
                    <TabsTrigger value="all">Tümü</TabsTrigger>
                    <TabsTrigger value="USD">USD</TabsTrigger>
                    <TabsTrigger value="EUR">EUR</TabsTrigger>
                </TabsList>

                <TabsContent value={currency} className="mt-0">
                    <div className="max-h-[300px] overflow-auto rounded-lg border">
                        <Table>
                            <TableHeader className="sticky top-0 bg-card">
                                <TableRow>
                                    <TableHead className="w-[100px]">ISIN</TableHead>
                                    <TableHead>Vade</TableHead>
                                    <TableHead className="text-right">Fiyat</TableHead>
                                    <TableHead className="text-right">Getiri</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredBonds.slice(0, maxRows).map((bond) => (
                                    <TableRow key={bond.isin} className="text-sm">
                                        <TableCell className="font-mono text-xs">
                                            <div className="flex items-center gap-1">
                                                {bond.currency === "USD" ? (
                                                    <DollarSign className="size-3 text-green-500" />
                                                ) : (
                                                    <Euro className="size-3 text-blue-500" />
                                                )}
                                                {bond.isin.slice(-6)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>{formatDate(bond.maturity)}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {bond.days_to_maturity} gün
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {bond.bid_price.toFixed(2)}
                                        </TableCell>
                                        <TableCell className={cn("text-right font-bold", getYieldColor(bond.bid_yield))}>
                                            %{bond.bid_yield.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {filteredBonds.length > maxRows && (
                        <div className="text-center text-xs text-muted-foreground mt-2">
                            +{filteredBonds.length - maxRows} tahvil daha
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
