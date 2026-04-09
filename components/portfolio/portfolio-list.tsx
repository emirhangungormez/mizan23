"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { FolderPlus, GripHorizontal, Layers, PencilLine, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import { cn } from "@/lib/utils";
import { usePortfolioStore, type Portfolio as PortfolioType } from "@/store/portfolio-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Shared context type passed down from the single top-level calculator
interface SharedCalcContext {
  liveQuotes: ReturnType<typeof usePerformanceCalculator>["liveQuotes"];
  periodChanges: ReturnType<typeof usePerformanceCalculator>["periodChanges"];
  isSelectedTimeframeReady: ReturnType<typeof usePerformanceCalculator>["isSelectedTimeframeReady"];
  getDataItem: ReturnType<typeof usePerformanceCalculator>["getDataItem"];
  getAssetCurrency: ReturnType<typeof usePerformanceCalculator>["getAssetCurrency"];
  normalizeToTRY: ReturnType<typeof usePerformanceCalculator>["normalizeToTRY"];
  displayCurrency: ReturnType<typeof usePerformanceCalculator>["displayCurrency"];
  selectedTimeframe: ReturnType<typeof usePerformanceCalculator>["selectedTimeframe"];
  usdRate: number;
}

type MarketDataSnapshot = {
  change_percent?: number;
  p1w?: number;
  p1m?: number;
  p1y?: number;
  p5y?: number;
  return_ytd?: number;
};

export function PortfolioList() {
  const { portfolios, deletePortfolio, renamePortfolio } = usePortfolioStore();
  const [orderedPortfolios, setOrderedPortfolios] = useState(portfolios);
  const [mounted, setMounted] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // ─── SINGLE shared calculator for ALL portfolios ───────────────────────────
  const sharedCalc = usePerformanceCalculator(portfolios);
  // ──────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, name: string) => {
    try {
      const success = await deletePortfolio(id);
      if (success) {
        toast.success(`${name} sepeti başarıyla silindi`);
      } else {
        toast.error(`${name} sepeti silinirken bir hata oluştu`);
      }
    } catch {
      toast.error("İşlem sırasında beklenmedik bir hata oluştu");
    } finally {
      setDeleteId(null);
    }
  };

  useEffect(() => {
    setOrderedPortfolios((prevOrdered) => {
      const prevIds = new Set(prevOrdered.map((p) => p.id));
      const newIds = new Set(portfolios.map((p) => p.id));
      const existingItems = prevOrdered
        .filter((p) => newIds.has(p.id))
        .map((p) => portfolios.find((np) => np.id === p.id)!)
        .filter(Boolean);
      const newItems = portfolios.filter((p) => !prevIds.has(p.id));
      return [...existingItems, ...newItems];
    });
  }, [portfolios]);

  useEffect(() => {
    setMounted(true);
    const savedOrder = localStorage.getItem("portfolio_order");
    if (!savedOrder) return;
    const orderIds = JSON.parse(savedOrder) as string[];
    setOrderedPortfolios((current) =>
      [...current].sort((a, b) => {
        const ia = orderIds.indexOf(a.id);
        const ib = orderIds.indexOf(b.id);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    );
  }, []);

  const handleReorder = (newOrder: typeof portfolios) => {
    setOrderedPortfolios(newOrder);
    localStorage.setItem("portfolio_order", JSON.stringify(newOrder.map((p) => p.id)));
  };

  const selectedRenamePortfolio = renameId ? portfolios.find((item) => item.id === renameId) || null : null;

  const handleRename = async () => {
    if (!renameId) return;

    const nextName = renameName.trim();
    if (!nextName) {
      toast.error("Sepet ismi bos olamaz.");
      return;
    }

    setIsRenaming(true);
    try {
      const success = await renamePortfolio(renameId, nextName);
      if (success) {
        toast.success("Sepet ismi guncellendi.");
        setRenameId(null);
        setRenameName("");
      } else {
        toast.error("Sepet ismi guncellenemedi.");
      }
    } catch {
      toast.error("Sepet ismi guncellenirken beklenmedik bir hata olustu.");
    } finally {
      setIsRenaming(false);
    }
  };

  if (portfolios.length === 0) {
    return (
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-5 py-10 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-card">
          <FolderPlus className="size-6 text-primary/50" />
        </div>
        <h3 className="text-base font-medium tracking-tight">Henüz sepet yok</h3>
        <p className="mt-2 max-w-sm text-sm leading-5 text-muted-foreground">
          Performansı izlemek için ilk sepetini oluştur.
        </p>
      </div>
    );
  }

  if (!mounted) return null;

  const ctx: SharedCalcContext = {
    liveQuotes: sharedCalc.liveQuotes,
    periodChanges: sharedCalc.periodChanges,
    isSelectedTimeframeReady: sharedCalc.isSelectedTimeframeReady,
    getDataItem: sharedCalc.getDataItem,
    getAssetCurrency: sharedCalc.getAssetCurrency,
    normalizeToTRY: sharedCalc.normalizeToTRY,
    displayCurrency: sharedCalc.displayCurrency,
    selectedTimeframe: sharedCalc.selectedTimeframe,
    usdRate: sharedCalc.usdRate,
  };

  return (
    <>
      <Reorder.Group values={orderedPortfolios} onReorder={handleReorder} axis="y" className="flex flex-col gap-2">
        {orderedPortfolios.map((portfolio) => (
          <PortfolioRow
            key={portfolio.id}
            portfolio={portfolio}
            onDelete={() => setDeleteId(portfolio.id)}
            onRename={() => {
              setRenameId(portfolio.id);
              setRenameName(portfolio.name);
            }}
            ctx={ctx}
          />
        ))}
      </Reorder.Group>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sepeti sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu sepeti ve içindeki tüm varlıkları silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteId) return;
                const portfolio = portfolios.find((item) => item.id === deleteId);
                handleDelete(deleteId, portfolio?.name || "Sepet");
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!renameId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameId(null);
            setRenameName("");
            setIsRenaming(false);
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-[1.5rem] border bg-card p-0 shadow-none sm:max-w-[460px]">
          <div className="p-6 sm:p-7">
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Sepet Duzenle</div>
              <DialogTitle className="mt-2 text-2xl font-medium tracking-tight">Sepet ismini degistir</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedRenamePortfolio?.name
                  ? `"${selectedRenamePortfolio.name}" sepeti icin yeni bir isim belirleyin.`
                  : "Sepet icin yeni bir isim belirleyin."}
              </DialogDescription>
            </div>

            <div className="space-y-2">
              <label htmlFor="rename-portfolio-name" className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Yeni sepet adi
              </label>
              <Input
                id="rename-portfolio-name"
                placeholder="Orn. Temettu Sepeti"
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleRename();
                  }
                }}
                className="h-12 rounded-2xl border bg-background px-4 text-sm"
                autoFocus
              />
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenameId(null);
                  setRenameName("");
                }}
                className="h-11 flex-1 rounded-2xl"
              >
                Vazgec
              </Button>
              <Button
                type="button"
                disabled={isRenaming || !renameName.trim()}
                onClick={() => void handleRename()}
                className="h-11 flex-[1.4] rounded-2xl border border-border/70 bg-background text-foreground shadow-none hover:bg-muted/40"
              >
                {isRenaming ? "Kaydediliyor" : "Ismi guncelle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PortfolioRow({
  portfolio,
  onDelete,
  onRename,
  ctx,
}: {
  portfolio: PortfolioType;
  onDelete: (id: string) => void;
  onRename: () => void;
  ctx: SharedCalcContext;
}) {
  const controls = useDragControls();
  const { liveQuotes, getDataItem, getAssetCurrency, normalizeToTRY, displayCurrency } = ctx;
  const currencySymbol = displayCurrency === "USD" ? "$" : "₺";

  // 1. Core values: total portfolio value and weighted assets
  const { assetsWithWeights, sumValueTRY } = useMemo(() => {
    const rows = portfolio.assets.map((asset) => {
      const live = liveQuotes[asset.symbol];
      const item = getDataItem(asset.symbol);
      const currentPrice = live?.last || item?.last || asset.avg_price || asset.avgPrice || 0;
      const currency = getAssetCurrency(asset, live, item);
      const val = (asset.quantity || 0) * normalizeToTRY(currentPrice, currency);
      const avgTRY = normalizeToTRY(asset.avg_price || asset.avgPrice || 0, currency);
      const costBasis = (asset.quantity || 0) * avgTRY;
      return { ...asset, val, costBasis };
    });

    const total = rows.reduce((s, r) => s + r.val, 0);
    const weighted = rows
      .map((r) => ({ ...r, weight: total > 0 ? (r.val / total) * 100 : 0 }))
      .sort((a, b) => b.weight - a.weight);

    return { assetsWithWeights: weighted, sumValueTRY: total };
  }, [portfolio.assets, liveQuotes, getDataItem, getAssetCurrency, normalizeToTRY]);

  // 2. Performance: calculated based on the selected timeframe
  const { periodProfit, profitPct, label, isNominal } = useMemo(() => {
    const isNominal = ctx.selectedTimeframe === "ALL";
    const periodPending = !isNominal && ctx.selectedTimeframe !== "1D" && !ctx.isSelectedTimeframeReady;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let startDate: Date | null = null;
    let label = "HEPSİ";

    switch (ctx.selectedTimeframe) {
      case '1D': startDate = new Date(now); label = "1G"; break;
      case '1W': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); label = "1H"; break;
      case '1M': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        startDate = d;
        label = "1A";
        break;
      }
      case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); label = "YTD"; break;
      case '1Y': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        startDate = d;
        label = "1Y";
        break;
      }
      case '5Y': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 5);
        startDate = d;
        label = "5Y";
        break;
      }
      case 'ALL': startDate = null; label = "HEPSİ"; break;
    }

    if (periodPending) {
      return { periodProfit: null, profitPct: null, label, isNominal };
    }

    let totalPeriodProfitTRY = 0;
    
    portfolio.assets.forEach(asset => {
      const live = liveQuotes[asset.symbol];
      const item = getDataItem(asset.symbol);
      if (!live && !item) return;

      const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date(0);
      const currentPrice = live?.last || item?.last || 0;
      const currency = getAssetCurrency(asset, live, item);
      const quantity = asset.quantity || 0;
      const avgPrice = asset.avg_price || asset.avgPrice || 0;

      const currentValueTRY = quantity * normalizeToTRY(currentPrice, currency);
      
      if (isNominal || (startDate && purchaseDate >= startDate)) {
        // Nominal (Total) OR bought after period start
        const costBasisTRY = quantity * normalizeToTRY(avgPrice, currency);
        totalPeriodProfitTRY += (currentValueTRY - costBasisTRY);
      } else {
        let changePct = ctx.periodChanges[asset.symbol];

        if (changePct === undefined && ctx.isSelectedTimeframeReady) {
          const marketItem = item as MarketDataSnapshot | undefined;
          const dailyChange = live?.change_percent ?? marketItem?.change_percent ?? 0;
          const daysSinceYearStart = Math.max(
            1,
            Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)),
          );

          switch (ctx.selectedTimeframe) {
            case "1D":
              changePct = dailyChange;
              break;
            case "1W":
              changePct = marketItem?.p1w ?? dailyChange * 5;
              break;
            case "1M":
              changePct = marketItem?.p1m ?? dailyChange * 20;
              break;
            case "YTD":
              changePct = marketItem?.return_ytd ?? (marketItem?.p1m != null ? marketItem.p1m * (daysSinceYearStart / 30) : dailyChange * daysSinceYearStart);
              break;
            case "1Y":
              changePct = marketItem?.p1y ?? dailyChange * 250;
              break;
            case "5Y":
              changePct = marketItem?.p5y ?? dailyChange * 1250;
              break;
          }
        }

        if (changePct === undefined) return;
        const changeFactor = 1 + (changePct || 0) / 100;
        const startValueTRY = currentValueTRY / (changeFactor || 1);
        totalPeriodProfitTRY += (currentValueTRY - startValueTRY);
      }
    });

    const displayProfit = ctx.displayCurrency === "USD" ? totalPeriodProfitTRY / ctx.usdRate : totalPeriodProfitTRY;
    const costBasisTRY = sumValueTRY - totalPeriodProfitTRY;
    const pct = costBasisTRY > 0 ? (totalPeriodProfitTRY / costBasisTRY) * 100 : 0;

    return { 
      periodProfit: displayProfit, 
      profitPct: pct, 
      label,
      isNominal
    };
  }, [portfolio.assets, ctx.selectedTimeframe, ctx.periodChanges, ctx.displayCurrency, ctx.usdRate, liveQuotes, getDataItem, getAssetCurrency, normalizeToTRY, sumValueTRY, ctx.isSelectedTimeframeReady]);

  const isProfit = (profitPct ?? 0) >= 0;

  const displayAssets = assetsWithWeights.slice(0, 4);
  const remainingCount = assetsWithWeights.length - displayAssets.length;

  return (
    <Reorder.Item value={portfolio} dragListener={false} dragControls={controls} className="touch-none" whileDrag={{ zIndex: 50, opacity: 0.9 }}>
      <div className="flex items-stretch gap-3 rounded-lg border bg-card p-4 shadow-none">
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          className="shrink-0 self-center rounded-lg border bg-background p-2 text-foreground/40 cursor-grab active:cursor-grabbing"
        >
          <GripHorizontal className="size-4" />
        </button>

        <Link
          href={`/portfolio/${portfolio.id}`}
          onClick={() => usePortfolioStore.getState().setActivePortfolio(portfolio.id)}
          className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.9fr)_minmax(220px,0.8fr)]"
        >
          {/* Left: Name + weight bar */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <div className="size-2 rounded-full bg-emerald-500/80" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aktif Sepet</span>
            </div>
            <div className="truncate text-xl font-medium tracking-tight text-foreground">{portfolio.name}</div>
            <div className="mt-4 flex flex-col gap-2.5">
              {assetsWithWeights.length > 0 ? (
                <div className="flex flex-col gap-2 w-full pr-4">
                  <div className="flex items-center w-full h-4 overflow-hidden bg-muted">
                    {assetsWithWeights.map((asset, idx) => {
                      const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-purple-500", "bg-cyan-500"];
                      const color = colors[idx % colors.length];
                      return (
                        <div
                          key={asset.symbol}
                          style={{ width: `${Math.max(0, asset.weight)}%` }}
                          className={cn("h-full", color)}
                          title={`${asset.symbol} (%${asset.weight.toFixed(1)})`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {displayAssets.map((asset, idx) => {
                      const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-purple-500", "bg-cyan-500"];
                      const color = colors[idx % colors.length];
                      return (
                        <div key={asset.symbol} className="flex items-center gap-1.5 text-[11px] font-medium">
                          <div className={cn("w-1.5 h-1.5 rounded-full", color)} />
                          <span className="text-foreground/80">{asset.symbol}</span>
                          <span className="text-muted-foreground">%{asset.weight.toFixed(1)}</span>
                        </div>
                      );
                    })}
                    {remainingCount > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">+{remainingCount} varlık</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="inline-flex">
                  <Badge variant="secondary" className="h-6 rounded border-0 bg-muted px-2.5 py-0 text-[10px] font-medium text-muted-foreground">
                    Boş sepet
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Middle: Performance */}
          <div className="min-w-0 rounded-lg border bg-background/60 p-4">
            <div className="text-sm font-medium text-muted-foreground">Anlık Durum</div>
            <div className={cn("mt-2 text-2xl font-medium tracking-tight tabular-nums", periodProfit === null ? "text-muted-foreground" : isProfit ? "text-emerald-600" : "text-rose-600")}>
              {periodProfit === null
                ? "--"
                : `${isProfit ? "+" : ""}${currencySymbol}${Math.abs(periodProfit).toLocaleString(displayCurrency === "USD" ? "en-US" : "tr-TR", {
                    maximumFractionDigits: displayCurrency === "USD" ? 2 : 0,
                  })}`}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 rounded px-2 py-0.5 text-[11px]",
                  periodProfit === null
                    ? "border-border/50 bg-muted/30 text-muted-foreground"
                    : isProfit
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                      : "border-rose-500/20 bg-rose-500/5 text-rose-600"
                )}
              >
                {periodProfit === null ? null : (isProfit ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />)}
                <span className="font-bold tabular-nums">{profitPct === null ? "--" : `%${Math.abs(profitPct).toFixed(2)}`}</span>
              </Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {isNominal ? "MALİYET BAZLI" : `${label} VERİSİ`}
              </span>
            </div>
          </div>

          {/* Right: Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Oluşturma</div>
              <div className="mt-1.5 text-lg font-medium tracking-tight text-foreground/90">
                {portfolio.created_at ? new Date(portfolio.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "Bilinmiyor"}
              </div>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Güncelleme</div>
              <div className="mt-1.5 text-lg font-medium tracking-tight text-foreground/90">
                {portfolio.updated_at ? new Date(portfolio.updated_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "Hiç"}
              </div>
            </div>
            <div className="col-span-2 rounded-lg border bg-background/60 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sepet Durumu</div>
              <div className="mt-1.5 flex items-center gap-2 text-lg font-medium tracking-tight text-foreground">
                <Layers className="size-4 text-primary/70" />
                <span className="tabular-nums">{portfolio.assets.length} varlık</span>
              </div>
            </div>
          </div>
        </Link>

        <div
          className="relative isolate z-50 flex shrink-0 flex-col justify-center gap-2"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Button asChild size="icon-sm" variant="outline" className="bg-background" title="Sepeti düzenle">
            <Link href={`/portfolio/${portfolio.id}`} onClick={() => usePortfolioStore.getState().setActivePortfolio(portfolio.id)}>
              <PencilLine className="size-4" />
            </Link>
          </Button>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRename();
            }}
            title="Sepet ismini degistir"
            className="rounded-lg border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <PencilLine className="size-4" />
          </button>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(portfolio.id);
            }}
            title="Sepeti sil"
            className="rounded-lg border bg-background p-2 text-muted-foreground transition-colors hover:text-red-500"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}
