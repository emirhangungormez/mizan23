"use client";

import * as React from "react";
import { Calendar, PencilLine, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchAssets, type AssetSearchResult } from "@/services/asset.service";
import { usePortfolioStore, type Portfolio, type Transaction } from "@/store/portfolio-store";
import type { PortfolioAssetType, PortfolioTransactionType } from "@/services/portfolio.service";

type SearchSelection = {
  symbol: string;
  name: string;
  type: PortfolioAssetType;
  market: string;
  currency?: string;
  price?: number;
};

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolio: Portfolio | null;
  transaction?: Transaction | null;
  defaultType?: PortfolioTransactionType;
  defaultSymbol?: string | null;
}

function mapSearchType(type: AssetSearchResult["type"]): PortfolioAssetType {
  if (type === "forex") return "fx";
  if (type === "commodity") return "commodity";
  return type;
}

function toSelection(result: AssetSearchResult): SearchSelection {
  return {
    symbol: result.symbol,
    name: result.name,
    type: mapSearchType(result.type),
    market: result.market,
    currency: result.currency,
    price: result.price,
  };
}

function formatDateInput(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function TransactionModal({
  open,
  onOpenChange,
  portfolio,
  transaction,
  defaultType = "buy",
  defaultSymbol,
}: TransactionModalProps) {
  const addTransaction = usePortfolioStore((state) => state.addTransaction);
  const updateTransaction = usePortfolioStore((state) => state.updateTransaction);

  const [transactionType, setTransactionType] = React.useState<PortfolioTransactionType>(defaultType);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(searchQuery);
  const [selectedAsset, setSelectedAsset] = React.useState<SearchSelection | null>(null);
  const [results, setResults] = React.useState<SearchSelection[]>([]);
  const [showResults, setShowResults] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [quantity, setQuantity] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);

  const holdingsMap = React.useMemo(() => {
    return Object.fromEntries((portfolio?.assets || []).map((asset) => [asset.symbol, asset]));
  }, [portfolio]);

  const availableQuantity = selectedAsset ? holdingsMap[selectedAsset.symbol]?.quantity || 0 : 0;

  React.useEffect(() => {
    if (!open) return;

    const fallbackAsset = defaultSymbol ? holdingsMap[defaultSymbol] : null;
    const baseSelection = transaction
      ? {
          symbol: transaction.symbol,
          name: transaction.asset_name || transaction.symbol,
          type: transaction.asset_type || fallbackAsset?.type || "stock",
          market: transaction.market || fallbackAsset?.market || "PORTFOLIO",
          currency: transaction.currency || fallbackAsset?.currency || "TRY",
          price: transaction.price ?? transaction.sell_price ?? transaction.buy_price,
        }
      : fallbackAsset
        ? {
            symbol: fallbackAsset.symbol,
            name: fallbackAsset.name || fallbackAsset.symbol,
            type: fallbackAsset.type,
            market: fallbackAsset.market || "PORTFOLIO",
            currency: fallbackAsset.currency || "TRY",
            price: fallbackAsset.avg_price || fallbackAsset.avgPrice,
          }
        : null;

    setTransactionType(transaction?.type || defaultType);
    setSelectedAsset(baseSelection);
    setSearchQuery(baseSelection?.symbol || "");
    setQuantity(transaction ? String(transaction.quantity) : "");
    setPrice(
      transaction
        ? String(transaction.price ?? transaction.sell_price ?? transaction.buy_price ?? "")
        : baseSelection?.price != null
          ? String(baseSelection.price)
          : ""
    );
    setDate(formatDateInput(transaction?.date || transaction?.sell_date || transaction?.buy_date) || new Date().toISOString().slice(0, 10));
    setNote(transaction?.note || "");
    setResults([]);
    setShowResults(false);
  }, [open, transaction, defaultType, defaultSymbol, holdingsMap]);

  // Auto-fill price when asset or transaction type changes
  React.useEffect(() => {
    if (selectedAsset?.price != null && !transaction) {
      setPrice(String(selectedAsset.price));
    }
  }, [selectedAsset, transactionType, transaction]);

  // Handle outside click for search results
  React.useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  React.useEffect(() => {
    let isActive = true;

    async function runSearch() {
      if (!open || selectedAsset || deferredQuery.trim().length < 2) {
        if (deferredQuery.trim().length < 2) {
          setResults([]);
          setShowResults(false);
        }
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await searchAssets(deferredQuery.trim(), "all", 12);
        if (!isActive) return;
        setResults(searchResults.map(toSelection));
        setShowResults(true);
      } catch {
        if (isActive) {
          setResults([]);
          setShowResults(true);
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }

    const timeout = setTimeout(runSearch, 220);
    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [deferredQuery, open, selectedAsset]);

  const handleSelect = (asset: SearchSelection) => {
    setSelectedAsset(asset);
    setSearchQuery(asset.symbol);
    setPrice((current) => current || (asset.price != null ? String(asset.price) : ""));
    setShowResults(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const isValid =
    !!portfolio &&
    !!selectedAsset &&
    Number(quantity) > 0 &&
    Number(price) > 0 &&
    !!date &&
    (transactionType === "buy" || Number(quantity) <= availableQuantity + 1e-8);

    const submitLabel = transaction
    ? "İşlemi Güncelle"
    : transactionType === "buy"
      ? "Alım İşlemini Kaydet"
      : "Satış İşlemini Kaydet";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!portfolio || !selectedAsset) return;

    if (transactionType === "sell" && Number(quantity) > availableQuantity + 1e-8) {
      toast.error("Satış miktarı mevcut pozisyondan büyük olamaz.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      symbol: selectedAsset.symbol,
      type: transactionType,
      quantity: Number(quantity),
      price: Number(price),
      date: `${date}T12:00:00Z`,
      market: selectedAsset.market || holdingsMap[selectedAsset.symbol]?.market,
      currency: selectedAsset.currency || holdingsMap[selectedAsset.symbol]?.currency || "TRY",
      assetType: selectedAsset.type,
      assetName: selectedAsset.name,
      note: note.trim() || undefined,
    } as const;

    const success = transaction
      ? await updateTransaction(portfolio.id, transaction.id, payload)
      : await addTransaction(portfolio.id, payload);

    setIsSubmitting(false);

    if (!success) {
      toast.error("İşlem kaydedilemedi.");
      return;
    }

    toast.success(transaction ? "İşlem güncellendi." : "İşlem kaydedildi.");
    handleClose();
  };

  const accentClass = transactionType === "buy" ? "text-emerald-600" : "text-amber-600";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden border-border bg-card p-0 shadow-none">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn("flex size-10 items-center justify-center rounded-lg border bg-background", accentClass)}>
                {transaction ? <PencilLine className="size-4.5" /> : transactionType === "buy" ? <TrendingUp className="size-4.5" /> : <TrendingDown className="size-4.5" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {transaction ? "İşlemi Düzenle" : transactionType === "buy" ? "Yeni Alım İşlemi" : "Yeni Satış İşlemi"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Sepet işlem defterine kayıt ekleyin. Pozisyonlar otomatik olarak bu kayıtlardan türetilir.
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">İşlem Türü</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransactionType("buy")}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    transactionType === "buy" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="text-sm font-semibold">Alım</div>
                  <div className="mt-1 text-xs text-muted-foreground">Pozisyonu artır</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionType("sell")}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    transactionType === "sell" ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="text-sm font-semibold">Satış</div>
                  <div className="mt-1 text-xs text-muted-foreground">Gerçekleşen K/Z kaydı</div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Varlık Arama</Label>
              <div ref={searchRef} className="relative">
                {selectedAsset ? (
                  <div className="flex min-h-12 items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">{selectedAsset.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedAsset.symbol} - {selectedAsset.market}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setSelectedAsset(null);
                        setSearchQuery("");
                        setResults([]);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Hisse adı veya sembol..."
                      className="h-12 rounded-lg border-border pl-10"
                    />
                    {(showResults || isSearching) && (
                      <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 rounded-lg border border-border bg-popover shadow-none">
                        {isSearching ? (
                          <div className="px-4 py-3 text-sm text-muted-foreground">Aranıyor...</div>
                        ) : results.length > 0 ? (
                          results.map((asset) => (
                            <button
                              key={`${asset.symbol}-${asset.market}`}
                              type="button"
                              onClick={() => handleSelect(asset)}
                              className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted"
                            >
                              <div>
                                <div className="text-sm font-medium">{asset.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {asset.symbol} - {asset.market}
                                </div>
                              </div>
                              {asset.price != null && (
                                <div className="text-sm font-medium tabular-nums">{asset.price.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</div>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-muted-foreground">Eşleşen varlık bulunamadı</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tx-quantity" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Miktar / Adet
              </Label>
              <Input
                id="tx-quantity"
                type="number"
                step="0.00001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="h-11 rounded-lg"
              />
              {transactionType === "sell" && selectedAsset && (
                <div className="text-xs text-muted-foreground">Mevcut: {availableQuantity.toLocaleString("tr-TR")}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-price" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Birim Fiyat
              </Label>
              <Input
                id="tx-price"
                type="number"
                step="0.00000001"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-date" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Tarih
              </Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-11 rounded-lg pl-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-note" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Not (İsteğe Bağlı)
            </Label>
            <textarea
              id="tx-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="İşlemle ilgili not alabilirsiniz..."
              className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tahmini Toplam</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {(Number(quantity || 0) * Number(price || 0)).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{selectedAsset?.currency || "TRY"}</div>
                {transactionType === "sell" && selectedAsset && (
                  <div className="mt-1">
                    Satış sonrası kalan: {Math.max(availableQuantity - Number(quantity || 0), 0).toLocaleString("tr-TR")}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" onClick={handleClose}>
              İptal
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Kaydediliyor..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
