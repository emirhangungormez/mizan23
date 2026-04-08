"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, Activity, Zap, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MarketPulse() {
    const { analysisResults, isAnalyzing, runAnalysis, hasAttemptedAnalysis } = useDashboardStore();

    useEffect(() => {
        if (analysisResults.length === 0 && !isAnalyzing && !hasAttemptedAnalysis) {
            runAnalysis();
        }
    }, [runAnalysis, analysisResults.length, isAnalyzing, hasAttemptedAnalysis]);

    if (isAnalyzing && analysisResults.length === 0) {
        return (
            <div className="rounded-md border border-border/50 bg-card p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="size-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-600">
                        <Zap className="size-4" />
                    </div>
                    <h2 className="text-xs font-normal uppercase tracking-widest">İSTİHBARAT NABZI</h2>
                </div>
                <Skeleton className="h-[200px] w-full" />
            </div>
        );
    }

    return (
        <div className="rounded-md border border-border/50 bg-card overflow-hidden">
            <div className="px-6 py-5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="size-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-600">
                        <Zap className="size-4" />
                    </div>
                    <h2 className="text-xs font-normal uppercase tracking-widest">İSTİHBARAT NABZI</h2>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-[10px] font-normal uppercase text-muted-foreground/60 tracking-widest">
                    <span className="flex items-center gap-1.5"><div className="size-1 bg-emerald-500 rounded-full animate-pulse" /> MATEMATİKSEL MOTOR AKTİF</span>
                </div>
            </div>
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/30 bg-muted/20">
                        <TableHead className="h-10 text-[10px] uppercase tracking-widest font-normal px-6">VARLIK</TableHead>
                        <TableHead className="h-10 text-[10px] uppercase tracking-widest font-normal">REJİM</TableHead>
                        <TableHead className="h-10 text-[10px] uppercase tracking-widest font-normal">OLASILIK</TableHead>
                        <TableHead className="h-10 text-[10px] uppercase tracking-widest font-normal text-right px-6">RİSK</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {analysisResults.map((result) => (
                        <TableRow key={result.symbol} className="border-border/30 hover:bg-muted/30 transition-colors group">
                            <TableCell className="font-normal py-4 px-6">{result.symbol}</TableCell>
                            <TableCell>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "uppercase text-[10px] font-normal px-2 py-0 border-none rounded-none border-l-2",
                                        result.regime === 'trend' && "border-emerald-500 bg-emerald-500/5 text-emerald-600",
                                        result.regime === 'chaotic' && "border-rose-500 bg-rose-500/5 text-rose-600",
                                        result.regime === 'sideways' && "border-blue-500 bg-blue-500/5 text-blue-600",
                                    )}
                                >
                                    {result.regime === 'trend' ? 'TREND' : result.regime === 'chaotic' ? 'KAOTİK' : 'YATAY'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "size-1.5 rounded-full",
                                        result.probabilityUp > 0.55 ? "bg-emerald-500" : result.probabilityUp < 0.45 ? "bg-rose-500" : "bg-zinc-400"
                                    )} />
                                    <span className="text-[11px] font-mono font-normal">{(result.probabilityUp * 100).toFixed(1)}%</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-right py-4 px-6">
                                <div className="flex flex-col items-end gap-1.5">
                                    <span className="text-[10px] font-normal text-muted-foreground/80">{(result.riskScore * 100).toFixed(0)}</span>
                                    <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={cn("h-full transition-all", result.riskScore > 0.7 ? "bg-rose-500" : "bg-emerald-500")}
                                            style={{ width: `${result.riskScore * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <div className="px-6 py-3 bg-muted/20 border-t border-border/40 flex items-center gap-2">
                <Info className="size-3 text-muted-foreground/60" />
                <p className="text-[9px] font-normal text-muted-foreground/60 uppercase tracking-tight">
                    Kuantum Analiz Motoru • Shannon-Entropik Model v2.4
                </p>
            </div>
        </div>
    );
}
