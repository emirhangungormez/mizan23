"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Wallet, Trash2, Edit3, TrendingUp, TrendingDown, PlusCircle, Coins } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolio-store";
import { toast } from "sonner";
import { EditAssetModal } from "@/components/portfolio/edit-asset-modal";
import { SellAssetModal } from "@/components/portfolio/sell-asset-modal";
import { PortfolioAsset } from "@/services/portfolio.service";

import { fetchBatchChanges } from "@/lib/api-client";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
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

interface SmartPositionTableProps {
    onAddAsset?: () => void;
    period?: "1d" | "1w" | "1m" | "ytd" | "1y" | "5y" | "all";
    onPeriodChange?: (period: "1d" | "1w" | "1m" | "ytd" | "1y" | "5y" | "all") => void;
    timeframeSelector?: React.ReactNode;
}

export default function SmartPositionTable({ onAddAsset, period = "all", timeframeSelector }: SmartPositionTableProps) {
    const { portfolios, activePortfolioId, updatePortfolioAssets } = usePortfolioStore();
    const [deleteSymbol, setDeleteSymbol] = React.useState<string | null>(null);
    const [editAsset, setEditAsset] = React.useState<PortfolioAsset | null>(null);
    const [sellAsset, setSellAsset] = React.useState<PortfolioAsset | null>(null);
    const [periodChanges, setPeriodChanges] = React.useState<Record<string, number>>({});
    const [isPeriodLoading, setIsPeriodLoading] = React.useState(false);

    const activePortfolio = portfolios.find(p => p.id === activePortfolioId);
    const portfolioAssets = activePortfolio?.assets || [];

    const {
        displayCurrency,
        isSelectedTimeframeReady,
        normalizeToTRY,
        convertToDisplay,
        getDataItem,
        getAssetCurrency,
        liveQuotes
    } = usePerformanceCalculator(activePortfolio ? [activePortfolio] : []);

    const currencySymbol = displayCurrency === 'USD' ? '$' : '₺';
    const locale = displayCurrency === 'USD' ? 'en-US' : 'tr-TR';

    // Fetch batch changes for the selected period
    React.useEffect(() => {
        if (!activePortfolio || activePortfolio.assets.length === 0 || period === "all") {
            setPeriodChanges({});
            setIsPeriodLoading(false);
            return;
        }

        const fetchChanges = async () => {
            setIsPeriodLoading(true);
            try {
                const symbols = activePortfolio.assets.map(a => a.symbol);
                const data = await fetchBatchChanges(symbols, period);
                const changes: Record<string, number> = {};
                data.results.forEach(r => {
                    changes[r.symbol] = r.change_percent;
                });
                setPeriodChanges(changes);
            } catch (error) {
                console.error("Failed to fetch period changes:", error);
            } finally {
                setIsPeriodLoading(false);
            }
        };

        fetchChanges();
    }, [portfolioAssets, period]);

    const hasAssets = activePortfolio && activePortfolio.assets.length > 0;

    // Calculate total current value for weight calculations (in TRY for internal logic)
    const portfolioValueTRY = React.useMemo(() => {
        if (!activePortfolio) return 0;
        return activePortfolio.assets.reduce((sum, a) => {
            const live = liveQuotes[a.symbol];
            const item = getDataItem(a.symbol);
            const currentPrice = live?.last || item?.last || a.avg_price || a.avgPrice || 0;
            const assetCurrency = getAssetCurrency(a, live, item);
            return sum + (a.quantity * normalizeToTRY(currentPrice, assetCurrency));
        }, 0);
    }, [activePortfolio, getDataItem, normalizeToTRY]);

    const POSITIONS = React.useMemo(() => {
        if (!activePortfolio) return [];
        return activePortfolio.assets.map(a => {
            const live = liveQuotes[a.symbol];
            const item = getDataItem(a.symbol);
            const currentPriceRaw = live?.last || item?.last || a.avg_price || a.avgPrice || 0;
            const costBasisRaw = (a.avg_price || a.avgPrice || 0);
            const assetCurrency = getAssetCurrency(a, live, item);

            // Normalized to TRY for calculations
            const currentPriceTRY = normalizeToTRY(currentPriceRaw, assetCurrency);
            const costBasisTRY = normalizeToTRY(costBasisRaw, assetCurrency);
            const currentValueTRY = a.quantity * currentPriceTRY;

            // If period is 'all', show absolute P/L from cost basis
            let pnl = 0;

            // Calculate holding days
            const purchaseDate = a.purchase_date ? new Date(a.purchase_date) : new Date();
            const now = new Date();
            const holdingDays = (now.getTime() - purchaseDate.getTime()) / (1000 * 3600 * 24);

            // Calculate period days
            let periodDays = 0;
            if (period === '1d') periodDays = 1;
            else if (period === '1w') periodDays = 7;
            else if (period === '1m') periodDays = 30;
            else if (period === 'ytd') {
                const startOfYear = new Date(now.getFullYear(), 0, 1);
                periodDays = (now.getTime() - startOfYear.getTime()) / (1000 * 3600 * 24);
            }
            else if (period === '1y') periodDays = 365;
            else if (period === '5y') periodDays = 365 * 5;
            else if (period === 'all') periodDays = 999999;

            // Use Total P/L if period is 'all' OR holding duration is shorter than selected period
            if (period === "all" || holdingDays < periodDays) {
                pnl = costBasisTRY > 0 ? ((currentPriceTRY - costBasisTRY) / costBasisTRY) * 100 : 0;
            } else {
                const cachedChange = periodChanges[a.symbol];
                pnl = cachedChange === undefined && !isSelectedTimeframeReady ? Number.NaN : (cachedChange || 0);
            }

            const weight = portfolioValueTRY > 0 ? (currentValueTRY / portfolioValueTRY) * 100 : 0;
            const pnlAmountTRY = Number.isNaN(pnl) ? Number.NaN : (currentValueTRY * pnl) / (100 + pnl);

            return {
                ...a,
                currentPriceDisplay: convertToDisplay(currentPriceTRY),
                costBasisDisplay: convertToDisplay(costBasisTRY),
                pnl,
                pnlAmountDisplay: convertToDisplay(pnlAmountTRY),
                weight: Math.round(weight * 10) / 10,
                status: Number.isNaN(pnl) ? "pending" : pnl >= 0 ? "profit" : "loss"
            };
        });
    }, [activePortfolio, getDataItem, normalizeToTRY, convertToDisplay, portfolioValueTRY, period, periodChanges, isSelectedTimeframeReady]);

    const handleRemoveAsset = async (symbol: string) => {
        if (!activePortfolio) return;
        const newAssets = activePortfolio.assets.filter(a => a.symbol !== symbol);
        const success = await updatePortfolioAssets(activePortfolio.id, newAssets);
        if (success) {
            toast.success(`${symbol} portföyden çıkarıldı`);
        } else {
            toast.error("Varlık silinirken bir hata oluştu");
        }
        setDeleteSymbol(null);
    };

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full min-h-[480px]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/5">
                <div className="flex items-center gap-4">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Wallet className="size-4" />
                    </div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Pozisyon Detayları</h3>
                    {timeframeSelector}
                </div>
            </div>

            <div className="flex-1 overflow-x-auto">
                {hasAssets ? (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="py-4 px-6 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Varlık</th>
                                <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Alım Tarihi</th>
                                <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Ağırlık / Değer</th>
                                <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Güncel / Maliyet</th>
                                <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                                    {period === '1d' ? 'Günlük' :
                                        period === '1w' ? 'Haftalık' :
                                            period === '1m' ? 'Aylık' :
                                                period === 'ytd' ? 'YBB' :
                                                    period === '1y' ? 'Yıllık' :
                                                        period === '5y' ? '5 Yıllık' : 'Genel'}
                                </th>
                                <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Toplam K/Z</th>
                                <th className="py-4 px-6 text-[10px] font-medium text-muted-foreground uppercase tracking-widest text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className={cn("divide-y divide-border transition-opacity", isPeriodLoading && "opacity-50 pointer-events-none")}>
                            {POSITIONS.map((pos) => (
                                <tr key={pos.symbol} className="hover:bg-muted/5 transition-colors cursor-pointer group">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded bg-muted flex items-center justify-center font-medium text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                                                {pos.symbol.substring(0, 2)}
                                            </div>
                                            <span className="text-[13px] font-medium tracking-tight">{pos.symbol}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                            {pos.purchase_date ? new Date(pos.purchase_date).toLocaleDateString(locale) : '-'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col gap-1 w-24">
                                            <div className="flex justify-between items-center text-[11px] font-medium tabular-nums">
                                                <span>%{pos.weight}</span>
                                                <span className="text-muted-foreground text-[10px]">
                                                    {currencySymbol}{(pos.currentPriceDisplay * pos.quantity).toLocaleString(locale, { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-primary/40 rounded-full" style={{ width: `${pos.weight}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-bold text-foreground/90 tracking-tight tabular-nums">
                                                {currencySymbol}{pos.currentPriceDisplay.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[9px] font-medium text-muted-foreground tabular-nums">Mly: {currencySymbol}{pos.costBasisDisplay.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className={cn(
                                            "flex flex-col gap-0.5 font-bold tabular-nums",
                                            Number.isNaN(pos.pnl) ? "text-muted-foreground" : pos.pnl >= 0 ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            <div className="flex items-center gap-1 text-[11px]">
                                                {Number.isNaN(pos.pnl) ? null : pos.pnl >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                                {Number.isNaN(pos.pnl) ? "--" : `%${Math.abs(pos.pnl).toFixed(2)}`}
                                            </div>
                                            <span className="text-[10px] opacity-80">
                                                {Number.isNaN(pos.pnlAmountDisplay) ? "--" : `${pos.pnl >= 0 ? "+" : "-"}${currencySymbol}${Math.abs(pos.pnlAmountDisplay).toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}`}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        {(() => {
                                            const totalPnl = pos.costBasisDisplay > 0 ? ((pos.currentPriceDisplay - pos.costBasisDisplay) / pos.costBasisDisplay) * 100 : 0;
                                            const totalPnlAmountDisplay = pos.quantity * (pos.currentPriceDisplay - pos.costBasisDisplay);
                                            return (
                                                <div className={cn(
                                                    "flex flex-col gap-0.5 font-bold tabular-nums",
                                                    totalPnl >= 0 ? "text-emerald-500" : "text-rose-500"
                                                )}>
                                                    <div className="flex items-center gap-1 text-[11px]">
                                                        %{Math.abs(totalPnl).toFixed(2)}
                                                    </div>
                                                    <span className="text-[10px] opacity-80">
                                                        {totalPnl >= 0 ? "+" : "-"}{currencySymbol}{Math.abs(totalPnlAmountDisplay).toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const originalAsset = activePortfolio?.assets.find(a => a.symbol === pos.symbol);
                                                    if (originalAsset) setSellAsset(originalAsset);
                                                }}
                                                className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors"
                                                title="Satış Yap"
                                            >
                                                <Coins className="size-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const originalAsset = activePortfolio?.assets.find(a => a.symbol === pos.symbol);
                                                    if (originalAsset) setEditAsset(originalAsset);
                                                }}
                                                className="p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                                title="Düzenle"
                                            >
                                                <Edit3 className="size-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteSymbol(pos.symbol);
                                                }}
                                                className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                                                title="Sil"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
                        <div className="size-12 rounded-2xl bg-muted/10 flex items-center justify-center text-muted-foreground/20 mb-4">
                            <PlusCircle className="size-6" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Sepetiniz Boş</p>
                        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mt-1 max-w-[200px] mb-4">
                            Hemen varlık ekleyerek portföyünüzü takip etmeye başlayın.
                        </p>
                        {onAddAsset && (
                            <button
                                onClick={onAddAsset}
                                className="px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors"
                            >
                                Varlık Ekle
                            </button>
                        )}
                    </div>
                )}

                {/* Local Delete Confirmation */}
                <AlertDialog open={!!deleteSymbol} onOpenChange={(open) => !open && setDeleteSymbol(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Varlığı Kaldır</AlertDialogTitle>
                            <AlertDialogDescription>
                                <strong>{deleteSymbol}</strong> varlığını portföyünüzden silmek istediğinize emin misiniz?
                                <br />Bu işlem geri alınamaz ve işlem geçmişine kaydedilmez. Satış yapmak için "Sat" butonunu kullanın.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteSymbol && handleRemoveAsset(deleteSymbol)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                Sil
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Edit Modal */}
                <EditAssetModal
                    open={!!editAsset}
                    onOpenChange={(open) => !open && setEditAsset(null)}
                    portfolioId={activePortfolio?.id || ""}
                    asset={editAsset}
                />

                {/* Sell Modal */}
                <SellAssetModal
                    open={!!sellAsset}
                    onOpenChange={(open) => !open && setSellAsset(null)}
                    portfolioId={activePortfolio?.id || ""}
                    asset={sellAsset}
                />
            </div>
        </div >
    );
}
