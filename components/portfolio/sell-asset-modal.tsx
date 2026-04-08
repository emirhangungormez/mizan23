"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PortfolioAsset } from "@/services/portfolio.service";
import { usePortfolioStore } from "@/store/portfolio-store";
import { Coins, AlertCircle } from "lucide-react";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";

interface SellAssetModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioId: string;
    asset: PortfolioAsset | null;
}

export function SellAssetModal({
    open,
    onOpenChange,
    portfolioId,
    asset,
}: SellAssetModalProps) {
    const { sellAsset } = usePortfolioStore();
    const { liveQuotes } = usePerformanceCalculator([]);

    // Form State
    const [quantity, setQuantity] = React.useState("");
    const [sellPrice, setSellPrice] = React.useState("");
    const [sellDate, setSellDate] = React.useState({ day: "", month: "", year: "" });
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Initialize form when asset changes
    React.useEffect(() => {
        if (asset && open) {
            setQuantity(asset.quantity.toString());

            // Get current price if available, otherwise 0
            const currentPrice = liveQuotes[asset.symbol]?.last || 0;
            setSellPrice(currentPrice > 0 ? currentPrice.toString() : "");

            const now = new Date();
            setSellDate({
                day: now.getDate().toString().padStart(2, '0'),
                month: (now.getMonth() + 1).toString().padStart(2, '0'),
                year: now.getFullYear().toString()
            });
        }
    }, [asset, open, liveQuotes]);

    const isValid = parseFloat(quantity) > 0 && parseFloat(sellPrice) > 0 && sellDate.day && sellDate.month && sellDate.year;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || !asset) return;

        // Validation: Cannot sell more than owned
        if (parseFloat(quantity) > asset.quantity) {
            toast.error("Sahip olduğunuz miktardan fazlasını satamazsınız");
            return;
        }

        setIsSubmitting(true);

        const day = sellDate.day.padStart(2, '0');
        const month = sellDate.month.padStart(2, '0');
        const year = sellDate.year;
        const formattedDate = `${year}-${month}-${day}T12:00:00Z`;

        const success = await sellAsset(portfolioId, {
            symbol: asset.symbol,
            quantity: parseFloat(quantity),
            sell_price: parseFloat(sellPrice),
            sell_date: formattedDate
        });

        if (success) {
            toast.success(`${asset.symbol} satışı gerçekleşti`);
            onOpenChange(false);
        } else {
            toast.error("Satış işlemi sırasında bir hata oluştu");
        }

        setIsSubmitting(false);
    };

    if (!asset) return null;

    // Calculate estimated total and P/L for preview
    const estTotal = parseFloat(quantity || "0") * parseFloat(sellPrice || "0");
    const costBasis = (asset.avg_price || 0) * parseFloat(quantity || "0");
    const estPnl = estTotal - costBasis;
    const estPnlPct = costBasis > 0 ? (estPnl / costBasis) * 100 : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] bg-card border-border/50 p-0 overflow-hidden rounded-2xl shadow-2xl">
                {/* HEADER */}
                <div className="px-6 py-5 border-b border-border/40 bg-muted/5">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 ring-4 ring-amber-500/5">
                            <Coins className="size-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-semibold tracking-tight">{asset.symbol} Satış İşlemi</DialogTitle>
                            <DialogDescription className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                                Pozisyon kapatma veya kar realizasyonu
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-6">
                        {/* 1. QUANTITY & PRICE */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satılacak Miktar</Label>
                                <Input
                                    type="number"
                                    step="0.00001"
                                    max={asset.quantity}
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                                <div className="text-[10px] text-right text-muted-foreground">
                                    Mevcut: <span className="font-bold text-foreground">{asset.quantity}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satış Fiyatı</Label>
                                <Input
                                    type="number"
                                    step="0.00000001"
                                    value={sellPrice}
                                    onChange={(e) => setSellPrice(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                                <div className="text-[10px] text-right text-muted-foreground">
                                    Para Birimi: <span className="font-bold text-foreground">{asset.currency || "TRY"}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. DATE */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satış Tarihi</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Input
                                    placeholder="GG"
                                    maxLength={2}
                                    value={sellDate.day}
                                    onChange={(e) => setSellDate(prev => ({ ...prev, day: e.target.value.replace(/\D/g, '') }))}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                />
                                <Input
                                    placeholder="AA"
                                    maxLength={2}
                                    value={sellDate.month}
                                    onChange={(e) => setSellDate(prev => ({ ...prev, month: e.target.value.replace(/\D/g, '') }))}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                />
                                <Input
                                    placeholder="YYYY"
                                    maxLength={4}
                                    value={sellDate.year}
                                    onChange={(e) => setSellDate(prev => ({ ...prev, year: e.target.value.replace(/\D/g, '') }))}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>

                        {/* PREVIEW */}
                        <div className="rounded-xl bg-muted/20 p-4 space-y-3 border border-border/40">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Tahmini Tutar</span>
                                <span className="font-bold">{asset.currency === 'USD' ? '$' : asset.currency === 'EUR' ? '€' : '₺'}{estTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Tahmini K/Z</span>
                                <div className={cn("font-bold", estPnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                    {estPnl >= 0 ? "+" : ""}{asset.currency === 'USD' ? '$' : asset.currency === 'EUR' ? '€' : '₺'}{estPnl.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    <span className="ml-1 opacity-80">({estPnlPct >= 0 ? "+" : ""}%{estPnlPct.toFixed(2)})</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-3 pt-6 mt-4">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 h-12 rounded-xl font-medium text-xs uppercase tracking-widest hover:bg-muted/50"
                        >
                            İptal
                        </Button>
                        <Button
                            type="submit"
                            className="flex-[2] h-12 rounded-xl font-bold text-xs uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "İşleniyor..." : "Satışı Onayla"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
