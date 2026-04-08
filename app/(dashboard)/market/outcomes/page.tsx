"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Globe,
  Landmark,
  RefreshCw,
  Target,
  TrendingUp,
  Waves,
  XCircle,
} from "lucide-react";
import {
  fetchMarketOutcomeReport,
  type ProprietaryOutcomeLatestCandidate,
  type ProprietaryOutcomePrediction,
  type ProprietaryOutcomeReport,
  type ProprietaryOutcomeSymbolAlignment,
  type ProprietaryOutcomeWindowSummary,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

type OutcomeMarket = "bist" | "us" | "crypto" | "commodities" | "funds";
type DisplayItem = ProprietaryOutcomeLatestCandidate | ProprietaryOutcomePrediction | ProprietaryOutcomeSymbolAlignment;

const MARKETS: Array<{ id: OutcomeMarket; name: string; icon: React.ElementType }> = [
  { id: "bist", name: "BIST", icon: TrendingUp },
  { id: "us", name: "ABD", icon: Globe },
  { id: "crypto", name: "Kripto", icon: Activity },
  { id: "commodities", name: "Emtia", icon: Waves },
  { id: "funds", name: "Fon", icon: Landmark },
];

const HORIZONS = [
  { value: 1, label: "1 Gün" },
  { value: 5, label: "5 Gün" },
  { value: 30, label: "30 Gün" },
  { value: 180, label: "6 Ay" },
  { value: 365, label: "1 Yıl" },
  { value: 730, label: "2 Yıl" },
];

function tone(value: number) {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-slate-500";
}

function metricTone(value: number) {
  return value >= 60 ? "text-emerald-600" : value >= 45 ? "text-amber-600" : "text-rose-600";
}

function formatPercent(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStamp(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function horizonLabel(horizon: number) {
  return HORIZONS.find((item) => item.value === horizon)?.label ?? `${horizon} Gün`;
}

function summarizePredictions(items: ProprietaryOutcomePrediction[]) {
  if (!items.length) {
    return { count: 0, avgPredictionEdgePct: 0, avgReturnPct: 0 };
  }
  return {
    count: items.length,
    avgPredictionEdgePct:
      items.reduce((sum, item) => sum + Number(item.prediction_edge_pct || 0), 0) / items.length,
    avgReturnPct:
      items.reduce((sum, item) => sum + Number(item.future_return_pct || 0), 0) / items.length,
  };
}

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight", className)}>{value}</p>
      {sub ? <p className="mt-2 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function WindowCard({
  title,
  description,
  data,
  icon,
}: {
  title: string;
  description: string;
  data?: ProprietaryOutcomeWindowSummary;
  icon: React.ReactNode;
}) {
  const summary = data ?? {
    sample_size: 0,
    avg_return_pct: 0,
    avg_excess_return_pct: 0,
    direction_hit_rate: 0,
    alpha_hit_rate: 0,
    avg_benchmark_return_pct: 0,
  };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {icon}
            {title}
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">{summary.sample_size} gözlem</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Alfa İsabeti</p>
          <p className={cn("text-sm font-bold", metricTone(summary.alpha_hit_rate || 0))}>
            %{(summary.alpha_hit_rate || 0).toFixed(1)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ortalama Getiri</p>
          <p className={cn("mt-1 text-base font-bold", tone(summary.avg_return_pct || 0))}>
            {formatPercent(summary.avg_return_pct || 0)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Piyasa Üzeri</p>
          <p className={cn("mt-1 text-base font-bold", tone(summary.avg_excess_return_pct || 0))}>
            {formatPercent(summary.avg_excess_return_pct || 0)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Yön İsabeti</p>
          <p className={cn("mt-1 text-base font-bold", metricTone(summary.direction_hit_rate || 0))}>
            %{(summary.direction_hit_rate || 0).toFixed(1)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Piyasa Getirisi</p>
          <p className={cn("mt-1 text-base font-bold", tone(summary.avg_benchmark_return_pct || 0))}>
            {formatPercent(summary.avg_benchmark_return_pct || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ListCard({
  title,
  items,
  variant,
  emptyMessage,
}: {
  title: string;
  items: DisplayItem[];
  variant: "market" | "prediction" | "alignment";
  emptyMessage: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 text-sm font-medium">{title}</div>
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {!items.length ? (
          <div className="rounded-xl bg-muted/30 px-3 py-3 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          items.map((item, index) => {
            if (variant === "market") {
              const row = item as ProprietaryOutcomeLatestCandidate;
              const score = Number(row.market_signal?.score ?? row.score_value ?? 0);
              const probability = Number(row.market_signal?.probability_positive ?? row.probability_positive ?? 0) * 100;
              const excess = Number(row.market_signal?.expected_excess_return_pct ?? row.expected_excess_return_pct ?? 0);
              const action = row.market_signal?.action || (score >= 62 ? "Izle" : "Zayif");
              const horizon = row.market_signal?.horizon || row.score_label || "Takip";
              return (
                <div key={`${title}-${row.symbol}-${index}`} className="rounded-xl bg-muted/30 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/market/${row.symbol}`} className="text-sm font-semibold hover:text-primary">
                        {row.symbol}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.name || "-"}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {action} · {horizon}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold">{formatNumber(Number(row.last || 0))}</p>
                      <p className={cn("text-xs", tone(Number(row.change_percent || 0)))}>
                        {formatPercent(Number(row.change_percent || 0))}
                      </p>
                      <p className={cn("text-xs font-medium", metricTone(score))}>Skor {score.toFixed(0)}</p>
                      <p className="text-[11px] text-muted-foreground">Olasılık %{probability.toFixed(0)}</p>
                      <p className={cn("text-[11px]", tone(excess))}>Beklenen alfa {formatPercent(excess)}</p>
                    </div>
                  </div>
                </div>
              );
            }

            if (variant === "prediction") {
              const prediction = item as ProprietaryOutcomePrediction;
              return (
                <div key={`${title}-${prediction.symbol}-${prediction.from_date}-${index}`} className="rounded-xl bg-muted/30 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/market/${prediction.symbol}`} className="text-sm font-semibold hover:text-primary">
                        {prediction.symbol}
                      </Link>
                      <p className="text-xs text-muted-foreground">{prediction.segment_label || "-"}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {prediction.from_date} → {prediction.to_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-mono text-sm font-semibold", tone(Number(prediction.prediction_edge_pct || 0)))}>
                        {formatPercent(Number(prediction.prediction_edge_pct || 0))}
                      </p>
                      <p className={cn("text-xs", tone(Number(prediction.future_return_pct || 0)))}>
                        Getiri {formatPercent(Number(prediction.future_return_pct || 0))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Olasılık %{(Number(prediction.probability_outperform || 0) * 100).toFixed(0)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            const alignment = item as ProprietaryOutcomeSymbolAlignment;
            return (
              <div key={`${title}-${alignment.symbol}-${index}`} className="rounded-xl bg-muted/30 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/market/${alignment.symbol}`} className="text-sm font-semibold hover:text-primary">
                      {alignment.symbol}
                    </Link>
                    <p className="text-xs text-muted-foreground">{alignment.alignment_label || "-"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{alignment.alignment_note}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-mono text-sm font-semibold", tone(Number(alignment.score_effect || 0)))}>
                      {Number(alignment.score_effect || 0) > 0 ? "+" : ""}
                      {Number(alignment.score_effect || 0).toFixed(2)}
                    </p>
                    <p className={cn("text-xs", metricTone(Number(alignment.hit_rate || 0)))}>
                      %{Number(alignment.hit_rate || 0).toFixed(1)} isabet
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function OutcomeDashboardPage() {
  const [market, setMarket] = React.useState<OutcomeMarket>("bist");
  const [horizon, setHorizon] = React.useState(5);
  const [report, setReport] = React.useState<ProprietaryOutcomeReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextReport = await fetchMarketOutcomeReport(market, horizon, 20);
      setReport(nextReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sonuç verisi alınamadı.");
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [horizon, market]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const marketName = MARKETS.find((item) => item.id === market)?.name ?? "BIST";
  const selectedHorizon = horizonLabel(horizon);
  const correct = report?.correct_predictions ?? [];
  const wrong = report?.wrong_predictions ?? [];
  const aligned = report?.score_aligned_symbols ?? [];
  const misaligned = report?.score_misaligned_symbols ?? [];
  const correctSummary = summarizePredictions(correct);
  const wrongSummary = summarizePredictions(wrong);
  const calibrationBuckets = report?.window_summary?.calibration_bucket_summary || [];

  return (
    <div className="no-scrollbar h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="page-shell-wide flex flex-col gap-6">
        <div className="page-header-row">
          <div>
            <div className="h-5" />
            <h1 className="text-2xl font-medium tracking-tight">Sonuç Raporu</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Her piyasa için iki katman okunur: üstte geçmiş doğrulama, altta bugünün aday listesi.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
              {MARKETS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setMarket(item.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      market === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
              {HORIZONS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setHorizon(item.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    horizon === item.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => void load()}
              className="rounded-lg border bg-muted/30 p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              disabled={isLoading}
              title="Seçili piyasa için sonucu yenile"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            </button>
            <Link
              href={`/markets/${market === "bist" ? "bist" : market}`}
              className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Listeye Dön
            </Link>
          </div>
        </div>

        {error && !isLoading ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">{error}</div>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Gözlem Günü" value={String(report.observation_days ?? report.comparison_count ?? 0)} />
              <Stat label="Güncel Liste Tarihi" value={report.latest_snapshot_date ?? "-"} />
              <Stat
                label="Uzun-Kısa Farkı"
                value={formatPercent(report.window_summary?.long_short_spread_pct ?? 0)}
                className={tone(report.window_summary?.long_short_spread_pct ?? 0)}
              />
              <Stat label="Model Ufku" value={selectedHorizon} />
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Seçili Piyasa</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">
                    {marketName} · {selectedHorizon} modeli
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Bugünün aday listesi en güncel snapshot&apos;tan gelir. Geçmiş performans alanı ise aynı ufukta birikmiş günlük
                    kayıtlarla yürür.
                  </p>
                  {report.message ? <p className="mt-2 text-sm text-muted-foreground">{report.message}</p> : null}
                </div>
                <div className="rounded-2xl bg-muted/40 px-4 py-3 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Son Veri</p>
                  <p className="mt-1 text-lg font-semibold">{formatStamp(report.latest_snapshot_date)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <WindowCard
                title={`${selectedHorizon} yükseliş modeli`}
                description={`Son ${report.observation_days ?? report.comparison_count ?? 0} gözlemde seçilen güçlü listenin yön ve alfa performansı.`}
                data={report.window_summary?.rising}
                icon={<Target className="size-4 text-emerald-500" />}
              />
              <WindowCard
                title={`${selectedHorizon} düşüş modeli`}
                description={`Son ${report.observation_days ?? report.comparison_count ?? 0} gözlemde seçilen zayıf listenin aşağı yön başarısı.`}
                data={report.window_summary?.falling}
                icon={<XCircle className="size-4 text-rose-500" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ListCard
                title={`Bugünün ${selectedHorizon} yükseliş adayları`}
                items={report.latest_candidates?.rising || []}
                variant="market"
                emptyMessage="Güncel yükseliş aday listesi henüz oluşmadı."
              />
              <ListCard
                title={`Bugünün ${selectedHorizon} düşüş adayları`}
                items={report.latest_candidates?.falling || []}
                variant="market"
                emptyMessage="Güncel düşüş aday listesi henüz oluşmadı."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Doğru Tahmin Sayısı" value={String(correctSummary.count)} sub={`Ortalama etki ${formatPercent(correctSummary.avgPredictionEdgePct)}`} />
              <Stat label="Yanlış Tahmin Sayısı" value={String(wrongSummary.count)} sub={`Ortalama sapma ${formatPercent(wrongSummary.avgPredictionEdgePct)}`} />
              <Stat label="Doğru Tahmin Getirisi" value={formatPercent(correctSummary.avgReturnPct)} className={tone(correctSummary.avgReturnPct)} />
              <Stat label="Yanlış Tahmin Getirisi" value={formatPercent(wrongSummary.avgReturnPct)} className={tone(wrongSummary.avgReturnPct)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ListCard
                title={`${selectedHorizon} tarihsel doğru tahminler`}
                items={correct}
                variant="prediction"
                emptyMessage="Bu ufukta yeterli doğru tahmin örneği henüz birikmedi."
              />
              <ListCard
                title={`${selectedHorizon} tarihsel yanlış tahminler`}
                items={wrong}
                variant="prediction"
                emptyMessage="Bu ufukta anlamlı yanlış tahmin örneği henüz birikmedi."
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ListCard
                title={`${selectedHorizon} için skora uyan semboller`}
                items={aligned}
                variant="alignment"
                emptyMessage="Skora uyumlu sembol hafızası için daha fazla gözlem gerekiyor."
              />
              <ListCard
                title={`${selectedHorizon} için skora ters davranan semboller`}
                items={misaligned}
                variant="alignment"
                emptyMessage="Şimdilik skora ters davranan belirgin bir sembol hafızası oluşmadı."
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
              <div className="rounded-2xl border bg-card p-5">
                <div className="text-sm font-medium">Kalibrasyon Özeti</div>
                <div className="mt-3 max-h-[22rem] overflow-y-auto">
                  {!calibrationBuckets.length ? (
                    <div className="rounded-xl bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                      Kalibrasyon kovaları için daha fazla tarihsel örnek gerekiyor.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {calibrationBuckets.map((bucket) => (
                        <div key={bucket.bucket} className="grid grid-cols-[100px_1fr_1fr_80px] items-center gap-3 rounded-xl bg-muted/30 px-3 py-3 text-sm">
                          <div className="font-medium">{bucket.bucket}</div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Model</div>
                            <div className={tone((bucket.avg_probability_outperform - 0.5) * 100)}>
                              %{(bucket.avg_probability_outperform * 100).toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Gerçekleşen</div>
                            <div className={tone((bucket.realized_outperform_rate - 0.5) * 100)}>
                              %{(bucket.realized_outperform_rate * 100).toFixed(1)}
                            </div>
                          </div>
                          <div className="text-right text-muted-foreground">{bucket.count}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5">
                <div className="text-sm font-medium">Model Sağlığı</div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl bg-muted/30 px-3 py-3">
                    Snapshot sayısı: <span className="font-medium text-foreground">{report.snapshot_count || 0}</span>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-3 py-3">
                    Karşılaştırma: <span className="font-medium text-foreground">{report.comparison_count || 0}</span>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-3 py-3">
                    Olasılık hata skoru:{" "}
                    <span className="font-medium text-foreground">
                      {(report.window_summary?.probability_brier_score ?? 0).toFixed(4)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-muted/30 px-3 py-3">
                    Uzun-kısa farkı:{" "}
                    <span className={cn("font-medium", tone(report.window_summary?.long_short_spread_pct ?? 0))}>
                      {formatPercent(report.window_summary?.long_short_spread_pct ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-2xl border bg-card" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
