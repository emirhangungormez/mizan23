"use client";

import * as React from "react";
import {
    Edit3,
} from "lucide-react";
import { usePortfolioStore } from "@/store/portfolio-store";
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

interface EditAssetModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioId: string;
    asset: PortfolioAsset | null;
}

const CURRENCIES = [
    { code: "TRY", symbol: "₺", name: "Türk Lirası" },
    { code: "USD", symbol: "$", name: "ABD Doları" },
    { code: "EUR", symbol: "€", name: "Euro" },
];

export function EditAssetModal({
    open,
    onOpenChange,
    portfolioId,
    asset,
}: EditAssetModalProps) {
    const { portfolios, updatePortfolioAssets } = usePortfolioStore();

    // Form State
    const [quantity, setQuantity] = React.useState("");
    const [avgCost, setAvgCost] = React.useState("");
    const [purchaseDate, setPurchaseDate] = React.useState({ day: "", month: "", year: "" });
    const [currency, setCurrency] = React.useState("TRY");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Initialize form when asset changes
    React.useEffect(() => {
        if (asset && open) {
            setQuantity(asset.quantity.toString());
            setAvgCost((asset.avg_price || asset.avgPrice || 0).toString());
            setCurrency(asset.currency || "TRY");

            if (asset.purchase_date) {
                const date = new Date(asset.purchase_date);
                if (!isNaN(date.getTime())) {
                    setPurchaseDate({
                        day: date.getDate().toString().padStart(2, '0'),
                        month: (date.getMonth() + 1).toString().padStart(2, '0'),
                        year: date.getFullYear().toString()
                    });
                }
            }
        }
    }, [asset, open]);

    const isValid = parseFloat(quantity) > 0 && purchaseDate.day && purchaseDate.month && purchaseDate.year;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || !asset) return;

        setIsSubmitting(true);

        const day = purchaseDate.day.padStart(2, '0');
        const month = purchaseDate.month.padStart(2, '0');
        const year = purchaseDate.year;
        const formattedDate = `${year}-${month}-${day}T12:00:00Z`;

        const portfolio = portfolios.find(p => p.id === portfolioId);
        if (!portfolio) {
            setIsSubmitting(false);
            return;
        }

        const updatedAssets = portfolio.assets.map(a => {
            if (a.symbol === asset.symbol) {
                return {
                    ...a,
                    quantity: parseFloat(quantity),
                    avg_price: parseFloat(avgCost),
                    avgPrice: parseFloat(avgCost),
                    purchase_date: formattedDate,
                    currency: currency
                };
            }
            return a;
        });

        const success = await updatePortfolioAssets(portfolioId, updatedAssets);

        if (success) {
            toast.success(`${asset.symbol} başarıyla güncellendi`);
            onOpenChange(false);
        } else {
            toast.error("Güncelleme sırasında bir hata oluştu");
        }

        setIsSubmitting(false);
    };

    if (!asset) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-card border-border/50 p-0 overflow-hidden rounded-2xl shadow-2xl">
                {/* HEADER */}
                <div className="px-6 py-5 border-b border-border/40 bg-muted/5">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary ring-4 ring-primary/5">
                            <Edit3 className="size-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-semibold tracking-tight">{asset.symbol} Düzenle</DialogTitle>
                            <DialogDescription className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                                Varlık detaylarını güncelleyin
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-6">
                        {/* 1. QUANTITY & PRICE */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Miktar</Label>
                                <Input
                                    type="number"
                                    step="0.00001"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Birim Maliyet</Label>
                                <Input
                                    type="number"
                                    step="0.00000001"
                                    value={avgCost}
                                    onChange={(e) => setAvgCost(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>

                        {/* 2. DATE & CURRENCY */}
                        <div className="grid grid-cols-5 gap-4">
                            <div className="col-span-3 space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Alım Tarihi</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    <Input
                                        placeholder="GG"
                                        maxLength={2}
                                        value={purchaseDate.day}
                                        onChange={(e) => setPurchaseDate(prev => ({ ...prev, day: e.target.value.replace(/\D/g, '') }))}
                                        className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                    />
                                    <Input
                                        placeholder="AA"
                                        maxLength={2}
                                        value={purchaseDate.month}
                                        onChange={(e) => setPurchaseDate(prev => ({ ...prev, month: e.target.value.replace(/\D/g, '') }))}
                                        className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                    />
                                    <Input
                                        placeholder="YYYY"
                                        maxLength={4}
                                        value={purchaseDate.year}
                                        onChange={(e) => setPurchaseDate(prev => ({ ...prev, year: e.target.value.replace(/\D/g, '') }))}
                                        className="h-11 bg-muted/20 border-border/50 rounded-xl px-2 text-center text-sm font-medium focus-visible:ring-primary/20"
                                    />
                                </div>
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Para Birimi</Label>
                                <div className="h-11 bg-muted/10 border border-border/20 rounded-xl px-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-md bg-background border border-border/50 flex items-center justify-center text-xs font-bold">
                                            {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'}
                                        </div>
                                        <span className="text-sm font-semibold">{currency}</span>
                                    </div>
                                    <div className="text-[10px] font-medium text-muted-foreground bg-muted/20 px-2 py-1 rounded">
                                        SABİT
                                    </div>
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
                            className="flex-[2] h-12 rounded-xl font-bold text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
