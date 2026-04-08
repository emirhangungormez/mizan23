"use client";

import * as React from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Search, SlidersHorizontal, Upload, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface StockData {
    symbol: string;
    name?: string;
    last: number;
    change_percent?: number;
    volume?: number;
    p1w?: number;
    p1m?: number;
    p3m?: number;
    p6m?: number;
}

interface PeopleTableProps {
    stocks: StockData[];
}

function PerformanceBadge({ value }: { value: number | undefined }) {
    if (value === undefined || value === null) return <span className="text-[10px] text-muted-foreground opacity-30">--</span>;
    const isPositive = value >= 0;
    return (
        <span className={cn(
            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border leading-none shrink-0",
            isPositive ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-pink-500 border-pink-500/20 bg-pink-500/5"
        )}>
            {isPositive ? "+" : ""}{value.toFixed(1)}%
        </span>
    );
}

export function PeopleTable({ stocks }: PeopleTableProps) {
    const [search, setSearch] = React.useState("");

    // Safety check for stocks array
    const dataList = (stocks && Array.isArray(stocks)) ? stocks : [];

    const filtered = dataList.filter(c =>
        (c.name || c.symbol).toLowerCase().includes(search.toLowerCase()) ||
        c.symbol.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="bg-card text-card-foreground rounded-xl border overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-4 gap-4 border-b bg-zinc-500/5">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground shrink-0 pl-1">İstihbarat Akışı</h3>
                    <div className="h-4 w-px bg-border/60 hidden sm:block" />
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
                        <Input
                            placeholder="Firma veya sektör ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-9 w-full sm:w-64 pl-9 text-xs bg-background/50 border-border/40 focus-visible:ring-primary/20 placeholder:text-muted-foreground/40"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button variant="outline" size="sm" className="h-9 gap-2 text-[10px] font-medium uppercase tracking-widest border-border/50 bg-background/50 hover:bg-muted/50">
                        <SlidersHorizontal className="size-3.5" /> BİST 30
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-2 text-[10px] font-medium uppercase tracking-widest border-border/50 bg-background/50 hover:bg-muted/50">
                        <Upload className="size-3.5" /> DIŞA AKTAR
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/20 border-b border-border/50">
                            <TableHead className="w-[220px] text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 pl-6">VARLIK / ŞİRKET</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-right">FİYAT</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-right">GÜNLÜK %</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-right">HACİM</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-center">1H</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-center">1A</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-center">3A</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-center">6A</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-widest py-4 text-muted-foreground/70 text-right pr-6">AKSİYON</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map((c, i) => (
                            <TableRow key={c.symbol + i} className="hover:bg-muted/5 border-b border-border/30 transition-colors last:border-0 h-14">
                                <TableCell className="pl-6">
                                    <div className="flex items-center gap-3">
                                        <div className="size-9 rounded-lg border border-border/50 bg-primary/5 flex items-center justify-center font-bold text-[10px] text-primary">
                                            {c.symbol.substring(0, 2)}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-semibold text-foreground tracking-tight">{c.symbol}</span>
                                            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium truncate max-w-[120px]">{c.name || c.symbol}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4 text-right font-mono text-sm font-medium">
                                    {(() => {
                                        const isUS = c.symbol.endsWith("-USD") || (c.symbol.includes(".") && !c.symbol.endsWith(".IS"));
                                        const currencySign = isUS ? "$" : "₺";
                                        const locale = isUS ? "en-US" : "tr-TR";
                                        return `${currencySign}${(c.last || 0).toLocaleString(locale, { minimumFractionDigits: 2 })}`;
                                    })()}
                                </TableCell>
                                <TableCell className="py-4 text-right">
                                    <div className={cn(
                                        "flex items-center justify-end gap-1 font-mono text-xs font-bold",
                                        (c.change_percent || 0) >= 0 ? "text-emerald-500" : "text-pink-500"
                                    )}>
                                        {(c.change_percent || 0) >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                        {Math.abs(c.change_percent || 0).toFixed(2)}%
                                    </div>
                                </TableCell>
                                <TableCell className="py-4 text-right font-mono text-xs text-muted-foreground">
                                    {c.volume ? (c.volume / 1e6).toFixed(1) + "M" : "---"}
                                </TableCell>
                                <TableCell className="py-4 text-center"><PerformanceBadge value={c.p1w} /></TableCell>
                                <TableCell className="py-4 text-center"><PerformanceBadge value={c.p1m} /></TableCell>
                                <TableCell className="py-4 text-center"><PerformanceBadge value={c.p3m} /></TableCell>
                                <TableCell className="py-4 text-center"><PerformanceBadge value={c.p6m} /></TableCell>
                                <TableCell className="py-4 text-right pr-6">
                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
