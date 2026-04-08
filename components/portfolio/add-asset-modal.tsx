"use client";

import * as React from "react";
import {
    Plus,
    Coins,
    Globe,
    Landmark,
    TrendingUp,
    AlertCircle,
    DollarSign,
    Search,
    X,
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
import { searchAssets, mapAssetTypeToSearch, type AssetSearchResult } from "@/services/asset.service";
import { toast } from "sonner";

interface AddAssetModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioId: string;
}

type AssetType = "all" | "stock" | "fx" | "crypto" | "commodity" | "fund" | "cash" | "gold";

interface AssetSuggestion {
    symbol: string;
    name: string;
    type: AssetType;
    market: string;
    price?: number;
    change?: number;
    currency?: string;
}

const ASSET_TYPES = [
    { id: "all" as AssetType, label: "HEPSİ", icon: Search },
    { id: "stock" as AssetType, label: "HİSSE / ENDEKS", icon: Landmark },
    { id: "fx" as AssetType, label: "DÖVİZ", icon: Globe },
    { id: "fund" as AssetType, label: "FON", icon: Landmark },
    { id: "crypto" as AssetType, label: "KRİPTO", icon: Coins },
    { id: "commodity" as AssetType, label: "EMTİA", icon: TrendingUp },
    { id: "cash" as AssetType, label: "NAKİT", icon: DollarSign },
];


export function AddAssetModal({
    open,
    onOpenChange,
    portfolioId,
}: AddAssetModalProps) {
    const addAsset = usePortfolioStore((state) => state.addAsset);
    const portfolioError = usePortfolioStore((state) => state.error);

    // Form State
    const [type, setType] = React.useState<AssetType>("all");
    const [symbol, setSymbol] = React.useState("");
    const [selectedAsset, setSelectedAsset] = React.useState<AssetSuggestion | null>(null);
    const [quantity, setQuantity] = React.useState("");

    // Details Settings
    const [avgCost, setAvgCost] = React.useState("");
    const [purchaseDate, setPurchaseDate] = React.useState({ day: "", month: "", year: "" });
    const [currency, setCurrency] = React.useState("TRY");

    // Search State
    const [searchResults, setSearchResults] = React.useState<AssetSuggestion[]>([]);
    const [showResults, setShowResults] = React.useState(false);
    const [isSearching, setIsSearching] = React.useState(false);
    const searchRef = React.useRef<HTMLDivElement>(null);

    // UI State
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Derived state
    const hasDate = purchaseDate.day && purchaseDate.month && purchaseDate.year;
    const isValid = selectedAsset && parseFloat(quantity) > 0 && hasDate;

    // Search logic - Use real API
    React.useEffect(() => {
        const performSearch = async () => {
            if (symbol.length >= 2) {
                setIsSearching(true);
                try {
                    const searchType = mapAssetTypeToSearch(type) as 'all' | 'indices' | 'fx' | 'crypto' | 'commodities' | 'funds';
                    const results = await searchAssets(symbol, searchType, 10);

                    // Convert API results to AssetSuggestion format
                    const suggestions: AssetSuggestion[] = results.map((result: AssetSearchResult) => {
                        // Map API type to frontend type
                        let frontendType: AssetType = 'stock';
                        if (result.type === 'forex') frontendType = 'fx';
                        if (result.type === 'crypto') frontendType = 'crypto';
                        if (result.type === 'commodity') frontendType = 'commodity';
                        if (result.type === 'fund') frontendType = 'fund';
                        if (result.type === 'stock') frontendType = 'stock';

                        return {
                            symbol: result.symbol,
                            name: result.name,
                            type: frontendType,
                            market: result.market,
                            price: result.price,
                            change: result.change,
                            currency: result.currency || (result.type === 'crypto' || result.type === 'commodity' || result.market === 'NASDAQ' || result.market === 'NYSE' ? 'USD' : 'TRY')
                        };
                    });

                    setSearchResults(suggestions);
                    setShowResults(true);
                } catch (error) {
                    console.error('Search error:', error);
                    setSearchResults([]);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        };

        const timeoutId = setTimeout(performSearch, 300); // Debounce
        return () => clearTimeout(timeoutId);
    }, [symbol, type]);

    // Auto-detect currency based on type
    React.useEffect(() => {
        if (type === "crypto" || type === "commodity" || type === "all") {
            // Keep current currency if all
        } else if (type === "fund") {
            setCurrency("TRY");
        } else {
            setCurrency(type === "fx" || type === "stock" ? "TRY" : "USD");
        }
    }, [type]);

    // Click outside to close search
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelectAsset = (asset: AssetSuggestion) => {
        setSelectedAsset(asset);
        setSymbol(asset.symbol);
        setType(asset.type); // Auto-set category
        setShowResults(false);
        if (asset.price) {
            setAvgCost(asset.price.toString());
        }
        if (asset.currency) {
            setCurrency(asset.currency);
        }
    };

    const handleClearSelection = () => {
        setSelectedAsset(null);
        setSymbol("");
        setAvgCost("");
        setType("all");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || !selectedAsset) return;

        setIsSubmitting(true);

        // Format Date: YYYY-MM-DD
        // Ensure leading zeros
        const day = purchaseDate.day.padStart(2, '0');
        const month = purchaseDate.month.padStart(2, '0');
        const year = purchaseDate.year;
        const formattedDate = `${year}-${month}-${day}T12:00:00Z`;

        try {
            const success = await addAsset(portfolioId, {
                symbol: selectedAsset.symbol,
                type: selectedAsset.type === 'all' ? type : selectedAsset.type,
                quantity: parseFloat(quantity),
                purchasePrice: avgCost ? parseFloat(avgCost) : selectedAsset.price || 0,
                purchaseDate: formattedDate,
                currency: currency
            });
            if (!success) {
                toast.error(portfolioError || "Varlik sepete eklenemedi.");
                return;
            }

            toast.success(`${selectedAsset.symbol} sepete eklendi.`);

            // Reset form
            setSymbol("");
            setSelectedAsset(null);
            setQuantity("");
            setAvgCost("");
            setPurchaseDate({ day: "", month: "", year: "" });
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSymbol("");
        setSelectedAsset(null);
        setQuantity("");
        setAvgCost("");
        setPurchaseDate({ day: "", month: "", year: "" });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px] bg-card border-border/50 p-0 overflow-hidden rounded-2xl">
                {/* HEADER */}
                <div className="px-6 py-5 border-b border-border/40 bg-muted/5">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary ring-4 ring-primary/5">
                            <Plus className="size-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-semibold tracking-tight">Yeni Varlık Ekle</DialogTitle>
                            <DialogDescription className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                                Portföyünüze detaylı varlık girişi yapın
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[80vh]">
                    <div className="space-y-6">
                        {/* 1. ASSET TYPE */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Varlık Türü</Label>
                                <span className="text-[10px] text-primary/60 font-medium">Otomatik seçilir</span>
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                                {ASSET_TYPES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setType(item.id)}
                                        className={cn(
                                            "flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all relative group h-14 justify-center",
                                            type === item.id
                                                ? "bg-primary/5 border-primary/40 text-primary"
                                                : "bg-background border-border/50 text-muted-foreground hover:bg-muted/20 hover:border-border"
                                        )}
                                    >
                                        <item.icon className="size-3.5" />
                                        <span className="text-[8px] font-bold uppercase tracking-tight text-center leading-tight">{item.label}</span>
                                        {type === item.id && (
                                            <div className="absolute top-1 right-1 size-1 rounded-full bg-primary" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. ASSET SELECTION */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Varlık</Label>
                            <div ref={searchRef} className="relative">
                                {selectedAsset ? (
                                    <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                                        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <span className="text-[10px] font-bold text-primary">{selectedAsset.market}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-foreground">{selectedAsset.symbol}</span>
                                                <span className={cn(
                                                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                    (selectedAsset.change || 0) >= 0 ? "text-emerald-600 bg-emerald-500/10" : "text-rose-600 bg-rose-500/10"
                                                )}>
                                                    {(selectedAsset.change || 0) >= 0 ? "+" : ""}{selectedAsset.change}%
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground truncate">{selectedAsset.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold tabular-nums text-foreground">
                                                {(() => {
                                                    const cur = selectedAsset.currency || currency;
                                                    const sym = cur === "TRY" ? "₺" : cur === "USD" ? "$" : cur === "EUR" ? "€" : "";
                                                    const loc = cur === "USD" ? "en-US" : "tr-TR";

                                                    if (selectedAsset.price === undefined || selectedAsset.price === null) {
                                                        return "---";
                                                    }

                                                    return `${sym}${selectedAsset.price.toLocaleString(loc, { minimumFractionDigits: 2 })}`;
                                                })()}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleClearSelection}
                                            className="size-7 rounded-lg hover:bg-background/50 flex items-center justify-center transition-colors ml-1"
                                        >
                                            <X className="size-3.5 text-muted-foreground" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Sembol veya isim ile arayın..."
                                                value={symbol}
                                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                                className="h-11 bg-muted/20 border-border/50 rounded-xl pl-10 pr-4 font-medium text-sm focus-visible:ring-primary/20 transition-all"
                                                autoComplete="off"
                                            />
                                        </div>
                                        {isSearching && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl z-50 p-4 text-center">
                                                <p className="text-xs text-muted-foreground">Aranıyor...</p>
                                            </div>
                                        )}
                                        {!isSearching && showResults && searchResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                                                {searchResults.map((asset) => (
                                                    <button
                                                        key={asset.symbol}
                                                        type="button"
                                                        onClick={() => handleSelectAsset(asset)}
                                                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                                                    >
                                                        <div className="size-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                                                            <span className="text-[8px] font-bold text-muted-foreground">{asset.market}</span>
                                                        </div>
                                                        <div className="flex-1 text-left min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium">{asset.symbol}</span>
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground truncate">{asset.name}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {!isSearching && showResults && searchResults.length === 0 && symbol.length >= 2 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl z-50 p-4 text-center">
                                                <p className="text-xs text-muted-foreground">Sonuç bulunamadı</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 3. ROW: QUANTITY & PRICE */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Miktar</Label>
                                <Input
                                    type="number"
                                    step="0.00001"
                                    placeholder="0.00"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                    Alım Fiyatı
                                    <span className="text-[9px] normal-case text-muted-foreground/60">(Birim)</span>
                                </Label>
                                <Input
                                    type="number"
                                    step="0.00000001"
                                    placeholder={selectedAsset?.price ? `Ort: ${selectedAsset.price}` : "0.00"}
                                    value={avgCost}
                                    onChange={(e) => setAvgCost(e.target.value)}
                                    className="h-11 bg-muted/20 border-border/50 rounded-xl px-4 font-medium text-sm focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>

                        {/* 4. ROW: DATE & CURRENCY */}
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
                                        OTOMATİK
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* VALIDATION WARNINGS */}
                        {selectedAsset && !quantity && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                <AlertCircle className="size-4 text-amber-500 shrink-0" />
                                <p className="text-[10px] font-medium text-amber-600">Devam etmek için miktar girin</p>
                            </div>
                        )}
                        {selectedAsset && quantity && !hasDate && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                <AlertCircle className="size-4 text-amber-500 shrink-0" />
                                <p className="text-[10px] font-medium text-amber-600">Alım tarihi girmek zorunludur</p>
                            </div>
                        )}
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-3 pt-6 mt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleClose}
                            className="flex-1 h-12 rounded-xl font-medium text-xs uppercase tracking-widest hover:bg-muted/50"
                        >
                            İptal
                        </Button>
                        <Button
                            type="submit"
                            className="flex-[2] h-12 rounded-xl font-bold text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "İşleniyor..." : "Varlığı Ekle"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
