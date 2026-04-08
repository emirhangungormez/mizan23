"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { MarketService } from "@/services/market.service";
import { usePortfolioStore } from "@/store/portfolio-store";
import { cn } from "@/lib/utils";

type SignalPayload = {
  score?: number;
  action?: string;
  thesis?: string;
  horizon?: string;
  risk?: string;
};

type CalendarPayload = {
  dividend_date?: string | null;
  ex_dividend_date?: string | null;
  earnings_date?: string | null;
};

type MarketRow = {
  symbol: string;
  name?: string;
  last?: number;
  change_percent?: number;
  data_status?: string;
  rsi?: number;
  dividend_yield?: number;
  dividend_consistency_score?: number;
  finansal_dayaniklilik_skoru?: number;
  sermaye_disiplini_skoru?: number;
  halka_aciklik_risk_skoru?: number;
  temettu_guven_skoru?: number;
  temettu_tuzagi_riski?: number;
  temettu_takvim_firsati?: number;
  portfolio_fit_score?: number;
  portfolio_action?: string;
  portfolio_action_reason?: string;
  regime_label?: string;
  hakiki_alfa?: {
    hakiki_alfa_pct?: number;
  };
  signals?: Record<string, SignalPayload>;
  calendar?: CalendarPayload;
  dividends?: Array<{
    date?: string | null;
    amount?: number | null;
  }>;
  data_quality?: {
    score_confidence?: number;
    score_confidence_label?: string;
  };
  [key: string]: unknown;
};

type AdviceRow = {
  symbol: string;
  name: string;
  price?: number;
  day?: number;
  hakikiAlfa: number;
  score: number;
  action: string;
  window: string;
  note?: string;
  confidence?: number;
  probability_positive?: number;
  probability_outperform?: number;
  expected_return_pct?: number;
  expected_excess_return_pct?: number;
  risk_forecast_pct?: number;
  signal_id?: string;
  signal_version?: string;
  calibration_version?: string;
  decision_band?: string;
  thesis?: string;
};

type PortfolioAdviceRow = AdviceRow & {
  quantity: number;
  avgPrice?: number;
  pnlPct?: number;
};

type DividendRow = {
  symbol: string;
  name: string;
  dividendDate: string;
  exDate?: string;
  daysLeft: number;
  yieldPct: number;
  discipline: number;
  confidence?: number;
  note: string;
};

type UpcomingDividendApiRow = {
  symbol: string;
  name?: string;
  next_dividend_date?: string | null;
  last_dividend_date?: string | null;
  next_dividend_amount?: number | null;
  days_left?: number;
  dividend_yield?: number | null;
  dividend_consistency_score?: number;
  temettu_guven_skoru?: number;
  temettu_tuzagi_riski?: number;
  change_percent?: number | null;
};

type OppositePairRow = {
  left_symbol: string;
  left_name?: string;
  left_sector?: string;
  left_themes?: string[];
  left_return_2y_pct?: number;
  left_return_5y_pct?: number;
  right_symbol: string;
  right_name?: string;
  right_sector?: string;
  right_themes?: string[];
  right_return_2y_pct?: number;
  right_return_5y_pct?: number;
  correlation_2y?: number;
  correlation_5y?: number;
  window_correlation?: number;
  opposite_ratio_2y?: number;
  opposite_ratio_5y?: number;
  window_opposite_ratio?: number;
  inverse_score?: number;
  inverse_strength_label?: string;
  stability_score?: number;
  stability_label?: string;
  why_opposite?: string;
  thesis?: string;
};

type OppositeWindow = "1m" | "1y" | "2y" | "5y";

type OppositeMeta = {
  scanMode?: string;
  scanInProgress?: boolean;
  generatedAt?: string | null;
  scannedSymbols?: number;
  windowLabel?: string;
  basis?: string;
  usingFallback?: boolean;
};

const ANALYSIS_CACHE_SCHEMA_VERSION = 2;

function readAnalysisCache(): MarketRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem("analysis-last-known:bist");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { schemaVersion?: number; rows?: MarketRow[] };
    if ((parsed?.schemaVersion || 0) !== ANALYSIS_CACHE_SCHEMA_VERSION) {
      window.sessionStorage.removeItem("analysis-last-known:bist");
      return [];
    }
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function writeAnalysisCache(rows: MarketRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("analysis-last-known:bist", JSON.stringify({
      schemaVersion: ANALYSIS_CACHE_SCHEMA_VERSION,
      rows,
    }));
  } catch {
    // Ignore storage errors.
  }
}

function getNumber(item: MarketRow, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return undefined;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getHakikiAlfa(item: MarketRow) {
  return getNumber(item, "hakiki_alfa_pct") ?? normalizeNumber(item.hakiki_alfa?.hakiki_alfa_pct) ?? 0;
}

function getConfidence(item: MarketRow) {
  return normalizeNumber(item.data_quality?.score_confidence);
}

function scoreSignal(item: MarketRow, key: string) {
  return item.signals?.[key]?.score ?? 0;
}

function fmtPrice(value?: number) {
  if (value == null || Number.isNaN(value)) return "-";
  return `₺${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value?: number) {
  if (value == null || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtRatio(value?: number) {
  if (value == null || Number.isNaN(value)) return "-";
  return `%${(value * 100).toFixed(0)}`;
}

function getWindowLabel(window: OppositeWindow) {
  switch (window) {
    case "1m":
      return "1 Aylik";
    case "1y":
      return "1 Yillik";
    case "2y":
      return "2 Yillik";
    case "5y":
      return "5 Yillik";
    default:
      return "2 Yillik";
  }
}

function describeCorrelation(value?: number) {
  if (value == null || Number.isNaN(value)) return "Birlikte hareket belirsiz";
  if (value <= -0.35) return "Genelde ters yone kayiyor";
  if (value <= -0.1) return "Zaman zaman ters davraniyor";
  if (value < 0.2) return "Birlikte gitme baglari zayif";
  if (value < 0.45) return "Yer yer ayni yone kayabiliyor";
  return "Cogu donemde birlikte hareket ediyor";
}

function describeOppositeRatio(value?: number, window?: OppositeWindow) {
  if (value == null || Number.isNaN(value)) return "Ters yon oranı hesaplanamadi";
  const ratioText = `donemlerin %${Math.round(value * 100)}'sinde`;
  if (window === "1m") return `${ratioText} farkli yone kapanmislar.`;
  if (window === "1y") return `${ratioText} farkli yone gitmisler.`;
  return `${ratioText} biri guclenirken digeri zayiflamis.`;
}

function parseDateLike(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const ts = new Date(value);
    return Number.isNaN(ts.getTime()) ? null : ts;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = trimmed.replace(/\./g, "-").replace(/\//g, "-");
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function fmtDate(value?: string) {
  const parsed = parseDateLike(value);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(value?: string | null) {
  const parsed = parseDateLike(value);
  if (!parsed) return "-";
  return parsed.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(value?: string) {
  const parsed = parseDateLike(value);
  if (!parsed) return Number.POSITIVE_INFINITY;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

function buildAdviceBuckets(rows: MarketRow[]) {
  const buyNow: AdviceRow[] = [];
  const buyWeek: AdviceRow[] = [];
  const hold: AdviceRow[] = [];
  const sell: AdviceRow[] = [];

  for (const item of rows) {
    const firsat = scoreSignal(item, "firsatlar");
    const trade = scoreSignal(item, "trade");
    const uzun = scoreSignal(item, "uzun_vade");
    const hakikiAlfa = getHakikiAlfa(item);
    const rsi = getNumber(item, "rsi") ?? 50;
    const day = getNumber(item, "change_percent") ?? 0;
    const confidence = getConfidence(item);
    const base = {
      symbol: item.symbol,
      name: item.name || item.symbol,
      price: getNumber(item, "last"),
      day,
      hakikiAlfa,
      confidence,
    };

    if ((firsat >= 85 || trade >= 80) && hakikiAlfa > 0) {
      buyNow.push({
        ...base,
        score: Math.max(firsat, trade),
        action: "Bugun Al",
        window: rsi >= 70 ? "Bugun al, 1-3 gunde realize et" : "Bugun al, 1-5 gun izle",
        note: item.signals?.firsatlar?.thesis || "Momentum, likidite ve hakiki alfa birlikte guclu.",
      });
      continue;
    }

    if ((firsat >= 74 || trade >= 66) && hakikiAlfa >= -0.15) {
      buyWeek.push({
        ...base,
        score: Math.max(firsat, trade),
        action: "Bu Hafta Topla",
        window: "3-7 gun icinde kademeli al",
        note: item.signals?.trade?.thesis || "Kurulum hazirlaniyor; teyitle guclenebilir.",
      });
      continue;
    }

    if (uzun >= 78 && hakikiAlfa >= 0) {
      hold.push({
        ...base,
        score: uzun,
        action: "Tut / Biriktir",
        window: "1-6 ay tasinabilir",
        note: item.signals?.uzun_vade?.thesis || "Kalite, dayaniklilik ve goreli guc destekliyor.",
      });
      continue;
    }

    if ((hakikiAlfa < -0.5 && firsat < 60 && trade < 58) || (rsi > 74 && day > 3.5)) {
      sell.push({
        ...base,
        score: Math.max(100 - Math.max(firsat, trade), 50),
        action: rsi > 74 && day > 3.5 ? "Kar Al / Azalt" : "Bugun Sat",
        window: rsi > 74 && day > 3.5 ? "Bugun veya 1-2 gunde realize et" : "Bugun / 1-3 gun icinde azalt",
        note: rsi > 74 && day > 3.5
          ? "Hareket isinmis; odul-risk dengesi zayifliyor."
          : "Hakiki alfa ve kisa vade motoru birlikte bozuluyor.",
      });
    }
  }

  const sortDesc = (left: AdviceRow, right: AdviceRow) => right.score - left.score;
  return {
    buyNow: buyNow.sort(sortDesc).slice(0, 12),
    buyWeek: buyWeek.sort(sortDesc).slice(0, 12),
    hold: hold.sort(sortDesc).slice(0, 12),
    sell: sell.sort(sortDesc).slice(0, 12),
  };
}

function buildPortfolioAdvice(
  rows: MarketRow[],
  assets: Array<{ symbol: string; quantity: number; avg_price?: number; avgPrice?: number }>
) {
  const rowBySymbol = new Map(rows.map((row) => [row.symbol.toUpperCase(), row]));
  const results: PortfolioAdviceRow[] = [];

  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    const item = rowBySymbol.get(symbol);
    if (!item) continue;

    const firsat = scoreSignal(item, "firsatlar");
    const trade = scoreSignal(item, "trade");
    const uzun = scoreSignal(item, "uzun_vade");
    const hakikiAlfa = getHakikiAlfa(item);
    const day = getNumber(item, "change_percent") ?? 0;
    const rsi = getNumber(item, "rsi") ?? 50;
    const resilience = getNumber(item, "finansal_dayaniklilik_skoru") ?? 50;
    const capital = getNumber(item, "sermaye_disiplini_skoru") ?? 50;
    const floatRisk = getNumber(item, "halka_aciklik_risk_skoru") ?? 50;
    const avgPrice = asset.avgPrice ?? asset.avg_price;
    const price = getNumber(item, "last");
    const pnlPct = avgPrice && price ? ((price / avgPrice) - 1) * 100 : undefined;
    const confidence = getConfidence(item);

    let action = item.portfolio_action || "Tut";
    let score = getNumber(item, "portfolio_fit_score") ?? Math.max(firsat, trade, uzun);
    let window = "Pozisyon korunabilir";
    let note = String(item.portfolio_action_reason || "Portfoyde kalmaya devam edebilir.");

    if ((hakikiAlfa < -0.7 && trade < 56 && firsat < 60) || (rsi > 76 && day > 4)) {
      action = rsi > 76 && day > 4 ? "Kar Al / Azalt" : "Hemen Cik";
      score = Math.max(65, 100 - Math.max(firsat, trade));
      window = action === "Hemen Cik" ? "Bugun / 1-3 gun" : "Bugun / 1-2 gun";
      note = action === "Hemen Cik"
        ? "Hakiki guc eriyor; sepet agirligini tasimasi zor."
        : "Hareket cok isinmis; kisa vadede kar koruma daha mantikli.";
    } else if (uzun >= 78 && hakikiAlfa >= 0.15 && resilience >= 55 && capital >= 50) {
      action = "Daha Fazla Al";
      score = (uzun + firsat) / 2;
      window = "Kademeli 1-4 hafta";
      note = "Sepette zaten var; kalite ve hakiki alfa daha fazla agirligi destekliyor.";
    } else if (uzun >= 70 && hakikiAlfa >= -0.1) {
      action = "Tut / Biriktir";
      score = uzun;
      window = "1-6 ay";
      note = "Tasima zemini korunuyor; agresif degil ama saglikli.";
    } else if (floatRisk >= 72 && trade < 62) {
      action = "Temkinli Tut";
      score = Math.max(50, 100 - floatRisk);
      window = "Yakindan izle";
      note = "Halka aciklik/tahta kalitesi riski yukseliyor.";
    }

    results.push({
      symbol,
      name: item.name || symbol,
      price,
      day,
      hakikiAlfa,
      score,
      action,
      window,
      note,
      quantity: asset.quantity,
      avgPrice,
      pnlPct,
      confidence,
    });
  }

  return results.sort((left, right) => right.score - left.score);
}

function buildMustOwnCandidates(rows: MarketRow[], heldSymbols: Set<string>) {
  return rows
    .filter((item) => !heldSymbols.has(item.symbol.toUpperCase()))
    .map((item) => {
      const firsat = scoreSignal(item, "firsatlar");
      const trade = scoreSignal(item, "trade");
      const uzun = scoreSignal(item, "uzun_vade");
      const hakikiAlfa = getHakikiAlfa(item);
      const resilience = getNumber(item, "finansal_dayaniklilik_skoru") ?? 50;
      const capital = getNumber(item, "sermaye_disiplini_skoru") ?? 50;
      const portfolioFit = getNumber(item, "portfolio_fit_score") ?? 50;
      const composite = (0.26 * firsat) + (0.14 * trade) + (0.22 * uzun) + (0.12 * resilience) + (0.10 * capital) + (0.16 * portfolioFit);

      if (composite < 76 || hakikiAlfa < 0.1) return null;

      const candidate: AdviceRow = {
        symbol: item.symbol,
        name: item.name || item.symbol,
        price: getNumber(item, "last"),
        day: getNumber(item, "change_percent") ?? 0,
        hakikiAlfa,
        score: composite,
        action: composite >= 84 ? "Sepette Yoksa Al" : "Yakina Al",
        window: composite >= 84 ? "Bu hafta pozisyon ac" : "Izleme listesine al",
        note: String(item.portfolio_action_reason || item.signals?.firsatlar?.thesis || "Motor bu ismi sepette eksik goruyor."),
        confidence: getConfidence(item),
      };

      return candidate;
    })
    .filter((item): item is AdviceRow => item !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

function buildUpcomingDividends(rows: UpcomingDividendApiRow[]) {
  return rows
    .map((item) => {
      const dividendDate = item.next_dividend_date || undefined;
      const daysLeft = typeof item.days_left === "number" ? item.days_left : daysUntil(dividendDate);
      const yieldPct = typeof item.dividend_yield === "number" ? item.dividend_yield : 0;
      const discipline = typeof item.dividend_consistency_score === "number" ? item.dividend_consistency_score : 0;
      const confidence = typeof item.temettu_guven_skoru === "number" ? item.temettu_guven_skoru : 50;
      const trapRisk = typeof item.temettu_tuzagi_riski === "number" ? item.temettu_tuzagi_riski : 50;

      if (!dividendDate || !Number.isFinite(daysLeft) || daysLeft < 0 || daysLeft > 60 || yieldPct <= 0) return null;

      let note = "Temettu tarihi yakinlasiyor; takvim etkisi izlenmeli.";
      if (trapRisk >= 68) {
        note = "Takvim yakin ama temettu tuzagi riski yuksek; verime aldanma.";
      } else if (confidence >= 70) {
        note = "Temettu icin uygun; dagitim disiplini ve kalite birlikte destekliyor.";
      } else if (yieldPct >= 5) {
        note = "Verim dikkat cekici ama kalite teyidi orta seviyede.";
      }

      const dividendRow: DividendRow = {
        symbol: item.symbol,
        name: item.name || item.symbol,
        dividendDate,
        exDate: dividendDate,
        daysLeft,
        yieldPct,
        discipline,
        confidence,
        note,
      };

      return dividendRow;
    })
    .filter((item): item is DividendRow => item !== null)
    .sort((left, right) => {
      if (left.daysLeft !== right.daysLeft) return left.daysLeft - right.daysLeft;
      return right.yieldPct - left.yieldPct;
    })
    .slice(0, 12);
}

function AdviceSection({
  title,
  tone,
  rows,
  compact = false,
  onRefresh,
  isRefreshing = false,
}: {
  title: string;
  tone: "emerald" | "amber" | "blue" | "rose";
  rows: AdviceRow[];
  compact?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const toneMap = {
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
    amber: "border-amber-500/20 bg-amber-500/[0.04]",
    blue: "border-blue-500/20 bg-blue-500/[0.04]",
    rose: "border-rose-500/20 bg-rose-500/[0.04]",
  } as const;

  return (
    <section className={cn("rounded-2xl border p-4", toneMap[tone], compact && "h-full")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-lg border bg-background/70 p-1.5 text-muted-foreground transition-all hover:bg-background hover:text-foreground"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
          </button>
        ) : null}
      </div>

      <div className={cn("space-y-2", compact && "max-h-[360px] overflow-y-auto pr-1")}>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
            Bugun net aday yok.
          </div>
        ) : rows.map((row) => (
          <div key={`${title}-${row.symbol}`} className="rounded-xl border bg-background/80 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/market/${row.symbol}`} className="text-sm font-semibold hover:text-primary">
                  {row.symbol}
                </Link>
                <div className="truncate text-[11px] text-muted-foreground">{row.name}</div>
              </div>
              <div className="text-right text-[11px]">
                <div className="font-semibold text-foreground">{row.action}</div>
                <div className="text-muted-foreground">{row.window}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="font-mono font-semibold text-foreground">{fmtPrice(row.price)}</span>
              <span className={cn("font-mono font-semibold", (row.day ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(row.day)}</span>
              <span className="text-muted-foreground">Guven {row.confidence != null ? `${Math.round(row.confidence)}/100` : "--"}</span>
              {row.probability_positive != null ? (
                <span className="text-muted-foreground">Yukselis %{Math.round(row.probability_positive * 100)}</span>
              ) : null}
              {row.expected_excess_return_pct != null ? (
                <span className={cn("font-medium", (row.expected_excess_return_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  Alfa {fmtPct(row.expected_excess_return_pct)}
                </span>
              ) : null}
            </div>
            {row.thesis ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{row.thesis}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DividendSection({
  rows,
  onRefresh,
  isRefreshing = false,
}: {
  rows: DividendRow[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Yakinda Temettu</h2>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-lg border bg-background/70 p-1.5 text-muted-foreground transition-all hover:bg-background hover:text-foreground"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-1">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
            Yakin temettu yok.
          </div>
        ) : (
          <div className="flex min-w-max items-center gap-2">
            {rows.map((row) => (
              <Link
                key={`dividend-${row.symbol}`}
                href={`/market/${row.symbol}`}
                className="inline-flex min-w-[200px] flex-col items-start gap-1 rounded-xl border bg-background/80 px-3 py-2.5 text-sm transition-colors hover:bg-muted/20"
              >
                <span className="font-semibold text-foreground">{row.symbol}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-emerald-600">{fmtPct(row.yieldPct)}</span>
                  {" • "}
                  {row.daysLeft} gun
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OppositeSection({
  rows,
  isLoading,
  selectedWindow,
  onWindowChange,
  meta,
  onRefresh,
}: {
  rows: OppositePairRow[];
  isLoading?: boolean;
  selectedWindow: OppositeWindow;
  onWindowChange: (window: OppositeWindow) => void;
  meta?: OppositeMeta | null;
  onRefresh?: () => void;
}) {
  const windowOptions: Array<{ value: OppositeWindow; label: string }> = [
    { value: "1m", label: "1A" },
    { value: "1y", label: "1Y" },
    { value: "2y", label: "2Y" },
    { value: "5y", label: "5Y" },
  ];
  const windowLabel = meta?.windowLabel || getWindowLabel(selectedWindow);
  const isRefreshing = Boolean(isLoading || meta?.scanInProgress);
  const showInitialLoading = Boolean(isRefreshing && rows.length === 0 && !meta?.usingFallback);

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Zit Hisseler</h2>
        <div className="flex items-center gap-3">
          <div className="inline-flex w-fit items-center rounded-lg border bg-muted/20 p-1">
            {windowOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onWindowChange(option.value)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  selectedWindow === option.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded-lg border bg-background/70 p-1.5 text-muted-foreground transition-all hover:bg-background hover:text-foreground"
            >
              <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
        {showInitialLoading ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground xl:col-span-2">
            <div className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Zit ciftler guncelleniyor...</span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground xl:col-span-2">
            {meta?.scanInProgress
              ? "Bu pencere icin veri halen hazirlaniyor. Ilk sonuclar geldiginde burada gosterilecek."
              : "Bu pencere icin yeterli guclu zit cift bulunamadi."}
          </div>
        ) : null}

        {rows.map((row) => (
          <div
            key={`${row.left_symbol}-${row.right_symbol}`}
            className="rounded-xl border bg-background/80 px-3 py-2.5 transition-colors hover:bg-muted/20"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
                  <Link href={`/market/${row.left_symbol}`} className="truncate hover:text-primary">
                    {row.left_symbol}
                  </Link>
                  <span className="inline-flex size-6 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
                    <ArrowLeftRight className="size-3" />
                  </span>
                  <Link href={`/market/${row.right_symbol}`} className="truncate hover:text-primary">
                    {row.right_symbol}
                  </Link>
                </div>
                <span className="hidden h-5 w-px bg-border/70 xl:block" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs xl:flex-nowrap">
                  <span className="text-muted-foreground">Zitlik orani:</span>
                  <span className="font-semibold text-foreground">
                    {fmtRatio(row.window_opposite_ratio ?? row.opposite_ratio_2y)}
                  </span>
                  <span className="text-muted-foreground">Istikrar:</span>
                  <span className="font-semibold text-foreground">{row.stability_label || "--"}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-semibold text-indigo-600">{row.inverse_strength_label || "Orta"}</div>
                <div className="text-[11px] text-muted-foreground">{windowLabel} zitlik</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AnalysisAdvicePage() {
  const [buyNowRows, setBuyNowRows] = React.useState<AdviceRow[]>([]);
  const [buyWeekRows, setBuyWeekRows] = React.useState<AdviceRow[]>([]);
  const [holdRows, setHoldRows] = React.useState<AdviceRow[]>([]);
  const [sellRows, setSellRows] = React.useState<AdviceRow[]>([]);
  const [periodGroups, setPeriodGroups] = React.useState<Array<{
    key: string;
    label: string;
    horizon_days: number;
    rows: AdviceRow[];
  }>>([]);
  const [portfolioCandidates, setPortfolioCandidates] = React.useState<AdviceRow[]>([]);
  const [upcomingDividendRows, setUpcomingDividendRows] = React.useState<UpcomingDividendApiRow[]>([]);
  const [oppositePairs, setOppositePairs] = React.useState<OppositePairRow[]>([]);
  const [selectedOppositeWindow, setSelectedOppositeWindow] = React.useState<OppositeWindow>("2y");
  const [oppositeMeta, setOppositeMeta] = React.useState<OppositeMeta | null>(null);
  const [isOppositeLoading, setIsOppositeLoading] = React.useState(false);
  const [isRowsRefreshing, setIsRowsRefreshing] = React.useState(false);
  const [isDividendRefreshing, setIsDividendRefreshing] = React.useState(false);
  const [isOverviewPreparing, setIsOverviewPreparing] = React.useState(false);
  const [isDividendPreparing, setIsDividendPreparing] = React.useState(false);
  const [overviewMeta, setOverviewMeta] = React.useState<{
    rowsTotal: number;
    usedSnapshotFallback: boolean;
  }>({
    rowsTotal: 0,
    usedSnapshotFallback: false,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const oppositeRetryRef = React.useRef<number | null>(null);
  const overviewRetryRef = React.useRef<number | null>(null);
  const dividendRetryRef = React.useRef<number | null>(null);

  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const fetchPortfolios = usePortfolioStore((state) => state.fetchPortfolios);
  const hasPeriodRows = React.useMemo(() => periodGroups.some((group) => group.rows.length > 0), [periodGroups]);

  const loadDividends = React.useCallback(async () => {
    setIsDividendRefreshing(true);
    try {
      const dividendResponse = await MarketService.getUpcomingBistDividends(60);
      setUpcomingDividendRows(dividendResponse.results || []);
      setIsDividendPreparing(Boolean(dividendResponse.scan_in_progress));

      if (dividendRetryRef.current) {
        window.clearTimeout(dividendRetryRef.current);
        dividendRetryRef.current = null;
      }

      if (dividendResponse.scan_in_progress) {
        dividendRetryRef.current = window.setTimeout(() => {
          void loadDividends();
        }, 15000);
      }
    } catch (dividendError) {
      console.error("Upcoming dividends fetch error:", dividendError);
      setIsDividendPreparing(false);
    } finally {
      setIsDividendRefreshing(false);
    }
  }, []);

  const loadOverview = React.useCallback(async () => {
    if (!hasPeriodRows) {
      setIsLoading(true);
    } else {
      setIsRowsRefreshing(true);
    }
    setError(null);
    try {
      const overview = await MarketService.getBistAnalysisOverview("1m");
      if (!overview) {
        throw new Error("Analiz overview verisi alinamadi.");
      }
      setOverviewMeta({
        rowsTotal: Number(overview.rows_total || 0),
        usedSnapshotFallback: Boolean(overview.used_snapshot_fallback),
      });
      setPeriodGroups(
        (overview.period_lists || []).map((group) => ({
          key: group.key,
          label: group.label,
          horizon_days: group.horizon_days,
          rows: (group.rows || []) as AdviceRow[],
        })),
      );
      setBuyNowRows((overview.advice?.buy_now || []) as AdviceRow[]);
      setBuyWeekRows((overview.advice?.buy_week || []) as AdviceRow[]);
      setHoldRows((overview.advice?.hold || []) as AdviceRow[]);
      setSellRows((overview.advice?.sell || []) as AdviceRow[]);
      setPortfolioCandidates((overview.portfolio_candidates || []) as AdviceRow[]);
      setUpcomingDividendRows((overview.upcoming_dividends || []) as UpcomingDividendApiRow[]);
      setIsDividendPreparing(Boolean(overview.upcoming_dividends_meta?.scan_in_progress));

      const hasOverviewResults =
        (overview.period_lists || []).some((group) => (group.rows || []).length > 0) ||
        (overview.advice?.buy_now?.length || 0) > 0 ||
        (overview.advice?.buy_week?.length || 0) > 0 ||
        (overview.advice?.hold?.length || 0) > 0 ||
        (overview.advice?.sell?.length || 0) > 0 ||
        (overview.portfolio_candidates?.length || 0) > 0 ||
        (overview.upcoming_dividends?.length || 0) > 0;

      if (overviewRetryRef.current) {
        window.clearTimeout(overviewRetryRef.current);
        overviewRetryRef.current = null;
      }

      let shouldKeepPreparing = false;
      if (!hasOverviewResults) {
        const refreshStatus = await MarketService.getBistRefreshStatus();
        shouldKeepPreparing = Boolean(
          refreshStatus.refresh_in_progress ||
          (refreshStatus.total_symbols > 0 && refreshStatus.stocks_cached < refreshStatus.total_symbols)
        );
      }

      setIsOverviewPreparing(shouldKeepPreparing);

      if (shouldKeepPreparing) {
        overviewRetryRef.current = window.setTimeout(() => {
          void loadOverview();
        }, 15000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analiz verisi alinamadi.");
      setIsOverviewPreparing(false);
      setOverviewMeta({
        rowsTotal: 0,
        usedSnapshotFallback: false,
      });
    } finally {
      setIsLoading(false);
      setIsRowsRefreshing(false);
    }
  }, [hasPeriodRows]);

  const loadOppositePairs = React.useCallback(async () => {
    setIsOppositeLoading(true);
    try {
      const usePriorityMode = selectedOppositeWindow !== "5y";
      const primaryCandidateLimit =
        selectedOppositeWindow === "1m"
          ? 40
          : usePriorityMode
            ? 90
            : 150;
      const oppositeResponse = await MarketService.getOppositeBistStocks({
        pairLimit: 8,
        candidateLimit: primaryCandidateLimit,
        fullScan: !usePriorityMode,
        window: selectedOppositeWindow,
      });
      setOppositePairs((oppositeResponse.results || []) as OppositePairRow[]);
      setOppositeMeta({
        scanMode: oppositeResponse.scan_mode,
        scanInProgress: oppositeResponse.scan_in_progress,
        generatedAt: oppositeResponse.generated_at ?? null,
        scannedSymbols: oppositeResponse.scanned_symbols,
        windowLabel: oppositeResponse.window_label,
        basis: oppositeResponse.basis,
        usingFallback: usePriorityMode,
      });
      if (!usePriorityMode && (oppositeResponse.results || []).length === 0 && oppositeResponse.scan_in_progress) {
        const fallbackResponse = await MarketService.getOppositeBistStocks({
          pairLimit: 8,
          candidateLimit: 90,
          fullScan: false,
          window: selectedOppositeWindow,
        });
        if ((fallbackResponse.results || []).length > 0) {
          setOppositePairs((fallbackResponse.results || []) as OppositePairRow[]);
          setOppositeMeta({
            scanMode: fallbackResponse.scan_mode || "priority",
            scanInProgress: true,
            generatedAt: fallbackResponse.generated_at ?? null,
            scannedSymbols: fallbackResponse.scanned_symbols,
            windowLabel: fallbackResponse.window_label,
            basis: fallbackResponse.basis,
            usingFallback: true,
          });
        }
      }

      if (oppositeRetryRef.current) {
        window.clearTimeout(oppositeRetryRef.current);
        oppositeRetryRef.current = null;
      }

      if (oppositeResponse.scan_in_progress) {
        oppositeRetryRef.current = window.setTimeout(() => {
          void loadOppositePairs();
        }, 20000);
      }

    } finally {
      setIsOppositeLoading(false);
    }
  }, [selectedOppositeWindow]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    setOppositePairs([]);
    setOppositeMeta((current) => current ? { ...current, windowLabel: selectedOppositeWindow.toUpperCase(), generatedAt: null, scanInProgress: true } : null);
    void loadOppositePairs();
  }, [loadOppositePairs, selectedOppositeWindow]);

  React.useEffect(() => {
    return () => {
      if (oppositeRetryRef.current) {
        window.clearTimeout(oppositeRetryRef.current);
      }
      if (overviewRetryRef.current) {
        window.clearTimeout(overviewRetryRef.current);
      }
      if (dividendRetryRef.current) {
        window.clearTimeout(dividendRetryRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (portfolios.length === 0) {
      void fetchPortfolios();
    }
  }, [fetchPortfolios, portfolios.length]);

  const activePortfolio = React.useMemo(() => {
    if (portfolios.length === 0) return null;
    return portfolios.find((portfolio) => portfolio.id === activePortfolioId) || portfolios[0] || null;
  }, [activePortfolioId, portfolios]);

  const heldSymbols = React.useMemo(
    () => new Set((activePortfolio?.assets || []).map((asset) => asset.symbol.toUpperCase())),
    [activePortfolio]
  );

  const mustOwn = React.useMemo(
    () => portfolioCandidates.filter((item) => !heldSymbols.has(item.symbol.toUpperCase())).slice(0, 8),
    [heldSymbols, portfolioCandidates]
  );
  const upcomingDividendsFromApi = React.useMemo(() => buildUpcomingDividends(upcomingDividendRows), [upcomingDividendRows]);
  const isOverviewRefreshing = isLoading || isRowsRefreshing || isOverviewPreparing;
  const isDividendSectionRefreshing = isDividendRefreshing || isDividendPreparing || isOverviewPreparing;
  const displayPeriodGroups = React.useMemo(() => {
    if (periodGroups.length > 0) {
      return periodGroups;
    }
    return [
      { key: "1g", label: "1 Gün", horizon_days: 1, rows: buyNowRows },
      { key: "5g", label: "5 Gün", horizon_days: 5, rows: buyWeekRows },
      { key: "30g", label: "30 Gün", horizon_days: 30, rows: holdRows },
      { key: "6a", label: "6 Ay", horizon_days: 180, rows: sellRows },
    ];
  }, [periodGroups, buyNowRows, buyWeekRows, holdRows, sellRows]);
  const periodTone = (key: string): "emerald" | "amber" | "blue" | "rose" => {
    if (key === "1g") return "emerald";
    if (key === "5g") return "amber";
    if (key === "30g") return "blue";
    return "rose";
  };

  return (
    <div className="page-shell no-scrollbar overflow-y-auto">
      <div className="flex flex-col gap-5">
        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border bg-card">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Analiz tavsiyeleri hazirlaniyor...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">{error}</div>
        ) : !hasPeriodRows && buyNowRows.length === 0 && buyWeekRows.length === 0 && holdRows.length === 0 && sellRows.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {isOverviewPreparing ? (
              <Loader2 className="mx-auto mb-3 size-8 animate-spin" />
            ) : (
              <ShieldAlert className="mx-auto mb-3 size-8" />
            )}
            {isOverviewPreparing
              ? "Analiz verileri hazirlaniyor. Ilk sonuclar geldikce bu ekran otomatik guncellenecek."
              : overviewMeta.rowsTotal > 0
                ? overviewMeta.usedSnapshotFallback
                  ? "BIST verisi geldi, ancak guncel skor snapshot'i su anda eksik gorunuyor. Sistem en son gecerli skora donmeye calisiyor."
                  : "BIST verisi geldi, ancak bu turda tavsiye olusturacak yeterli skor bulunamadi. Birazdan tekrar denenecek."
                : "Tavsiye uretmek icin once BIST taramasinin ilk sonuclarinin gelmesi gerekiyor."}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-3">
              {displayPeriodGroups.map((group) => (
                <AdviceSection
                  key={group.key}
                  title={group.label}
                  tone={periodTone(group.key)}
                  rows={group.rows}
                  compact
                  onRefresh={() => void loadOverview()}
                  isRefreshing={isOverviewRefreshing}
                />
              ))}
            </div>

            <div className={cn("grid gap-3", mustOwn.length > 0 ? "xl:grid-cols-2" : "xl:grid-cols-1")}>
              {mustOwn.length > 0 ? (
                <AdviceSection
                  title="Sepette Yoksa Al"
                  tone="emerald"
                  rows={mustOwn}
                  compact
                  onRefresh={() => void loadOverview()}
                  isRefreshing={isOverviewRefreshing}
                />
              ) : null}
              <DividendSection
                rows={upcomingDividendsFromApi}
                onRefresh={() => void loadDividends()}
                isRefreshing={isDividendSectionRefreshing}
              />
            </div>

            <OppositeSection
              rows={oppositePairs}
              isLoading={isOppositeLoading}
              selectedWindow={selectedOppositeWindow}
              onWindowChange={setSelectedOppositeWindow}
              meta={oppositeMeta}
              onRefresh={() => void loadOppositePairs()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
