"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, PencilLine, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboard-store";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import { usePortfolioAnalysis, usePortfolioStore, type PortfolioAsset, type Transaction } from "@/store/portfolio-store";
import { normalizePortfolio } from "@/lib/portfolio-transactions";
import { TransactionModal } from "@/components/portfolio/transaction-modal";
import { AssetTargetDialog } from "@/components/portfolio/asset-target-dialog";
import { resolveTargetReturnPct } from "@/lib/portfolio-targets";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function metricTone(value: number) {
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function formatPercent(value?: number | null, digits: number = 2) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function actionTone(action?: string) {
  if (action === "Kesin Sat") return "border-rose-500/20 bg-rose-500/10 text-rose-700";
  if (action === "Sat") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
}

function entryTone(signal?: string) {
  if (signal === "Uzak Dur") return "border-rose-500/20 bg-rose-500/10 text-rose-700";
  if (signal === "Bekle") return "border-slate-500/20 bg-slate-500/10 text-slate-700";
  return "border-sky-500/20 bg-sky-500/10 text-sky-700";
}

function targetActionTone(action?: string) {
  if (action === "Zarari Kes") return "border-rose-500/20 bg-rose-500/10 text-rose-700";
  if (action === "Risk Azalt" || action === "Kademeli Kar Al") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  if (action === "Kar Al") return "border-sky-500/20 bg-sky-500/10 text-sky-700";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
}

function typeLabel(type?: string) {
  if (type === "stock") return "Hisse";
  if (type === "crypto") return "Kripto";
  if (type === "fx") return "Döviz";
  if (type === "fund") return "Fon";
  if (type === "gold") return "Altın";
  if (type === "commodity") return "Emtia";
  if (type === "cash") return "Nakit";
  return "Varlık";
}

const PERIOD_OPTIONS = [
  { value: "1D", label: "Bugün", short: "1G" },
  { value: "1W", label: "Hafta", short: "1H" },
  { value: "1M", label: "Ay", short: "1A" },
  { value: "1Y", label: "Yıl", short: "1Y" },
  { value: "ALL", label: "Tümü", short: "T" },
] as const;

export function PortfolioWorkspace({ portfolioId }: { portfolioId: string }) {
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const fetchPortfolios = usePortfolioStore((state) => state.fetchPortfolios);
  const setActivePortfolio = usePortfolioStore((state) => state.setActivePortfolio);
  const deleteTransaction = usePortfolioStore((state) => state.deleteTransaction);
  const runAnalysis = usePortfolioStore((state) => state.runAnalysis);
  const analysis = usePortfolioAnalysis();
  const fetchDashboardData = useDashboardStore((state) => state.fetchDashboardData);
  const dashboardData = useDashboardStore((state) => state.dashboardData);

  const [transactionOpen, setTransactionOpen] = React.useState(false);
  const [defaultType, setDefaultType] = React.useState<"buy" | "sell">("buy");
  const [defaultSymbol, setDefaultSymbol] = React.useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
  const [targetAsset, setTargetAsset] = React.useState<PortfolioAsset | null>(null);

  React.useEffect(() => {
    fetchPortfolios();
    if (!dashboardData) fetchDashboardData();
    setActivePortfolio(portfolioId);
  }, [dashboardData, fetchDashboardData, fetchPortfolios, portfolioId, setActivePortfolio]);

  const portfolio = React.useMemo(() => {
    const found = portfolios.find((item) => item.id === portfolioId);
    return found ? normalizePortfolio(found) : null;
  }, [portfolioId, portfolios]);

  const analysisTriggerKey = React.useMemo(() => {
    return (portfolio?.assets || [])
      .map(
        (asset) =>
          `${asset.symbol}:${asset.quantity}:${asset.avg_price}:${asset.target_profile || ""}:${asset.target_return_pct || ""}`
      )
      .join("|");
  }, [portfolio?.assets]);

  React.useEffect(() => {
    if (portfolio?.assets.length) void runAnalysis(portfolio.id);
  }, [analysisTriggerKey, portfolio?.assets.length, portfolio?.id, runAnalysis]);

  const { 
    metrics, 
    selectedTimeframe, 
    isSelectedTimeframeReady,
    setSelectedTimeframe, 
    displayCurrency, 
    toggleCurrency, 
    currencySymbol,
    locale,
    convertToDisplay, 
    getAssetCurrency, 
    getDataItem, 
    liveQuotes, 
    normalizeToTRY, 
    periodChanges
  } = usePerformanceCalculator(portfolio ? [portfolio] : []);

  const positions = React.useMemo(() => {
    if (!portfolio) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let startDate: Date | null = null;
    switch (selectedTimeframe) {
      case '1D': startDate = new Date(now); break;
      case '1W': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '1M': { const d = new Date(now); d.setMonth(d.getMonth() - 1); startDate = d; break; }
      case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); startDate = d; break; }
      case '5Y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); startDate = d; break; }
      case 'ALL': startDate = null; break;
    }

    const rows = portfolio.assets.map((asset) => {
      const live = liveQuotes[asset.symbol];
      const item = getDataItem(asset.symbol);
      const currentRaw = live?.last || item?.last || asset.avg_price || asset.avgPrice || 0;
      const assetCurrency = getAssetCurrency(asset, live, item);
      const currentTRY = normalizeToTRY(currentRaw, assetCurrency);
      const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date(0);
      const quantity = asset.quantity || 0;

      let periodProfitTRY: number | null = 0;
      if (!startDate || purchaseDate >= startDate) {
        const avgTRY = normalizeToTRY(asset.avg_price || asset.avgPrice || 0, assetCurrency);
        periodProfitTRY = (currentTRY - avgTRY) * quantity;
      } else {
        const changePct = periodChanges[asset.symbol];
        if (changePct === undefined) {
          periodProfitTRY = selectedTimeframe === '1D' || selectedTimeframe === 'ALL' || isSelectedTimeframeReady ? 0 : null;
        } else {
          const changeFactor = 1 + (changePct || 0) / 100;
          const startValueTRY = currentTRY / (changeFactor || 1);
          periodProfitTRY = (currentTRY - startValueTRY) * quantity;
        }
      }

      const avgTRY = normalizeToTRY(asset.avg_price || asset.avgPrice || 0, assetCurrency);
      const totalValueTRY = asset.quantity * currentTRY;
      const periodCostTRY = periodProfitTRY === null ? null : totalValueTRY - periodProfitTRY;
      const targetReturnPct = resolveTargetReturnPct(asset.target_profile, asset.target_return_pct);

      return {
        symbol: asset.symbol,
        name: asset.name || item?.name || asset.symbol,
        type: asset.type,
        asset,
        quantity: asset.quantity,
        currentPriceDisplay: convertToDisplay(currentTRY),
        avgCostDisplay: convertToDisplay(avgTRY),
        avgCostTRY: avgTRY,
        totalValueDisplay: convertToDisplay(totalValueTRY), // Instant current value
        profitDisplay: periodProfitTRY === null ? null : convertToDisplay(periodProfitTRY), // Period Specific Profit
        totalValueTRY,
        targetReturnPct,
        profitPct: periodProfitTRY === null || !periodCostTRY || periodCostTRY <= 0 ? null : (periodProfitTRY / periodCostTRY) * 100,
      };
    });

    const totalValueTRY = rows.reduce((sum, row) => sum + row.totalValueTRY, 0);
    return rows
      .map((row) => ({
        ...row,
        weight: totalValueTRY > 0 ? (row.totalValueTRY / totalValueTRY) * 100 : 0,
      }))
      .sort((a, b) => b.totalValueTRY - a.totalValueTRY);
  }, [convertToDisplay, getAssetCurrency, getDataItem, liveQuotes, normalizeToTRY, portfolio, selectedTimeframe, periodChanges, isSelectedTimeframeReady]);

  const totals = React.useMemo(() => {
    const totalValue = positions.reduce((sum, row) => sum + row.totalValueDisplay, 0);
    const totalProfit = positions.reduce((sum, row) => sum + (row.profitDisplay ?? 0), 0);
    return {
      totalValue,
      totalProfit,
      assetCount: positions.length,
      transactionCount: portfolio?.transactions?.length || 0,
    };
  }, [portfolio?.transactions?.length, positions]);

  const transactions = React.useMemo(() => {
    return [...(portfolio?.transactions || [])].sort((a, b) => {
      const aTime = new Date(a.date || a.buy_date || a.sell_date || 0).getTime();
      const bTime = new Date(b.date || b.buy_date || b.sell_date || 0).getTime();
      return bTime - aTime;
    });
  }, [portfolio?.transactions]);

  const holdingDecisionMap = React.useMemo(
    () =>
      Object.fromEntries(
        (analysis?.portfolio_id === portfolio?.id ? (analysis.holding_decisions || []) : []).map((item) => [item.symbol, item])
      ),
    [analysis, portfolio?.id]
  );
  const portfolioReport = analysis?.portfolio_id === portfolio?.id ? analysis.portfolio_report : null;

  const visibleTransactions = transactions.slice(0, 8);

  const openTransactionModal = (type: "buy" | "sell", symbol: string | null = null) => {
    setEditingTransaction(null);
    setDefaultType(type);
    setDefaultSymbol(symbol);
    setTransactionOpen(true);
  };

  const openEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setDefaultSymbol(transaction.symbol);
    setDefaultType(transaction.type || "buy");
    setTransactionOpen(true);
  };

  if (!portfolio) {
    return (
      <div className="p-3">
        <div className="rounded-xl border bg-card p-6">
          <div className="text-lg font-medium tracking-tight">Sepet bulunamadı</div>
          <div className="mt-2 text-sm text-muted-foreground">İstenen sepet yüklenemedi veya silinmiş olabilir.</div>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/portfolio">
              <ChevronLeft className="size-4" />
              Sepetlere dön
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full p-3 pb-8 sm:p-4">
        <div className="flex flex-col gap-4">
          {/* Sayfa Başlığı ve Kontroller (Card Dışında) */}
          <div className="flex flex-col gap-4 px-1 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <Link href="/portfolio" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ChevronLeft className="size-4" />
                Sepetler
              </Link>
              <h1 className="text-2xl font-medium tracking-tight text-foreground">{portfolio.name}</h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {/* Para Birimi Seçici */}
              <div className="flex items-center self-start rounded-lg border bg-muted/30 p-1 sm:self-auto">
                <button
                  onClick={() => displayCurrency !== 'TRY' && toggleCurrency()}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                    displayCurrency === 'TRY' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  TL
                </button>
                <button
                  onClick={() => displayCurrency !== 'USD' && toggleCurrency()}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                    displayCurrency === 'USD' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  USD
                </button>
              </div>

              {/* Zaman Dilimleri */}
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
                {PERIOD_OPTIONS.map((option) => {
                  const isActive = selectedTimeframe === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedTimeframe(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      )}
                      aria-pressed={isActive}
                    >
                      <span className="hidden sm:inline">{option.label}</span>
                      <span className="sm:hidden">{option.short}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => openTransactionModal("buy")} className="w-full sm:w-auto">
                  <Plus className="size-4" />
                  İşlem Yap
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Toplam Varlık"
              value={`${currencySymbol}${totals.totalValue.toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}`}
              helper="Anlık sepet büyüklüğü"
            />
            <MetricCard
              label={`${metrics.label} Getirisi`}
              value={`${metrics.profit >= 0 ? "+" : "-"}${currencySymbol}${Math.abs(metrics.profit).toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}`}
              helper={`${metrics.percent >= 0 ? "+" : ""}${metrics.percent.toFixed(2)}% dönem getirisi`}
              tone={metrics.profit}
            />
            <MetricCard
              label="Toplam Kar/Zarar"
              value={`${totals.totalProfit >= 0 ? "+" : "-"}${currencySymbol}${Math.abs(totals.totalProfit).toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}`}
              helper="Maliyet bazlı toplu sonuç"
              tone={totals.totalProfit}
            />
            <MetricCard label="Aktif Varlık" value={String(totals.assetCount)} helper="Sepetteki aktif pozisyon adedi" />
            <MetricCard label="İşlem Kaydı" value={String(totals.transactionCount)} helper="Toplam alım / satış kaydı" />
          </div>

          {portfolioReport && (portfolioReport.closed_trade_count || 0) > 0 ? (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-4">
                <div className="text-lg font-medium tracking-tight">Sepet Raporu</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Kapanmis islemler uzerinden motorun giris ve cikis kararlari istatistiksel olarak okunur.
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
                <MetricCard label="Kapanmis Islem" value={String(portfolioReport.closed_trade_count || 0)} helper="Gerceklesmis round-trip sayisi" />
                <MetricCard
                  label="Kazanma Orani"
                  value={`%${(portfolioReport.win_rate || 0).toFixed(1)}`}
                  helper={`GA %{(portfolioReport.win_rate_confidence_interval?.lower || 0).toFixed(1)} - %{(portfolioReport.win_rate_confidence_interval?.upper || 0).toFixed(1)}`}
                  tone={(portfolioReport.win_rate || 0) - 50}
                />
                <MetricCard
                  label="Beklenen Getiri"
                  value={formatPercent(portfolioReport.expectancy_pct, 2)}
                  helper="Islem basi beklenen sonuc"
                  tone={portfolioReport.expectancy_pct || 0}
                />
                <MetricCard
                  label="Giris Dogrulugu"
                  value={`%${(portfolioReport.entry_signal_accuracy_pct || 0).toFixed(1)}`}
                  helper={`${portfolioReport.entry_signal_evaluated_count || 0} islemde test edildi`}
                  tone={(portfolioReport.entry_signal_accuracy_pct || 0) - 50}
                />
                <MetricCard
                  label="Cikis Dogrulugu"
                  value={`%${(portfolioReport.exit_signal_accuracy_pct || 0).toFixed(1)}`}
                  helper={`${portfolioReport.exit_signal_evaluated_count || 0} islemde test edildi`}
                  tone={(portfolioReport.exit_signal_accuracy_pct || 0) - 50}
                />
                <MetricCard
                  label="Profit Factor"
                  value={(portfolioReport.profit_factor || 0).toFixed(2)}
                  helper={`${(portfolioReport.avg_holding_days || 0).toFixed(1)} gun ortalama tasima`}
                  tone={(portfolioReport.profit_factor || 0) - 1}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 border-t p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <div className="rounded-lg border">
                  <div className="border-b px-4 py-3 text-sm font-medium">Son Kapanan Islemler</div>
                  <div className="max-h-[340px] overflow-auto no-scrollbar">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium border-b">Varlik</th>
                          <th className="px-4 py-3 font-medium border-b">Tarih</th>
                          <th className="px-4 py-3 font-medium text-right border-b">Getiri</th>
                          <th className="px-4 py-3 font-medium border-b">Motor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(portfolioReport.recent_closed_trades || []).slice(0, 12).map((trade) => (
                          <tr key={`${trade.symbol}-${trade.sell_date}-${trade.buy_date}`} className="hover:bg-muted/40">
                            <td className="px-4 py-3 align-top">
                              <Link
                                href={`/market/${trade.symbol}`}
                                className="inline-block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <div className="font-medium text-foreground transition-colors hover:text-primary">
                                  {trade.name || trade.symbol}
                                </div>
                              </Link>
                              <Link
                                href={`/market/${trade.symbol}`}
                                className="mt-1 inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {trade.symbol}
                              </Link>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-xs text-muted-foreground">{formatDate(trade.buy_date || undefined)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{formatDate(trade.sell_date || undefined)}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">{trade.holding_days ?? 0} gun</div>
                            </td>
                            <td className={cn("px-4 py-3 text-right align-top font-medium tabular-nums", metricTone(trade.realized_return_pct || 0))}>
                              <div>{formatPercent(trade.realized_return_pct, 2)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {trade.realized_pnl != null
                                  ? `${currencySymbol}${Math.abs(trade.realized_pnl).toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}`
                                  : "--"}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                {trade.entry_signal ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-md px-2 py-0 text-[10px]",
                                      trade.entry_signal_alignment === true
                                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700"
                                        : trade.entry_signal_alignment === false
                                          ? "border-rose-500/20 bg-rose-500/5 text-rose-700"
                                          : "border-slate-500/20 bg-slate-500/5 text-slate-700"
                                    )}
                                  >
                                    {trade.entry_signal}
                                  </Badge>
                                ) : null}
                                {trade.exit_action ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-md px-2 py-0 text-[10px]",
                                      trade.exit_signal_alignment === true
                                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700"
                                        : trade.exit_signal_alignment === false
                                          ? "border-rose-500/20 bg-rose-500/5 text-rose-700"
                                          : "border-slate-500/20 bg-slate-500/5 text-slate-700"
                                    )}
                                  >
                                    {trade.exit_action}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                Giris: {trade.entry_signal_alignment == null ? "Yok" : trade.entry_signal_alignment ? "Uyumlu" : "Aykiri"}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Cikis: {trade.exit_signal_alignment == null ? "Yok" : trade.exit_signal_alignment ? "Uyumlu" : "Aykiri"}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Motor Yorumu</div>
                    <div className="mt-3 space-y-2">
                      {(portfolioReport.lessons || []).length > 0 ? (
                        (portfolioReport.lessons || []).map((lesson, index) => (
                          <div key={index} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            {lesson}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                          Istatistiksel yorum icin daha fazla kapanmis islem birikmesi gerekiyor.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Ek Bulgular</div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>Ortalama gerceklesen getiri: <span className={cn("font-medium", metricTone(portfolioReport.avg_realized_return_pct || 0))}>{formatPercent(portfolioReport.avg_realized_return_pct, 2)}</span></div>
                      <div>Medyan getiri: <span className={cn("font-medium", metricTone(portfolioReport.median_realized_return_pct || 0))}>{formatPercent(portfolioReport.median_realized_return_pct, 2)}</span></div>
                      <div>Ortalama beklenen getiri: <span className={cn("font-medium", metricTone(portfolioReport.expected_return_avg_pct || 0))}>{formatPercent(portfolioReport.expected_return_avg_pct, 2)}</span></div>
                      <div>Gerceklesen - beklenen fark: <span className={cn("font-medium", metricTone(portfolioReport.realized_vs_expected_return_avg_pct || 0))}>{formatPercent(portfolioReport.realized_vs_expected_return_avg_pct, 2)}</span></div>
                      <div>Sistem onayi ile acilan islem: <span className="font-medium text-foreground">{portfolioReport.entry_followed_trade_count || 0}</span></div>
                      <div>Sistem onayli islemlerde kazanma: <span className={cn("font-medium", metricTone((portfolioReport.entry_followed_win_rate || 0) - 50))}>%{(portfolioReport.entry_followed_win_rate || 0).toFixed(1)}</span></div>
                      <div>Olasilik hata skoru: <span className="font-medium text-foreground">{(portfolioReport.probability_brier_score || 0).toFixed(4)}</span></div>
                    </div>
                  </div>

                  {(portfolioReport.signal_bucket_summary && Object.keys(portfolioReport.signal_bucket_summary).length > 0) ? (
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Sinyal Bantlari</div>
                      <div className="mt-3 space-y-2">
                        {Object.entries(portfolioReport.signal_bucket_summary).map(([bucket, stats]) => (
                          <div key={bucket} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            <div className="font-medium text-foreground">{bucket}</div>
                            <div className="mt-1">Kayit: {stats.count}</div>
                            <div>Kazanma: %{stats.win_rate.toFixed(1)}</div>
                            <div className={cn(metricTone(stats.avg_realized_return_pct))}>
                              Ortalama getiri: {formatPercent(stats.avg_realized_return_pct, 2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.72fr)]">
            <section className="flex flex-col rounded-xl border bg-card xl:max-h-[500px]">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-4 shrink-0">
                <div>
                  <div className="text-lg font-medium tracking-tight">Sepetteki varlıklar</div>
                  <div className="mt-1 text-sm text-muted-foreground">Genel pozisyon durumu ve kâr/zarar görünümü</div>
                </div>
                <Button size="sm" onClick={() => openTransactionModal("buy")}>
                  <Plus className="size-4" />
                  İşlem Yap
                </Button>
              </div>

              {positions.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="text-base font-medium tracking-tight">Henüz varlık yok</div>
                  <div className="mt-2 text-sm text-muted-foreground">Bu sepete ilk işlemi ekleyerek varlıklarını görmeye başlayabilirsin.</div>
                </div>
              ) : (
                <div className="overflow-auto no-scrollbar scroll-smooth flex-1">
                  <table className="min-w-[1040px] text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium border-b">Varlık</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Adet</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Ort. Maliyet</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Güncel</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Toplam</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Kar/Zarar</th>
                        <th className="px-4 py-3 font-medium text-right border-b">Ağırlık</th>
                        <th className="px-4 py-3 font-medium border-b">Hedef</th>
                        <th className="px-4 py-3 font-medium border-b">Karar</th>
                        <th className="px-4 py-3 font-medium text-right border-b">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-card">
                      {positions.map((position) => {
                        const decision = holdingDecisionMap[position.symbol];
                        const activeTargetReturnPct = decision?.target_return_pct ?? position.targetReturnPct;
                        const activeTargetPriceDisplay = convertToDisplay(
                          position.avgCostTRY * (1 + activeTargetReturnPct / 100)
                        );
                        return (
                        <tr key={position.symbol} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-4 align-top">
                            <Link
                              href={`/market/${position.symbol}`}
                              className="group inline-block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <div className="font-medium text-foreground transition-colors group-hover:text-primary">
                                {position.name}
                              </div>
                            </Link>
                            <div className="mt-1 flex items-center gap-2">
                              <Link
                                href={`/market/${position.symbol}`}
                                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {position.symbol}
                              </Link>
                              <Badge variant="secondary" className="h-5 rounded-md border-0 bg-muted px-2 py-0 text-[9px] font-medium text-muted-foreground">
                                {typeLabel(position.type)}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-medium tabular-nums">{position.quantity.toLocaleString(locale, { maximumFractionDigits: 4 })}</td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {currencySymbol}
                            {position.avgCostDisplay.toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {currencySymbol}
                            {position.currentPriceDisplay.toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}
                          </td>
                          <td className="px-4 py-4 text-right font-medium tabular-nums">
                            {currencySymbol}
                            {position.totalValueDisplay.toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}
                          </td>
                          <td className={cn("px-4 py-4 text-right font-medium tabular-nums", metricTone(position.profitDisplay ?? 0))}>
                            <div>
                              {position.profitDisplay === null
                                ? "--"
                                : `${position.profitDisplay >= 0 ? "+" : "-"}${currencySymbol}${Math.abs(position.profitDisplay).toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {position.profitPct === null ? "--" : `${position.profitPct >= 0 ? "+" : ""}${position.profitPct.toFixed(2)}%`}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums">{position.weight.toFixed(1)}%</td>
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  +%{(decision?.target_return_pct ?? position.targetReturnPct).toFixed(1)}
                                </span>
                                <span className={cn(
                                  "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  decision?.target_mode === "manual"
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
                                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                                )}>
                                  {decision?.target_source_label || "Sistem"}
                                </span>
                              </div>
                              {decision?.target_mode === "manual" && decision?.system_target_return_pct != null ? (
                                <div className="text-xs text-amber-700">
                                  Sistem onerisi: %{decision.system_target_return_pct.toFixed(1)}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                Hedef fiyat {currencySymbol}
                                {activeTargetPriceDisplay.toLocaleString(locale, {
                                  maximumFractionDigits: displayCurrency === "USD" ? 2 : 0,
                                })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {decision?.distance_to_target_pct != null
                                  ? decision.distance_to_target_pct <= 0
                                    ? "Hedefe ulasildi"
                                    : `Hedefe kalan: %${decision.distance_to_target_pct.toFixed(1)}`
                                  : "Hedef plani secilebilir"}
                              </div>
                              {decision?.target_warning ? (
                                <div className="text-xs text-amber-700">{decision.target_warning}</div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {decision ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {decision.target_action ? (
                                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium", targetActionTone(decision.target_action))}>
                                      {decision.target_action}
                                    </span>
                                  ) : null}
                                  {decision.holding_action ? (
                                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium", actionTone(decision.holding_action))}>
                                      {decision.holding_action}
                                    </span>
                                  ) : null}
                                  {decision.entry_signal ? (
                                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium", entryTone(decision.entry_signal))}>
                                      {decision.entry_signal}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="max-w-64 text-xs text-muted-foreground">
                                  {decision.target_action_reason || decision.holding_action_reason || decision.entry_signal_reason || "Analiz karari hazirlaniyor."}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Konviksiyon skoru: %{(decision.conviction_score || 0).toFixed(0)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Yukselis olasiligi: %{((decision.probability_positive || 0) * 100).toFixed(0)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Beklenen alfa: {formatPercent(decision.expected_excess_return_pct, 1)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Analiz hazirlaniyor</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <Button size="xs" variant="outline" onClick={() => setTargetAsset(position.asset)}>
                                <Target className="size-3.5" />
                                Hedef
                              </Button>
                              <Button size="xs" variant="outline" onClick={() => openTransactionModal("buy", position.symbol)}>
                                Al
                              </Button>
                              <Button size="xs" variant="outline" onClick={() => openTransactionModal("sell", position.symbol)}>
                                Sat
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="flex flex-col rounded-xl border bg-card xl:max-h-[500px]">
              <div className="shrink-0 border-b px-4 py-4">
                <div>
                  <div className="text-lg font-medium tracking-tight">İşlem geçmişi</div>
                  <div className="mt-1 text-sm text-muted-foreground">Sepet işlem geçmişi</div>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">Bu sepet için henüz işlem kaydı bulunmuyor.</div>
              ) : (
                <div className="overflow-auto no-scrollbar scroll-smooth flex-1 divide-y">
                  {visibleTransactions.map((transaction, index) => {
                    const txType = transaction.type || (transaction.sell_price ? "sell" : "buy");
                    const price = transaction.price ?? transaction.sell_price ?? transaction.buy_price ?? 0;
                    const txDate = transaction.date || transaction.sell_date || transaction.buy_date;

                    return (
                      <div key={`${transaction.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-medium text-foreground">{transaction.asset_name || transaction.symbol}</div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 rounded-md px-2 py-0 text-[10px]",
                                txType === "buy" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600" : "border-amber-500/20 bg-amber-500/5 text-amber-600"
                              )}
                            >
                              {txType === "buy" ? "Alım" : "Satış"}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{transaction.symbol}</span>
                            <span>{formatDate(txDate)}</span>
                            <span className="tabular-nums">{transaction.quantity.toLocaleString(locale, { maximumFractionDigits: 4 })} adet</span>
                            <span className="tabular-nums">
                              {currencySymbol}
                              {price.toLocaleString(locale, { maximumFractionDigits: displayCurrency === "USD" ? 2 : 0 })}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button size="xs" variant="outline" onClick={() => openEditTransaction(transaction)}>
                            <PencilLine className="size-3.5" />
                            Düzenle
                          </Button>
                          <Button size="xs" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => void deleteTransaction(portfolio.id, transaction.id)}>
                            Sil
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </div>
      </div>

      <TransactionModal
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        portfolio={portfolio}
        transaction={editingTransaction}
        defaultType={defaultType}
        defaultSymbol={defaultSymbol}
      />
      <AssetTargetDialog
        open={!!targetAsset}
        onOpenChange={(open) => {
          if (!open) setTargetAsset(null);
        }}
        portfolioId={portfolio.id}
        asset={targetAsset}
      />
    </>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone?: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-3 text-2xl font-medium tracking-tight", tone == null ? "text-foreground" : metricTone(tone))}>{value}</div>
      <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{helper}</div>
    </div>
  );
}
