"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  Filter,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import { useDashboardStore } from "@/store/dashboard-store";
import { usePortfolioAnalysis, usePortfolioStore, type Transaction } from "@/store/portfolio-store";
import { AnalysisService } from "@/services/analysis.service";
import { fetchBenchmarks, type BenchmarkData } from "@/lib/api-client";
import { getEarliestTransactionDate, getTargetWeightMap, normalizePortfolio } from "@/lib/portfolio-transactions";
import { TransactionModal } from "@/components/portfolio/transaction-modal";

const PIE_COLORS = ["#0f766e", "#2563eb", "#ca8a04", "#dc2626", "#7c3aed", "#475569"];
type SortKey = "name" | "quantity" | "avgCost" | "currentPrice" | "totalValue" | "profitLoss" | "profitPct" | "weight" | "score";
type SortDirection = "asc" | "desc";

const fmtPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const chartTone = (value: number) => (value >= 0 ? "text-emerald-700" : "text-rose-700");

function fmtCurrency(value: number, locale: string, symbol: string, digits = 2) {
  return `${symbol}${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function actionTone(action?: string) {
  if (action === "Kesin Sat") return "border-rose-500/20 bg-rose-500/10 text-rose-700";
  if (action === "Sat") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  align = "left",
  onChange,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  align?: "left" | "right";
  onChange: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={cn("px-4 py-4", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onChange(sortKey)}
        className={cn("inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground", align === "right" && "ml-auto")}
      >
        {label}
        <span className={active ? "text-foreground" : "text-muted-foreground/40"}>{active ? (direction === "asc" ? "^" : "v") : "+/-"}</span>
      </button>
    </th>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "bg-emerald-500/10 text-emerald-700" : tone === "negative" ? "bg-rose-500/10 text-rose-700" : "bg-primary/10 text-primary";

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4">
      <div className={cn("flex size-10 items-center justify-center rounded-2xl", toneClass)}>
        <Icon className="size-5" />
      </div>
      <div className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{helper}</div>
    </div>
  );
}

export function PortfolioManagementPage({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const portfolios = usePortfolioStore((state) => state.portfolios);
  const fetchPortfolios = usePortfolioStore((state) => state.fetchPortfolios);
  const setActivePortfolio = usePortfolioStore((state) => state.setActivePortfolio);
  const runAnalysis = usePortfolioStore((state) => state.runAnalysis);
  const deleteTransaction = usePortfolioStore((state) => state.deleteTransaction);
  const deleteSymbolTransactions = usePortfolioStore((state) => state.deleteSymbolTransactions);
  const isLoading = usePortfolioStore((state) => state.isLoading);
  const analysis = usePortfolioAnalysis();
  const dashboardData = useDashboardStore((state) => state.dashboardData);
  const fetchDashboardData = useDashboardStore((state) => state.fetchDashboardData);

  const [transactionOpen, setTransactionOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
  const [defaultType, setDefaultType] = React.useState<"buy" | "sell">("buy");
  const [defaultSymbol, setDefaultSymbol] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("totalValue");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [assetFilter, setAssetFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "buy" | "sell">("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [benchmarks, setBenchmarks] = React.useState<BenchmarkData | null>(null);
  const [signalMap, setSignalMap] = React.useState<Record<string, { score?: number; regime?: string; volatility?: number }>>({});
  const deferredAssetFilter = React.useDeferredValue(assetFilter);

  React.useEffect(() => {
    if (!dashboardData) fetchDashboardData();
  }, [dashboardData, fetchDashboardData]);

  React.useEffect(() => {
    if (portfolios.length === 0 && !isLoading) fetchPortfolios();
  }, [fetchPortfolios, isLoading, portfolios.length]);

  React.useEffect(() => {
    if (portfolioId) setActivePortfolio(portfolioId);
  }, [portfolioId, setActivePortfolio]);

  const portfolio = React.useMemo(() => {
    const found = portfolios.find((item) => item.id === portfolioId);
    return found ? normalizePortfolio(found) : null;
  }, [portfolioId, portfolios]);

  React.useEffect(() => {
    if (portfolio?.assets.length) runAnalysis(portfolio.id);
  }, [portfolio?.assets.length, portfolio?.id, runAnalysis]);

  const {
    totalValue,
    displayCurrency,
    toggleCurrency,
    normalizeToTRY,
    convertToDisplay,
    getDataItem,
    getAssetCurrency,
    liveQuotes,
    currencySymbol,
    locale,
  } = usePerformanceCalculator(portfolio ? [portfolio] : []);

  const earliestDate = React.useMemo(() => getEarliestTransactionDate(portfolio?.transactions || []), [portfolio?.transactions]);

  React.useEffect(() => {
    let active = true;
    async function loadBenchmarks() {
      if (!earliestDate) {
        setBenchmarks(null);
        return;
      }
      try {
        const data = await fetchBenchmarks("all", earliestDate);
        if (active) setBenchmarks(data);
      } catch {
        if (active) setBenchmarks(null);
      }
    }
    loadBenchmarks();
    return () => {
      active = false;
    };
  }, [earliestDate]);

  React.useEffect(() => {
    let active = true;
    async function loadSignals() {
      if (!portfolio?.assets.length) {
        setSignalMap({});
        return;
      }
      const response = await AnalysisService.batchAnalyze(portfolio.assets.map((asset) => asset.symbol));
      if (!active) return;
      const mapped: Record<string, { score?: number; regime?: string; volatility?: number }> = {};
      response.results.forEach((result) => {
        mapped[result.symbol] = { score: result.score, regime: result.regime, volatility: result.volatility };
      });
      setSignalMap(mapped);
    }
    loadSignals();
    return () => {
      active = false;
    };
  }, [portfolio?.assets]);

  const positions = React.useMemo(() => {
    if (!portfolio) return [];
    return portfolio.assets.map((asset) => {
      const live = liveQuotes[asset.symbol];
      const item = getDataItem(asset.symbol);
      const currentRaw = live?.last || item?.last || asset.avg_price || asset.avgPrice || 0;
      const assetCurrency = getAssetCurrency(asset, live, item);
      const currentTRY = normalizeToTRY(currentRaw, assetCurrency);
      const avgTRY = normalizeToTRY(asset.avg_price || asset.avgPrice || 0, assetCurrency);
      const totalValueTRY = asset.quantity * currentTRY;
      const totalCostTRY = asset.quantity * avgTRY;
      const profitTRY = totalValueTRY - totalCostTRY;
      const profitPct = totalCostTRY > 0 ? (profitTRY / totalCostTRY) * 100 : 0;
      const signal = signalMap[asset.symbol];
      return {
        ...asset,
        name: asset.name || item?.name || asset.symbol,
        currentPriceDisplay: convertToDisplay(currentTRY),
        avgCostDisplay: convertToDisplay(avgTRY),
        totalValueDisplay: convertToDisplay(totalValueTRY),
        profitDisplay: convertToDisplay(profitTRY),
        totalValueTRY,
        profitTRY,
        profitPct,
        dailyChangePct: live?.change_percent ?? item?.change_percent ?? 0,
        score: signal?.score,
        regime: signal?.regime,
        volatility: signal?.volatility,
      };
    });
  }, [convertToDisplay, getAssetCurrency, getDataItem, liveQuotes, normalizeToTRY, portfolio, signalMap]);

  const totalValueTRY = React.useMemo(() => positions.reduce((sum, item) => sum + item.totalValueTRY, 0), [positions]);
  const weightedPositions = React.useMemo(
    () => positions.map((item) => ({ ...item, weight: totalValueTRY > 0 ? (item.totalValueTRY / totalValueTRY) * 100 : 0 })),
    [positions, totalValueTRY]
  );
  const holdingDecisionMap = React.useMemo(
    () => Object.fromEntries((analysis?.holding_decisions || []).map((item) => [item.symbol, item])),
    [analysis?.holding_decisions]
  );

  const totalBuyCostTRY = React.useMemo(
    () =>
      (portfolio?.transactions || [])
        .filter((tx) => !tx.hidden && tx.type === "buy")
        .reduce((sum, tx) => sum + normalizeToTRY(tx.quantity * (tx.price || 0), tx.currency), 0),
    [normalizeToTRY, portfolio?.transactions]
  );

  const totalSellValueTRY = React.useMemo(
    () =>
      (portfolio?.transactions || [])
        .filter((tx) => !tx.hidden && tx.type === "sell")
        .reduce((sum, tx) => sum + normalizeToTRY(tx.quantity * (tx.price || 0), tx.currency), 0),
    [normalizeToTRY, portfolio?.transactions]
  );

  const realizedPnlTRY = React.useMemo(
    () =>
      (portfolio?.transactions || [])
        .filter((tx) => !tx.hidden && tx.type === "sell")
        .reduce((sum, tx) => sum + normalizeToTRY(tx.realized_profit_loss || tx.profit_loss || 0, tx.currency), 0),
    [normalizeToTRY, portfolio?.transactions]
  );

  const totalProfitTRY = totalValueTRY + totalSellValueTRY - totalBuyCostTRY;
  const nominalReturnPct = totalBuyCostTRY > 0 ? (totalProfitTRY / totalBuyCostTRY) * 100 : 0;
  const realReturnPct = benchmarks ? ((1 + nominalReturnPct / 100) / (1 + benchmarks.inflation / 100) - 1) * 100 : null;

  const dailyChange = React.useMemo(() => {
    let previousTRY = 0;
    weightedPositions.forEach((item) => {
      previousTRY += item.dailyChangePct !== -100 ? item.totalValueTRY / (1 + item.dailyChangePct / 100) : item.totalValueTRY;
    });
    const amountTRY = totalValueTRY - previousTRY;
    return {
      amount: convertToDisplay(amountTRY),
      pct: previousTRY > 0 ? (amountTRY / previousTRY) * 100 : 0,
    };
  }, [convertToDisplay, totalValueTRY, weightedPositions]);

  const chartData = React.useMemo(() => {
    const curve = analysis?.portfolio_id === portfolio?.id ? analysis.equity_curve : [];
    return curve.map((point) => ({
      date: new Date(point.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }),
      value: convertToDisplay(point.value),
    }));
  }, [analysis, convertToDisplay, portfolio?.id]);

  const sortedPositions = React.useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...weightedPositions].sort((left, right) => {
      const leftValue =
        sortKey === "name"
          ? left.name.toLowerCase()
          : sortKey === "quantity"
            ? left.quantity
            : sortKey === "avgCost"
              ? left.avgCostDisplay
              : sortKey === "currentPrice"
                ? left.currentPriceDisplay
                : sortKey === "totalValue"
                  ? left.totalValueDisplay
                  : sortKey === "profitLoss"
                    ? left.profitDisplay
                    : sortKey === "profitPct"
                      ? left.profitPct
                      : sortKey === "weight"
                        ? left.weight
                        : left.score || 0;
      const rightValue =
        sortKey === "name"
          ? right.name.toLowerCase()
          : sortKey === "quantity"
            ? right.quantity
            : sortKey === "avgCost"
              ? right.avgCostDisplay
              : sortKey === "currentPrice"
                ? right.currentPriceDisplay
                : sortKey === "totalValue"
                  ? right.totalValueDisplay
                  : sortKey === "profitLoss"
                    ? right.profitDisplay
                    : sortKey === "profitPct"
                      ? right.profitPct
                      : sortKey === "weight"
                        ? right.weight
                        : right.score || 0;
      if (typeof leftValue === "string" && typeof rightValue === "string") return leftValue.localeCompare(rightValue) * dir;
      return (((leftValue as number) ?? 0) - ((rightValue as number) ?? 0)) * dir;
    });
  }, [sortDirection, sortKey, weightedPositions]);

  const visibleTransactions = React.useMemo(() => {
    return (portfolio?.transactions || [])
      .filter((tx) => !tx.hidden)
      .filter((tx) => (typeFilter === "all" ? true : tx.type === typeFilter))
      .filter((tx) => (deferredAssetFilter ? tx.symbol.toLowerCase().includes(deferredAssetFilter.toLowerCase()) : true))
      .filter((tx) => {
        const currentDate = (tx.date || tx.sell_date || tx.buy_date || "").slice(0, 10);
        if (startDate && currentDate < startDate) return false;
        if (endDate && currentDate > endDate) return false;
        return true;
      })
      .sort((left, right) => (right.date || right.sell_date || right.buy_date || "").localeCompare(left.date || left.sell_date || left.buy_date || ""));
  }, [deferredAssetFilter, endDate, portfolio?.transactions, startDate, typeFilter]);

  const allocationData = React.useMemo(() => weightedPositions.map((item) => ({ name: item.symbol, value: item.totalValueDisplay, weight: item.weight })), [weightedPositions]);
  const categoryData = React.useMemo(() => {
    const groups = new Map<string, number>();
    weightedPositions.forEach((item) => {
      const label = item.type === "stock" ? "Hisseler" : item.type === "crypto" ? "Kripto" : item.type === "fund" ? "Fonlar" : item.type === "fx" ? "Döviz" : item.type === "gold" ? "Altın" : "Diğer";
      groups.set(label, (groups.get(label) || 0) + item.totalValueDisplay);
    });
    return Array.from(groups.entries()).map(([name, value]) => ({ name, value }));
  }, [weightedPositions]);

  const riskData = React.useMemo(() => {
    const groups = new Map<string, number>();
    weightedPositions.forEach((item) => {
      const label = (item.volatility || 0) > 0.5 ? "Yüksek" : (item.volatility || 0) > 0.3 ? "Artmış" : (item.volatility || 0) > 0.15 ? "Orta" : "Düşük";
      groups.set(label, (groups.get(label) || 0) + 1);
    });
    return Array.from(groups.entries()).map(([name, value]) => ({ name, value }));
  }, [weightedPositions]);

  const targetMap = React.useMemo(() => getTargetWeightMap(portfolio?.assets || []), [portfolio?.assets]);
  const rebalanceRows = React.useMemo(
    () =>
      weightedPositions.map((item) => {
        const target = targetMap[item.symbol] || 0;
        const deviation = item.weight - target;
        return {
          symbol: item.symbol,
          current: item.weight,
          target,
          deviation,
          adjustment: convertToDisplay(((target - item.weight) / 100) * totalValueTRY),
        };
      }),
    [convertToDisplay, targetMap, totalValueTRY, weightedPositions]
  );

  const topContributors = [...weightedPositions].sort((a, b) => b.profitTRY - a.profitTRY).slice(0, 3);
  const worstPerformers = [...weightedPositions].sort((a, b) => a.profitTRY - b.profitTRY).slice(0, 3);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  if (!portfolio && isLoading) {
    return <div className="p-6"><div className="h-40 animate-pulse rounded-3xl bg-muted/40" /></div>;
  }

  if (!portfolio) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Wallet className="size-12 text-muted-foreground/40" />
        <div>
          <h1 className="text-2xl font-semibold">Portföy bulunamadı</h1>
          <p className="mt-2 text-muted-foreground">İstenen portföy yüklenemedi.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/portfolio">Portföylere dön</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6 pb-10">
      <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/[0.03]">
        <div className="space-y-8 p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Link href="/portfolio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" />
                Portföylere dön
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{portfolio.name}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={toggleCurrency}>
                <RefreshCw className="size-4" />
                {displayCurrency}
              </Button>
              <Button
                onClick={() => {
                  setEditingTransaction(null);
                  setDefaultSymbol(null);
                  setDefaultType("buy");
                  setTransactionOpen(true);
                }}
              >
                <Plus className="size-4" />
                İşlem ekle
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Wallet} label="Total portfolio value" value={fmtCurrency(totalValue, locale, currencySymbol)} helper={`${weightedPositions.length} active holdings`} />
            <Metric icon={Activity} label="Daily change" value={fmtCurrency(dailyChange.amount, locale, currencySymbol)} helper={fmtPct(dailyChange.pct)} tone={dailyChange.pct >= 0 ? "positive" : "negative"} />
            <Metric icon={TrendingUp} label="Total profit / loss" value={fmtCurrency(convertToDisplay(totalProfitTRY), locale, currencySymbol)} helper={`Realized ${fmtCurrency(convertToDisplay(realizedPnlTRY), locale, currencySymbol)}`} tone={totalProfitTRY >= 0 ? "positive" : "negative"} />
            <Metric icon={ShieldAlert} label="Real return" value={realReturnPct == null ? "Waiting..." : fmtPct(realReturnPct)} helper={benchmarks ? `Inflation ${benchmarks.inflation.toFixed(2)}%` : "Benchmark sync"} tone={(realReturnPct || 0) >= 0 ? "positive" : "negative"} />
          </div>

          {!!analysis?.alerts?.length && (
            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-amber-700">Portföy Uyarıları</div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {analysis.alerts.slice(0, 4).map((alert) => (
                  <div key={`${alert.symbol}-${alert.severity}`} className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{alert.symbol}</div>
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", actionTone(alert.severity))}>{alert.severity}</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{alert.message || "Bu pozisyon icin dikkat gerektiren sinyal var."}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <Card className="border-border/60 bg-background/70 shadow-none">
              <CardHeader className="pb-0">
                <CardTitle className="text-2xl">Portföy özeti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="h-72">
                  {chartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="curve" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.14} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                        <YAxis tickLine={false} axisLine={false} tickMargin={10} fontSize={12} width={70} />
                        <Tooltip
                          content={({ active, payload, label }) =>
                            !active || !payload?.length ? null : (
                              <div className="rounded-2xl border border-border bg-popover px-4 py-3 shadow-xl">
                                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
                                <div className="mt-2 text-sm font-semibold">{fmtCurrency(Number(payload[0].value || 0), locale, currencySymbol)}</div>
                              </div>
                            )
                          }
                        />
                        <Area type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2.4} fill="url(#curve)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
                      Performance curve will appear after analysis data is available.
                    </div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {[["Portföy", nominalReturnPct], ["BIST 100", benchmarks?.bist100 ?? 0], ["USD", benchmarks?.usd ?? 0], ["Altın", benchmarks?.gold ?? 0]].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-border/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
                      <div className={cn("mt-2 text-lg font-semibold", chartTone(Number(value)))}>{benchmarks || label === "Portföy" ? fmtPct(Number(value)) : "-"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-2xl">Mevcut dağılım</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-72">
                  {allocationData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={76} outerRadius={108} paddingAngle={3}>
                          {allocationData.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) =>
                            !active || !payload?.length ? null : (
                              <div className="rounded-2xl border border-border bg-popover px-4 py-3 shadow-xl">
                                <div className="text-sm font-semibold">{payload[0].payload.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{payload[0].payload.weight.toFixed(2)}% weight</div>
                              </div>
                            )
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
                      Add transactions to populate allocation.
                    </div>
                  )}
                </div>
                <Separator />
                <div className="space-y-3">
                  {allocationData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{item.weight.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Card className="border-border/60 shadow-none">
        <CardHeader className="pb-0">
          <CardTitle className="text-2xl">Mevcut varlıklar</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-3xl border border-border/60">
            <table className="min-w-full border-collapse">
              <thead className="bg-muted/30">
                <tr>
                  <SortHeader label="Asset Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onChange={changeSort} />
                  <SortHeader label="Quantity" sortKey="quantity" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Average Cost" sortKey="avgCost" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Güncel Fiyat" sortKey="currentPrice" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Total Value" sortKey="totalValue" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Profit / Loss" sortKey="profitLoss" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Profit %" sortKey="profitPct" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <SortHeader label="Weight" sortKey="weight" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <th className="px-4 py-4 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">Sinyal</th>
                  <SortHeader label="Özel Skor" sortKey="score" activeKey={sortKey} direction={sortDirection} onChange={changeSort} align="right" />
                  <th className="px-4 py-4 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">Decision</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Quick actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((item) => {
                  const tone = (item.score || 0) >= 0.7 ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : (item.score || 0) <= 0.35 ? "bg-rose-500/10 text-rose-700 border-rose-500/20" : "bg-slate-500/10 text-slate-700 border-slate-500/20";
                  const decision = holdingDecisionMap[item.symbol];
                  return (
                    <tr key={item.symbol} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/20" onClick={() => router.push(`/market/${item.symbol}`)}>
                      <td className="px-4 py-4"><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.symbol}</div></td>
                      <td className="px-4 py-4 text-right font-mono">{item.quantity.toLocaleString("tr-TR")}</td>
                      <td className="px-4 py-4 text-right font-mono">{fmtCurrency(item.avgCostDisplay, locale, currencySymbol)}</td>
                      <td className="px-4 py-4 text-right font-mono">{fmtCurrency(item.currentPriceDisplay, locale, currencySymbol)}</td>
                      <td className="px-4 py-4 text-right font-mono">{fmtCurrency(item.totalValueDisplay, locale, currencySymbol)}</td>
                      <td className={cn("px-4 py-4 text-right font-mono", chartTone(item.profitDisplay))}>{fmtCurrency(item.profitDisplay, locale, currencySymbol)}</td>
                      <td className={cn("px-4 py-4 text-right font-mono", chartTone(item.profitPct))}>{fmtPct(item.profitPct)}</td>
                      <td className="px-4 py-4 text-right font-mono">{item.weight.toFixed(2)}%</td>
                      <td className="px-4 py-4"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>{item.regime || "Neutral"}</span></td>
                      <td className="px-4 py-4 text-right font-mono">{item.score != null ? `${(item.score * 100).toFixed(0)}/100` : "-"}</td>
                      <td className="px-4 py-4">
                        {decision ? (
                          <div className="space-y-1">
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", actionTone(decision.holding_action))}>{decision.holding_action}</span>
                            <div className="max-w-56 text-xs text-muted-foreground">{decision.holding_action_reason}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Hazirlaniyor</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setEditingTransaction(null); setDefaultType("buy"); setDefaultSymbol(item.symbol); setTransactionOpen(true); }}>Al</Button>
                          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setEditingTransaction(null); setDefaultType("sell"); setDefaultSymbol(item.symbol); setTransactionOpen(true); }}>Sat</Button>
                          <Button size="icon-sm" variant="ghost" onClick={async (event) => { event.stopPropagation(); if (window.confirm(`Remove all transactions for ${item.symbol}?`)) await deleteSymbolTransactions(portfolio.id, item.symbol); }}>
                            <Trash2 className="size-4 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedPositions.length === 0 && <tr><td colSpan={12} className="px-4 py-16 text-center text-sm text-muted-foreground">No open holdings yet. Add your first transaction to start tracking the portfolio.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">Ledger</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)} placeholder="Filter by asset" className="pl-9" />
            </div>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | "buy" | "sell")} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="all">All types</option>
              <option value="buy">Al</option>
              <option value="sell">Sat</option>
            </select>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-3xl border border-border/60">
            <table className="min-w-full border-collapse">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-4 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">Date</th>
                  <th className="px-4 py-4 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">Asset</th>
                  <th className="px-4 py-4 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">Type</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Quantity</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Price</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Realized P/L</th>
                  <th className="px-4 py-4 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-border/60">
                    <td className="px-4 py-4 text-sm">{new Date(tx.date || tx.sell_date || tx.buy_date || "").toLocaleDateString("tr-TR")}</td>
                    <td className="px-4 py-4"><div className="font-medium">{tx.asset_name || tx.symbol}</div><div className="text-xs text-muted-foreground">{tx.symbol}</div></td>
                    <td className="px-4 py-4"><Badge variant="outline" className={tx.type === "buy" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-amber-500/20 bg-amber-500/10 text-amber-700"}>{tx.type === "buy" ? "Al" : "Sat"}</Badge></td>
                    <td className="px-4 py-4 text-right font-mono">{tx.quantity.toLocaleString("tr-TR")}</td>
                    <td className="px-4 py-4 text-right font-mono">{fmtCurrency(tx.price || 0, locale, currencySymbol)}</td>
                    <td className="px-4 py-4 text-right font-mono">{fmtCurrency(tx.quantity * (tx.price || 0), locale, currencySymbol)}</td>
                    <td className={cn("px-4 py-4 text-right font-mono", chartTone(tx.realized_profit_loss || tx.profit_loss || 0))}>{tx.type === "sell" ? fmtCurrency(tx.realized_profit_loss || tx.profit_loss || 0, locale, currencySymbol) : "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingTransaction(tx); setDefaultType((tx.type || "buy") as "buy" | "sell"); setDefaultSymbol(tx.symbol); setTransactionOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { if (window.confirm("Bu işlemi silmek istiyor musun?")) await deleteTransaction(portfolio.id, tx.id); }}>Sil</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleTransactions.length === 0 && <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-muted-foreground">No transactions match the selected filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Contribution and risk</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/60 bg-muted/10 p-4">
              <div className="mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-primary" /><div className="font-medium">Top contributors</div></div>
              <div className="space-y-3">{topContributors.map((item) => <div key={item.symbol} className="flex items-center justify-between rounded-2xl bg-background/80 px-4 py-3"><div><div className="font-medium">{item.symbol}</div><div className="mt-1 text-xs text-emerald-700">{fmtPct(item.profitPct)}</div></div><div className="font-mono text-sm">{fmtCurrency(item.profitDisplay, locale, currencySymbol)}</div></div>)}</div>
            </div>
            <div className="rounded-3xl border border-border/60 bg-muted/10 p-4">
              <div className="mb-4 flex items-center gap-2"><TrendingDown className="size-4 text-primary" /><div className="font-medium">Worst performers</div></div>
              <div className="space-y-3">{worstPerformers.map((item) => <div key={item.symbol} className="flex items-center justify-between rounded-2xl bg-background/80 px-4 py-3"><div><div className="font-medium">{item.symbol}</div><div className="mt-1 text-xs text-rose-700">{fmtPct(item.profitPct)}</div></div><div className="font-mono text-sm">{fmtCurrency(item.profitDisplay, locale, currencySymbol)}</div></div>)}</div>
            </div>
            <div className="rounded-3xl border border-border/60 bg-muted/10 p-4">
              <div className="mb-4 flex items-center gap-2"><PieChartIcon className="size-4 text-primary" /><div className="font-medium">Sector distribution</div></div>
              <div className="h-52">{categoryData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.14} /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={60} /><Tooltip content={({ active, payload }) => !active || !payload?.length ? null : <div className="rounded-2xl border border-border bg-popover px-4 py-3 shadow-xl"><div className="text-sm font-semibold">{payload[0].payload.name}</div><div className="mt-1 text-xs text-muted-foreground">{fmtCurrency(payload[0].payload.value, locale, currencySymbol)}</div></div>} /><Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2563eb" /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet.</div>}</div>
            </div>
            <div className="rounded-3xl border border-border/60 bg-muted/10 p-4">
              <div className="mb-4 flex items-center gap-2"><ShieldAlert className="size-4 text-primary" /><div className="font-medium">Risk distribution</div></div>
              <div className="h-52">{riskData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={riskData}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.14} /><XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={40} /><Tooltip content={({ active, payload }) => !active || !payload?.length ? null : <div className="rounded-2xl border border-border bg-popover px-4 py-3 shadow-xl"><div className="text-sm font-semibold">{payload[0].payload.name}</div><div className="mt-1 text-xs text-muted-foreground">{payload[0].payload.value} assets</div></div>} /><Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#dc2626" /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet.</div>}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Hedef dağılım</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {rebalanceRows.map((item) => <div key={item.symbol} className="rounded-2xl border border-border/60 p-4"><div className="flex items-center justify-between"><div><div className="font-medium">{item.symbol}</div><div className="mt-1 text-xs text-muted-foreground">Mevcut {item.current.toFixed(2)}% - Hedef {item.target.toFixed(2)}%</div></div><div className="text-right"><div className={cn("text-sm font-semibold", chartTone(item.deviation))}>{fmtPct(item.deviation)}</div><div className="mt-1 text-xs text-muted-foreground">{item.adjustment >= 0 ? "Al" : "Azalt"} {fmtCurrency(Math.abs(item.adjustment), locale, currencySymbol)}</div></div></div></div>)}
              {rebalanceRows.length === 0 && <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Rebalancing suggestions will appear once the portfolio has active holdings.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <TransactionModal open={transactionOpen} onOpenChange={setTransactionOpen} portfolio={portfolio} transaction={editingTransaction} defaultType={defaultType} defaultSymbol={defaultSymbol} />
    </div>
  );
}
