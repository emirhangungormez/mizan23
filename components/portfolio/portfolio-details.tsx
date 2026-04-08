"use client";

import { usePortfolioStore, useActivePortfolio } from "@/store/portfolio-store";
import { Plus, Trash2, Info, LayoutGrid, List, Activity, Wallet, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddAssetModal } from "./add-asset-modal";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export function PortfolioDetails() {
    const activePortfolio = useActivePortfolio();
    const { removeAsset } = usePortfolioStore();
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Always call hook with empty array fallback to satisfy Rules of Hooks
    const portfolioArray = useMemo(() =>
        activePortfolio ? [activePortfolio] : [],
        [activePortfolio]
    );

    const {
        displayCurrency,
        currencySymbol,
        locale,
        normalizeToTRY,
        convertToDisplay,
        getDataItem,
        liveQuotes,
        getAssetCurrency,
        totalValue
    } = usePerformanceCalculator(portfolioArray);

    // Cost basis calculation - must be called before early return
    const costBasis = useMemo(() => {
        if (!activePortfolio) return 0;
        const totalTRY = activePortfolio.assets.reduce((sum, a) => {
            const live = liveQuotes[a.symbol];
            const item = getDataItem(a.symbol);
            const assetCurrency = getAssetCurrency(a, live, item);
            return sum + (a.quantity * normalizeToTRY(a.avgPrice || 0, assetCurrency));
        }, 0);
        return convertToDisplay(totalTRY);
    }, [activePortfolio, liveQuotes, getDataItem, getAssetCurrency, normalizeToTRY, convertToDisplay]);

    // Early return AFTER all hooks
    if (!activePortfolio) return null;

    return (
        <div className="space-y-8 pb-12">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Wallet className="size-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight uppercase text-foreground">
                            {activePortfolio.name}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.15em] opacity-60">
                                {activePortfolio.description || "Stratejik Varlık Analiz Merkezi"}
                            </span>
                            <div className="size-1 rounded-full bg-border" />
                            <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
                                Aktif İzleme
                            </span>
                        </div>
                    </div>
                </div>
                <Button
                    onClick={() => setIsAddOpen(true)}
                    className="h-11 px-8 gap-2 text-xs font-bold uppercase tracking-widest rounded-xl bg-primary text-primary-foreground hover:opacity-90 shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                >
                    <Plus className="size-4" strokeWidth={3} /> VARLIK EKLE
                </Button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(() => {
                    // Calculate portfolio age
                    const createdDate = new Date(activePortfolio.created_at);
                    const now = new Date();
                    const diffMs = now.getTime() - createdDate.getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                    let ageLabel = "";
                    if (diffDays === 0) {
                        ageLabel = "Bugün";
                    } else if (diffDays === 1) {
                        ageLabel = "1 Gün";
                    } else if (diffDays < 30) {
                        ageLabel = `${diffDays} Gün`;
                    } else if (diffDays < 365) {
                        const months = Math.floor(diffDays / 30);
                        ageLabel = months === 1 ? "1 Ay" : `${months} Ay`;
                    } else {
                        const years = Math.floor(diffDays / 365);
                        const remainingMonths = Math.floor((diffDays % 365) / 30);
                        ageLabel = years === 1 ? "1 Yıl" : `${years} Yıl`;
                        if (remainingMonths > 0) ageLabel += ` ${remainingMonths} Ay`;
                    }

                    return [
                        { label: "Toplam Hacim", value: `${currencySymbol}${totalValue.toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}`, icon: Activity, color: "text-primary", bg: "bg-primary/5" },
                        { label: "Aktif Pozisyonlar", value: `${activePortfolio.assets.length} Adet`, icon: List, color: "text-purple-500", bg: "bg-purple-500/5" },
                        { label: "Sepet Yaşı", value: ageLabel, icon: PieChart, color: "text-blue-500", bg: "bg-blue-500/5" },
                    ].map((stat, i) => (
                        <div key={i} className="bg-card/50 border rounded-xl p-5 flex items-center gap-4 group hover:border-primary/30 transition-all">
                            <div className={cn("size-10 rounded-lg flex items-center justify-center border", stat.bg, stat.color, "border-current/10")}>
                                <stat.icon className="size-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                                <p className="text-lg font-bold font-mono tracking-tight mt-0.5">{stat.value}</p>
                            </div>
                        </div>
                    ));
                })()}
            </div>

            {/* Asset Table Section */}
            <div className="rounded-2xl border border-border/40 bg-card/80 overflow-hidden">
                <div className="px-6 py-5 border-b border-border/40 flex items-center justify-between bg-zinc-500/5">
                    <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg border border-primary/20 bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <LayoutGrid className="size-4" />
                        </div>
                        <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Piyasa Pozisyonları</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Canlı Senkronizasyon</span>
                    </div>
                </div>

                {activePortfolio.assets.length === 0 ? (
                    <div className="p-24 flex flex-col items-center justify-center text-center">
                        <div className="size-20 bg-muted/20 rounded-3xl border border-border/50 flex items-center justify-center mb-6 shadow-inner">
                            <Plus className="size-8 text-muted-foreground/30" />
                        </div>
                        <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-2 text-foreground/80">Varlık Bulunamadı</h3>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60 max-w-xs leading-relaxed">
                            Portföyünüze varlık ekleyerek risk skorlarını ve getiri analizlerini anlık takip edin.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border/50 hover:bg-transparent bg-muted/20">
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 pl-6">SEMBOLLER</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">TÜR</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">MALİYET</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">MİKTAR</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">PİYASA FİYATI</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">GÜNCEL DEĞER</TableHead>
                                    <TableHead className="h-12 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 text-right pr-6">AKSİYON</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activePortfolio.assets.map((asset) => (
                                    <TableRow key={asset.symbol} className="border-border/30 hover:bg-muted/10 transition-colors group h-16">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-[10px] text-muted-foreground group-hover:border-primary/50 group-hover:text-primary transition-all">
                                                    {asset.symbol.substring(0, 2)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold tracking-tight uppercase group-hover:text-primary transition-colors">{asset.symbol}</span>
                                                    {(() => {
                                                        const live = liveQuotes[asset.symbol];
                                                        const item = getDataItem(asset.symbol);
                                                        const currentPrice = live?.last || item?.last || 0;
                                                        const purchasePrice = asset.avgPrice || asset.avg_price || 0;

                                                        if (currentPrice === 0 || purchasePrice === 0) {
                                                            // Show purchase date if no price data
                                                            const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : null;
                                                            if (purchaseDate) {
                                                                const diffMs = Date.now() - purchaseDate.getTime();
                                                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                                                return (
                                                                    <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-tighter">
                                                                        {diffDays === 0 ? "Bugün eklendi" : diffDays === 1 ? "1 gün önce" : `${diffDays} gün önce`}
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        }

                                                        const pnlPct = ((currentPrice - purchasePrice) / purchasePrice) * 100;
                                                        const isProfit = pnlPct >= 0;

                                                        return (
                                                            <span className={cn(
                                                                "text-[9px] font-bold uppercase tracking-tighter",
                                                                isProfit ? "text-emerald-500/70" : "text-red-500/70"
                                                            )}>
                                                                {isProfit ? "+" : ""}{pnlPct.toFixed(2)}% {isProfit ? "Kâr" : "Zarar"}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground py-1 px-2.5 border border-border/50 rounded-lg bg-muted/20">
                                                {asset.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs font-bold text-foreground/80">
                                            {(() => {
                                                const live = liveQuotes[asset.symbol];
                                                const item = getDataItem(asset.symbol);
                                                const assetCurrency = getAssetCurrency(asset, live, item);
                                                const assetSymbol = assetCurrency === 'USD' ? '$' : '₺';
                                                const assetLocale = assetCurrency === 'USD' ? 'en-US' : 'tr-TR';
                                                return `${assetSymbol}${(asset.avgPrice || 0).toLocaleString(assetLocale, { minimumFractionDigits: 2 })}`;
                                            })()}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs font-bold text-foreground/80">
                                            {asset.quantity}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs font-bold text-foreground/80">
                                            {(() => {
                                                const live = liveQuotes[asset.symbol];
                                                const item = getDataItem(asset.symbol);
                                                const currentPrice = live?.last || item?.last || 0;
                                                const assetCurrency = getAssetCurrency(asset, live, item);
                                                const assetSymbol = assetCurrency === 'USD' ? '$' : '₺';
                                                const assetLocale = assetCurrency === 'USD' ? 'en-US' : 'tr-TR';

                                                if (currentPrice === 0) return <span className="text-muted-foreground/40 italic">-</span>;
                                                return `${assetSymbol}${currentPrice.toLocaleString(assetLocale, { minimumFractionDigits: 2 })}`;
                                            })()}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm font-bold text-foreground">
                                            {(() => {
                                                const live = liveQuotes[asset.symbol];
                                                const item = getDataItem(asset.symbol);
                                                const currentPrice = live?.last || item?.last || 0;
                                                const assetCurrency = getAssetCurrency(asset, live, item);
                                                const assetSymbol = assetCurrency === 'USD' ? '$' : '₺';
                                                const assetLocale = assetCurrency === 'USD' ? 'en-US' : 'tr-TR';

                                                if (currentPrice === 0) return <span className="text-muted-foreground/40 italic">-</span>;
                                                return `${assetSymbol}${(asset.quantity * currentPrice).toLocaleString(assetLocale, { minimumFractionDigits: 2 })}`;
                                            })()}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeAsset(activePortfolio.id, asset.symbol)}
                                                className="size-9 rounded-lg text-muted-foreground/30 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <div className="px-6 py-5 bg-muted/30 border-t border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Info className="size-3.5 text-primary/60" />
                        <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/60">
                            Varlıklar BIST ve Küresel verilerle her 60 saniyede bir güncellenir.
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Toplam Maliyet</span>
                            <span className="text-sm font-mono text-muted-foreground/80 font-bold uppercase tracking-tighter">
                                {currencySymbol}{costBasis.toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Toplam Değerleme</span>
                            <span className="text-lg font-mono text-primary font-bold uppercase tracking-tighter">
                                {currencySymbol}{totalValue.toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <AddAssetModal
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                portfolioId={activePortfolio.id}
            />
        </div>
    );
}
