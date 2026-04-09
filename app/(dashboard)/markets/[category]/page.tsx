"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CirclePlus,
  Coins,
  Globe,
  Landmark,
  Loader2,
  LineChart,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { clearEngineCache } from "@/lib/api-client";
import { MarketService } from "@/services/market.service";
import { usePortfolioStore } from "@/store/portfolio-store";
import type { PortfolioAssetType } from "@/services/portfolio.service";
import { FavoriteListPicker } from "@/components/favorites/favorite-list-picker";

type MarketCategory = "bist" | "us" | "crypto" | "commodities" | "funds";
type BistWindow = "1g" | "5g" | "30g" | "6a" | "1y" | "2y";
type BistMode = "firsatlar" | "trade" | "uzun-vade" | "radar";
type SummaryFilter = "all" | "strong" | "watch" | "weak";

type MarketSignal = {
  score?: number;
  action?: string;
  horizon?: string;
  reason?: string;
  regime?: string;
  confidence?: number;
  confidence_label?: string;
  components?: Record<string, number>;
};

type MarketRow = {
  symbol: string;
  name?: string;
  last?: number;
  change_percent?: number;
  data_status?: string;
  data_status_label?: string;
  has_live_data?: boolean;
  has_snapshot_data?: boolean;
  search_match_source?: string;
  volume?: number;
  hakiki_alfa?: {
    global_reference_return_pct?: number;
    hakiki_alfa_pct?: number;
  };
  signals?: Record<string, {
    score?: number;
    action?: string;
    horizon?: string;
    thesis?: string;
    risk?: string;
    emphasis?: number;
    emphasis_label?: string;
    entry_quality_score?: number;
    entry_quality_label?: string;
    entry_note?: string;
  }>;
  adil_deger?: {
    fair_value_price?: number | null;
    premium_discount_pct?: number | null;
    fair_value_label?: string;
    confidence?: number;
    fair_value_confidence_band?: string;
    fair_value_data_band?: string;
  };
  scan_priority_label?: string;
  scan_priority_rank?: number;
  market_signal?: MarketSignal;
  [key: string]: unknown;
};

interface MarketConfig {
  id: MarketCategory;
  name: string;
  icon: React.ElementType;
}

const MARKET_CONFIG: Record<string, MarketConfig> = {
  bist: { id: "bist", name: "Borsa Istanbul", icon: TrendingUp },
  us: { id: "us", name: "ABD Piyasalari", icon: Globe },
  crypto: { id: "crypto", name: "Kripto Paralar", icon: Coins },
  commodities: { id: "commodities", name: "Emtia", icon: Package },
  funds: { id: "funds", name: "Fonlar", icon: Landmark },
};

const BIST_WINDOWS: Array<{ id: BistWindow; name: string; hint: string }> = [
  { id: "1g", name: "1 Gun", hint: "Bugun ve yarin icin en hizli tepki ve momentum adaylarini one cikarir." },
  { id: "5g", name: "5 Gun", hint: "Bir haftalik zaman diliminde hareketi tasinabilir hisseleri ayiklar." },
  { id: "30g", name: "30 Gun", hint: "Bir aylik surecte hizini koruyabilecek orta ritimli adaylari secer." },
  { id: "6a", name: "6 Ay", hint: "Alti aylik birikim ve tasima perspektifi icin daha dengeli hisseleri bulur." },
  { id: "1y", name: "1 Yil", hint: "Bir yillik bakista kalite ve tasima gucu yuksek hisseleri one alir." },
  { id: "2y", name: "2 Yil", hint: "Iki yillik bakista en dayanikli ve skora en uyumlu hisseleri filtreler." },
];

const MARKET_CACHE_SCHEMA_VERSION = 8;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function getNumber(item: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return undefined;
}

function getText(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function normalizeSearchValue(value: string | undefined) {
  if (!value) return "";
  return value
    .replace(/ı/gi, "i")
    .replace(/ş/gi, "s")
    .replace(/ğ/gi, "g")
    .replace(/ü/gi, "u")
    .replace(/ö/gi, "o")
    .replace(/ç/gi, "c")
    .replace(/[.\s]/g, "")
    .toLowerCase();
}

function formatPrice(value: number | undefined, currency: "TRY" | "USD") {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const symbol = currency === "USD" ? "$" : "₺";
  return `${symbol}${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatCompact(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatDividendTag(value: number | undefined, daysLeft?: number) {
  if (value === undefined || value === null || Number.isNaN(value) || value <= 0) return "Temettu";
  const daysLabel =
    daysLeft === undefined || daysLeft === null || Number.isNaN(daysLeft)
      ? ""
      : daysLeft < 0
        ? " • gecti"
        : ` • ${Math.round(daysLeft)}g`;
  return `Temettu ${value.toFixed(2)}%${daysLabel}`;
}

function getDividendDaysLeft() {
  return undefined;
}

function simplifyActionLabel(value: string | undefined) {
  if (!value) return "Bekle";
  if (value.includes("Bugun")) return "Al";
  if (value.includes("Bu Hafta")) return "Izle";
  if (value.includes("Izlenmeli")) return "Izle";
  if (value.includes("Hizli Trade")) return "Al";
  if (value.includes("Takibe Al")) return "Izle";
  if (value.includes("Biriktir")) return "Tut";
  if (value.includes("Kurulum Var")) return "Hazir";
  if (value.includes("Sessiz Toparlaniyor")) return "Toparlaniyor";
  if (value.includes("Net Degil")) return "Belirsiz";
  if (value.includes("Zayif")) return "Zayif";
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function simplifyRiskLabel(value: string | undefined) {
  if (!value) return "Normal";
  if (value.includes("Kontrollu")) return "Dengeli";
  if (value.includes("Normal")) return "Normal";
  if (value.includes("Reel baski")) return "Baski";
  if (value.includes("Asiri isinma")) return "Isinmis";
  if (value.includes("Sığ") || value.includes("SÄ±Ä")) return "Zayif";
  if (value.includes("Erken")) return "Erken";
  if (value.includes("Dalgali")) return "Dalgali";
  return value;
}

function simplifyHorizonLabel(value: string | undefined) {
  if (!value) return "-";
  return value
    .replace("gun", "gün")
    .replace("Izleme", "Takip")
    .replace("Takip", "Takip")
    .replace("Bugun / Bu hafta", "Kisa vade");
}

function scoreTrend(item: MarketRow) {
  const day = getNumber(item, "change_percent") ?? 0;
  const p1w = getNumber(item, "p1w") ?? 0;
  const p1m = getNumber(item, "p1m") ?? 0;
  const p3m = getNumber(item, "p3m") ?? 0;
  const ytd = getNumber(item, "ytd") ?? 0;
  const vs50 = getNumber(item, "vs_sma50") ?? 0;
  const vs200 = getNumber(item, "vs_sma200") ?? 0;
  const taSummary = getText(item, "ta_summary");
  const supertrend = getText(item, "supertrend_direction");

  let score = 50;
  score += clamp(day * 2, -8, 8);
  score += clamp(p1w * 0.9, -10, 10);
  score += clamp(p1m * 0.5, -12, 12);
  score += clamp(p3m * 0.25, -10, 10);
  score += clamp(ytd * 0.2, -8, 8);
  score += clamp(vs50 * 0.4, -8, 8);
  score += clamp(vs200 * 0.35, -10, 10);

  if (taSummary.includes("STRONG_BUY")) score += 8;
  else if (taSummary.includes("BUY")) score += 4;
  else if (taSummary.includes("STRONG_SELL")) score -= 8;
  else if (taSummary.includes("SELL")) score -= 4;

  if (supertrend === "▲") score += 5;
  if (supertrend === "▼") score -= 5;

  return clamp(score);
}

function scoreLiquidity(item: MarketRow) {
  const volumeUsd = getNumber(item, "volume_usd") ?? 0;
  const marketCapUsd = getNumber(item, "market_cap_usd") ?? 0;
  const foreignRatio = getNumber(item, "foreign_ratio") ?? 0;

  let score = 20;
  score += clamp(volumeUsd * 2.8, 0, 35);
  score += clamp(marketCapUsd * 8, 0, 30);
  score += clamp(foreignRatio * 0.35, 0, 15);
  return clamp(score);
}

function scoreValue(item: MarketRow) {
  const pe = getNumber(item, "pe");
  const pb = getNumber(item, "pb");
  const upside52 = getNumber(item, "upside_52w") ?? 0;
  const dividendYield = getNumber(item, "dividend_yield");

  let score = 50;
  if (pe !== undefined) {
    if (pe > 0 && pe <= 12) score += 12;
    else if (pe <= 20) score += 6;
    else if (pe > 30) score -= 10;
  }
  if (pb !== undefined) {
    if (pb > 0 && pb <= 1.2) score += 12;
    else if (pb <= 2.5) score += 5;
    else if (pb > 5) score -= 10;
  }
  score += clamp(upside52 * 0.15, -8, 12);
  if (dividendYield !== undefined && dividendYield > 0) score += clamp(dividendYield * 0.8, 0, 8);
  return clamp(score);
}

function scoreQuality(item: MarketRow) {
  const p1y = getNumber(item, "p1y") ?? 0;
  const marketCapUsd = getNumber(item, "market_cap_usd") ?? 0;
  const foreignRatio = getNumber(item, "foreign_ratio") ?? 0;
  const vs200 = getNumber(item, "vs_sma200") ?? 0;
  const adx = getNumber(item, "adx") ?? 0;
  const rsi = getNumber(item, "rsi") ?? 50;

  let score = 40;
  score += clamp(p1y * 0.12, -10, 16);
  score += clamp(marketCapUsd * 8, 0, 15);
  score += clamp(foreignRatio * 0.25, 0, 12);
  score += clamp(vs200 * 0.3, -10, 10);
  score += clamp(adx * 0.35, 0, 10);
  if (rsi >= 45 && rsi <= 68) score += 8;
  else if (rsi > 75) score -= 6;
  return clamp(score);
}

function scoreEntryQuality(item: MarketRow, hakikiAlfaPct = 0) {
  const day = getNumber(item, "change_percent") ?? 0;
  const p1w = getNumber(item, "p1w") ?? 0;
  const rsi = getNumber(item, "rsi");
  const vs50 = getNumber(item, "vs_sma50") ?? 0;
  const adx = getNumber(item, "adx") ?? 0;

  let score = 76;

  if (day >= 5) score -= 30;
  else if (day >= 3) score -= 18;
  else if (day >= 1.8) score -= 8;
  else if (day >= -2.5 && day <= 1.5) score += 4;

  if (p1w >= 12) score -= 16;
  else if (p1w >= 8) score -= 10;
  else if (p1w >= -4 && p1w <= 6) score += 4;

  if (rsi !== undefined) {
    if (rsi >= 78) score -= 26;
    else if (rsi >= 72) score -= 16;
    else if (rsi >= 68) score -= 6;
    else if (rsi >= 44 && rsi <= 62) score += 8;
    else if (rsi >= 38 && rsi < 44) score += 4;
  }

  if (vs50 >= 11) score -= 14;
  else if (vs50 >= 7) score -= 8;
  else if (vs50 >= -1.5 && vs50 <= 4) score += 5;

  if (adx >= 24 && day >= -1.5 && day <= 2.5) score += 4;
  if (hakikiAlfaPct > 0 && day <= 2.5) score += 4;

  score = clamp(score);

  if (score >= 76) {
    return {
      score,
      label: "Uygun Giris",
      note: "Hareket var ama trade girisi halen makul seviyede.",
    };
  }
  if (score >= 58) {
    return {
      score,
      label: "Temkinli Giris",
      note: "Kurulum korunuyor, ancak zamanlama dikkat istiyor.",
    };
  }
  if (score >= 40) {
    return {
      score,
      label: "Pullback Bekle",
      note: "Momentum guclu olsa da daha temiz bir geri cekilme beklenmeli.",
    };
  }

  return {
    score,
    label: "Gec Kalinmis",
    note: "Hareketin onemli kismi fiyatlanmis olabilir; kovalamak riskli.",
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildBistSignal(item: MarketRow, mode: BistMode) {
  const localHakikiAlfa = getNumber(item, "hakiki_alfa_pct") ?? (item.hakiki_alfa?.hakiki_alfa_pct as number | undefined) ?? 0;
  const localEntryQuality = scoreEntryQuality(item, localHakikiAlfa);
  const backendSignal = item.signals?.[mode === "uzun-vade" ? "uzun_vade" : mode];
  if (backendSignal?.score !== undefined) {
    return {
      score: Math.round(backendSignal.score ?? 0),
      action: backendSignal.action ?? "Bekle",
      horizon: backendSignal.horizon ?? "Takip",
      thesis: backendSignal.thesis ?? "Motor notu hazirlaniyor.",
      emphasis: backendSignal.emphasis ?? 0,
      emphasisLabel: backendSignal.emphasis_label ?? "Gun",
      risk: backendSignal.risk ?? "Normal",
      entryQualityScore: backendSignal.entry_quality_score ?? (mode === "trade" ? localEntryQuality.score : undefined),
      entryQualityLabel: backendSignal.entry_quality_label ?? (mode === "trade" ? localEntryQuality.label : undefined),
      entryNote: backendSignal.entry_note ?? (mode === "trade" ? localEntryQuality.note : undefined),
    };
  }

  const trend = scoreTrend(item);
  const liquidity = scoreLiquidity(item);
  const value = scoreValue(item);
  const quality = scoreQuality(item);

  const day = getNumber(item, "change_percent") ?? 0;
  const p1w = getNumber(item, "p1w") ?? 0;
  const p1m = getNumber(item, "p1m") ?? 0;
  const p1y = getNumber(item, "p1y") ?? 0;
  const ytd = getNumber(item, "ytd") ?? 0;
  const rsi = getNumber(item, "rsi") ?? 50;
  const adx = getNumber(item, "adx") ?? 0;
  const supertrend = getText(item, "supertrend_direction");
  const taSummary = getText(item, "ta_summary");

  const firsatSkoru = clamp((trend * 0.34) + (liquidity * 0.2) + (value * 0.18) + (quality * 0.28));
  const tradeSkoru = clamp((trend * 0.42) + (liquidity * 0.26) + (adx * 0.18) + ((rsi >= 45 && rsi <= 70 ? 100 : 45) * 0.14));
  const uzunSkoru = clamp((quality * 0.42) + (value * 0.24) + (trend * 0.18) + (liquidity * 0.16));
  const radarSkoru = clamp((Math.abs(day) < 3 ? 62 : 45) + clamp(p1w * 0.5, -8, 8) + clamp((supertrend === "▲" ? 12 : supertrend === "▼" ? -8 : 0), -8, 12));

  if (mode === "trade") {
    const action =
      tradeSkoru >= 78 ? "Hizli Trade Adayi" :
      tradeSkoru >= 65 ? "Takibe Al" :
      "Zayif";

    const thesis =
      taSummary.includes("BUY") || supertrend === "▲"
        ? "Trend ve teknik akış destekliyor."
        : "Momentum teyidi zayıf, dikkatli izlenmeli.";

    return {
      score: Math.round(tradeSkoru),
      action,
      horizon: "1-10 gun",
      thesis,
      emphasis: p1w,
      emphasisLabel: "1H",
      risk: adx >= 25 ? "Aksiyon var" : "Dalgali",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  if (mode === "uzun-vade") {
    const action =
      uzunSkoru >= 76 ? "Biriktir / Tut" :
      uzunSkoru >= 63 ? "Izle / Kademeli" :
      "Bekle";

    const thesis =
      p1y > 0 && ytd > 0
        ? "Uzun trend ve kalite sinyali pozitif."
        : "Yapı tam oturmamış, güçlenme beklenmeli.";

    return {
      score: Math.round(uzunSkoru),
      action,
      horizon: "3-12 ay",
      thesis,
      emphasis: p1y,
      emphasisLabel: "1Y",
      risk: quality >= 70 ? "Daha dengeli" : "Temkinli",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  if (mode === "radar") {
    const action =
      radarSkoru >= 70 ? "Kurulum Var" :
      radarSkoru >= 58 ? "Sessiz Toparlaniyor" :
      "Net Degil";

    const thesis =
      rsi >= 40 && rsi <= 60
        ? "Sakin bölgede, teyitle patlayabilir."
        : "Henüz gürültü fazla, filtre gerekli.";

    return {
      score: Math.round(radarSkoru),
      action,
      horizon: "Izleme",
      thesis,
      emphasis: p1m,
      emphasisLabel: "1A",
      risk: supertrend === "▲" ? "Tetikte" : "Erken",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  const action =
    firsatSkoru >= 80 ? "Bugun Alinabilir" :
    firsatSkoru >= 68 ? "Bu Hafta Uygun" :
    firsatSkoru >= 56 ? "Izlenmeli" :
    "Bekle";

  const thesis =
    trend >= 65 && liquidity >= 45
      ? "Momentum, likidite ve kalite birlikte calisiyor."
      : value >= 65
        ? "Degerleme destek veriyor ama teyit lazim."
        : "Hamle var ama henuz yeterince temiz degil.";

  return {
    score: Math.round(firsatSkoru),
    action,
    horizon: firsatSkoru >= 68 ? "Bugun / Bu hafta" : "Takip",
    thesis,
    emphasis: day,
    emphasisLabel: "Gun",
    risk: rsi > 72 ? "Asiri isinma" : "Normal",
    entryQualityScore: undefined,
    entryQualityLabel: undefined,
    entryNote: undefined,
  };
}

function buildBistWindowSignal(item: MarketRow, window: BistWindow) {
  const localHakikiAlfa = getNumber(item, "hakiki_alfa_pct") ?? (item.hakiki_alfa?.hakiki_alfa_pct as number | undefined) ?? 0;
  const localEntryQuality = scoreEntryQuality(item, localHakikiAlfa);
  const fastSignal = item.signals?.firsatlar;
  const swingSignal = item.signals?.trade;
  const longSignal = item.signals?.uzun_vade;
  const backendSignal =
    window === "1g" ? fastSignal :
    window === "5g" ? swingSignal :
    window === "1y" ? longSignal :
    undefined;

  if (backendSignal?.score !== undefined && (window === "1g" || window === "5g" || window === "1y")) {
    const horizonLabel = window === "1g" ? "1 gun" : window === "5g" ? "5 gun" : "1 yil";
    return {
      score: Math.round(backendSignal.score ?? 0),
      action: backendSignal.action ?? "Bekle",
      horizon: horizonLabel,
      thesis: backendSignal.thesis ?? "Motor notu hazirlaniyor.",
      emphasis: backendSignal.emphasis ?? 0,
      emphasisLabel: backendSignal.emphasis_label ?? "Gun",
      risk: backendSignal.risk ?? "Normal",
      entryQualityScore: backendSignal.entry_quality_score ?? (window === "5g" ? localEntryQuality.score : undefined),
      entryQualityLabel: backendSignal.entry_quality_label ?? (window === "5g" ? localEntryQuality.label : undefined),
      entryNote: backendSignal.entry_note ?? (window === "5g" ? localEntryQuality.note : undefined),
    };
  }

  const trend = scoreTrend(item);
  const liquidity = scoreLiquidity(item);
  const value = scoreValue(item);
  const quality = scoreQuality(item);

  const day = getNumber(item, "change_percent") ?? 0;
  const p1w = getNumber(item, "p1w") ?? 0;
  const p1m = getNumber(item, "p1m") ?? 0;
  const p1y = getNumber(item, "p1y") ?? 0;
  const ytd = getNumber(item, "ytd") ?? 0;
  const rsi = getNumber(item, "rsi") ?? 50;
  const adx = getNumber(item, "adx") ?? 0;
  const supertrend = getText(item, "supertrend_direction");
  const taSummary = getText(item, "ta_summary");

  const firsatSkoru = getNumber(item, "firsat_skoru") ?? clamp((trend * 0.34) + (liquidity * 0.2) + (value * 0.18) + (quality * 0.28));
  const tradeSkoru = getNumber(item, "trade_skoru") ?? clamp((trend * 0.42) + (liquidity * 0.26) + (adx * 0.18) + ((rsi >= 45 && rsi <= 70 ? 100 : 45) * 0.14));
  const uzunSkoru = getNumber(item, "uzun_vade_skoru") ?? clamp((quality * 0.42) + (value * 0.24) + (trend * 0.18) + (liquidity * 0.16));
  const radarSkoru = getNumber(item, "radar_skoru") ?? clamp((Math.abs(day) < 3 ? 62 : 45) + clamp(p1w * 0.5, -8, 8));
  const resilience = getNumber(item, "finansal_dayaniklilik_skoru") ?? quality;
  const capital = getNumber(item, "sermaye_disiplini_skoru") ?? value;
  const fairValueScore = getNumber(item, "adil_deger_skoru") ?? value;
  const oneMonthScore = clamp((0.34 * firsatSkoru) + (0.24 * tradeSkoru) + (0.20 * radarSkoru) + (0.12 * trend) + (0.10 * liquidity));
  const sixMonthScore = clamp((0.34 * uzunSkoru) + (0.18 * quality) + (0.16 * trend) + (0.12 * value) + (0.10 * resilience) + (0.10 * capital));
  const twoYearScore = clamp((0.32 * uzunSkoru) + (0.16 * quality) + (0.14 * resilience) + (0.14 * capital) + (0.10 * fairValueScore) + (0.08 * liquidity) + (0.06 * Math.max(0, localHakikiAlfa + 50)));

  if (window === "5g") {
    const score = Math.round(tradeSkoru);
    return {
      score,
      action: score >= 78 ? "5 Gunluk Aday" : score >= 65 ? "5 Gunluk Takip" : "Bekle",
      horizon: "5 gun",
      thesis:
        taSummary.includes("BUY") || supertrend === "â–²"
          ? "Kisa vadeli ritim ve teknik akis destek veriyor."
          : "Kisa vadede hareket var ama teyit halen sinirli.",
      emphasis: p1w,
      emphasisLabel: "5G",
      risk: adx >= 25 ? "Aksiyonlu" : "Dalgali",
      entryQualityScore: localEntryQuality.score,
      entryQualityLabel: localEntryQuality.label,
      entryNote: localEntryQuality.note,
    };
  }

  if (window === "30g") {
    const score = Math.round(oneMonthScore);
    return {
      score,
      action: score >= 76 ? "1 Aylik Guclu" : score >= 62 ? "1 Aylik Izle" : "Bekle",
      horizon: "30 gun",
      thesis:
        oneMonthScore >= 70
          ? "Bir aylik pencere icin trend, ritim ve radar birlikte calisiyor."
          : "Bir aylik pencerede guc var ama sureklilik daha netlesmeli.",
      emphasis: p1m,
      emphasisLabel: "1A",
      risk: rsi > 72 ? "Isinmis" : "Normal",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  if (window === "6a") {
    const score = Math.round(sixMonthScore);
    return {
      score,
      action: score >= 76 ? "6 Aylik Birikim" : score >= 62 ? "6 Aylik Izle" : "Bekle",
      horizon: "6 ay",
      thesis:
        sixMonthScore >= 70
          ? "Alti aylik bakista kalite, dayaniklilik ve trend dengeli gorunuyor."
          : "Alti aylik bakista temel guc var ama yapinin biraz daha olgunlasmasi gerekiyor.",
      emphasis: p1m,
      emphasisLabel: "6A",
      risk: quality >= 70 ? "Dengeli" : "Temkinli",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  if (window === "1y") {
    const score = Math.round(uzunSkoru);
    return {
      score,
      action: score >= 76 ? "1 Yillik Birikim" : score >= 63 ? "1 Yillik Izle" : "Bekle",
      horizon: "1 yil",
      thesis:
        p1y > 0 && ytd > 0
          ? "Bir yillik trend ve kalite izi pozitif."
          : "Bir yillik tasima fikri var, ancak gucun kalici hale gelmesi beklenmeli.",
      emphasis: p1y,
      emphasisLabel: "1Y",
      risk: quality >= 70 ? "Dengeli" : "Temkinli",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  if (window === "2y") {
    const score = Math.round(twoYearScore);
    return {
      score,
      action: score >= 78 ? "2 Yillik Tasima" : score >= 64 ? "2 Yillik Aday" : "Bekle",
      horizon: "2 yil",
      thesis:
        twoYearScore >= 72
          ? "Iki yillik bakista kalite, sermaye disiplini ve dayaniklilik bir araya geliyor."
          : "Iki yillik tasima icin cekirdek yapi var ama tam ikna gucu daha sinirli.",
      emphasis: p1y,
      emphasisLabel: "2Y",
      risk: resilience >= 68 ? "Dayanikli" : "Secici",
      entryQualityScore: undefined,
      entryQualityLabel: undefined,
      entryNote: undefined,
    };
  }

  const score = Math.round(firsatSkoru);
  return {
    score,
    action: score >= 80 ? "1 Gunluk Aday" : score >= 68 ? "1 Gunluk Izle" : "Bekle",
    horizon: "1 gun",
    thesis:
      trend >= 65 && liquidity >= 45
        ? "Gunluk pencerede momentum, likidite ve kalite birlikte calisiyor."
        : value >= 65
          ? "Gunluk pencerede degerleme destek veriyor ama teyit gerekiyor."
          : "Gunluk pencerede hareket var ama sinyal henuz temiz degil.",
    emphasis: day,
    emphasisLabel: "1G",
    risk: rsi > 72 ? "Isinmis" : "Normal",
    entryQualityScore: undefined,
    entryQualityLabel: undefined,
    entryNote: undefined,
  };
}

function scoreTone(score: number) {
  if (score >= 78) return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 62) return "text-amber-600 bg-amber-500/10 border-amber-500/20";
  return "text-slate-600 bg-slate-500/10 border-slate-500/20";
}

function priorityTone(label: string | undefined) {
  if (label === "BIST 30") return "border-sky-500/25 bg-sky-500/10 text-sky-700";
  if (label === "BIST 50") return "border-indigo-500/25 bg-indigo-500/10 text-indigo-700";
  if (label === "BIST 100") return "border-violet-500/25 bg-violet-500/10 text-violet-700";
  return "border-border/50 bg-muted/40 text-muted-foreground";
}

function entryTone(label: string | undefined) {
  if (label === "Uygun Giris") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (label === "Temkinli Giris") return "border-amber-500/25 bg-amber-500/10 text-amber-700";
  if (label === "Pullback Bekle") return "border-orange-500/25 bg-orange-500/10 text-orange-700";
  if (label === "Gec Kalinmis") return "border-rose-500/25 bg-rose-500/10 text-rose-700";
  return "border-border/50 bg-muted/40 text-muted-foreground";
}

function fairValueTone(label: string | undefined) {
  if (label === "iskontolu") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (label === "sismis") return "border-rose-500/25 bg-rose-500/10 text-rose-700";
  if (label === "makul") return "border-sky-500/25 bg-sky-500/10 text-sky-700";
  return "border-border/50 bg-muted/40 text-muted-foreground";
}

function dataStatusTone(status: string | undefined) {
  if (status === "live") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  if (status === "snapshot") return "border-amber-500/25 bg-amber-500/10 text-amber-700";
  if (status === "registered_only") return "border-slate-500/25 bg-slate-500/10 text-slate-600";
  return "border-border/50 bg-muted/40 text-muted-foreground";
}

function mergeFairValueData(
  currentValue: MarketRow["adil_deger"] | undefined,
  incomingValue: MarketRow["adil_deger"] | undefined,
) {
  if (!currentValue) return incomingValue;
  if (!incomingValue) return currentValue;

  const currentHasFairValue = currentValue.fair_value_price != null;
  const incomingHasFairValue = incomingValue.fair_value_price != null;

  if (!currentHasFairValue && incomingHasFairValue) {
    return { ...currentValue, ...incomingValue };
  }

  return { ...incomingValue, ...currentValue };
}

function pickFreshValue<T>(currentValue: T | undefined, incomingValue: T | undefined) {
  if (incomingValue === undefined || incomingValue === null) return currentValue;
  return incomingValue;
}

function mergeBistRowsWithSnapshot(baseRows: MarketRow[], snapshotRows: MarketRow[]) {
  if (baseRows.length === 0 || snapshotRows.length === 0) return baseRows;
  const snapshotMap = new Map(snapshotRows.map((row) => [row.symbol, row]));
  return baseRows.map((row) => {
    const incomingRow = snapshotMap.get(row.symbol);
    if (!incomingRow) return row;

    const preferIncomingTopLevel =
      incomingRow.data_status === "live"
      || (row.data_status !== "live" && incomingRow.has_live_data);

    return {
      ...(preferIncomingTopLevel ? row : incomingRow),
      ...(preferIncomingTopLevel ? incomingRow : row),
      hakiki_alfa: row.hakiki_alfa ?? incomingRow.hakiki_alfa,
      signals: row.signals ?? incomingRow.signals,
      adil_deger: mergeFairValueData(row.adil_deger, incomingRow.adil_deger),
      dividend_yield: pickFreshValue(row.dividend_yield as number | undefined, incomingRow.dividend_yield as number | undefined),
      temettu_guven_skoru: pickFreshValue(row.temettu_guven_skoru as number | undefined, incomingRow.temettu_guven_skoru as number | undefined),
      temettu_tuzagi_riski: pickFreshValue(row.temettu_tuzagi_riski as number | undefined, incomingRow.temettu_tuzagi_riski as number | undefined),
      temettu_takvim_firsati: pickFreshValue(row.temettu_takvim_firsati as number | undefined, incomingRow.temettu_takvim_firsati as number | undefined),
      market_cap: pickFreshValue(row.market_cap as number | undefined, incomingRow.market_cap as number | undefined),
      pe_ratio: pickFreshValue(row.pe_ratio as number | undefined, incomingRow.pe_ratio as number | undefined),
      pb_ratio: pickFreshValue(row.pb_ratio as number | undefined, incomingRow.pb_ratio as number | undefined),
      pe: pickFreshValue(row.pe as number | undefined, incomingRow.pe as number | undefined),
      pb: pickFreshValue(row.pb as number | undefined, incomingRow.pb as number | undefined),
      sector: pickFreshValue(row.sector as string | undefined, incomingRow.sector as string | undefined),
      industry: pickFreshValue(row.industry as string | undefined, incomingRow.industry as string | undefined),
    };
  });
}

function sortNonBistRowsByScore(rows: MarketRow[]) {
  return [...rows].sort((left, right) => {
    const leftScore = getNumber(left.market_signal ?? {}, "score") ?? Number.NEGATIVE_INFINITY;
    const rightScore = getNumber(right.market_signal ?? {}, "score") ?? Number.NEGATIVE_INFINITY;
    if (rightScore !== leftScore) return rightScore - leftScore;

    const leftDay = getNumber(left, "change_percent") ?? Number.NEGATIVE_INFINITY;
    const rightDay = getNumber(right, "change_percent") ?? Number.NEGATIVE_INFINITY;
    if (rightDay !== leftDay) return rightDay - leftDay;

    return String(left.symbol || "").localeCompare(String(right.symbol || ""));
  });
}

function countFilledFields(row: MarketRow) {
  return Object.values(row).reduce<number>((count, value) => {
    if (value === null || value === undefined) return count;
    if (typeof value === "string") return value.trim() ? count + 1 : count;
    if (typeof value === "number") return Number.isFinite(value) ? count + 1 : count;
    if (Array.isArray(value)) return value.length > 0 ? count + 1 : count;
    if (typeof value === "object") return Object.keys(value).length > 0 ? count + 1 : count;
    return count + 1;
  }, 0);
}

function dedupeMarketRows(rows: MarketRow[]) {
  const deduped = new Map<string, MarketRow>();

  rows.forEach((row) => {
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    if (!symbol) return;

    const existing = deduped.get(symbol);
    if (!existing) {
      deduped.set(symbol, row);
      return;
    }

    const preferIncoming = countFilledFields(row) >= countFilledFields(existing);
    const primary = preferIncoming ? row : existing;
    const secondary = preferIncoming ? existing : row;
    const primaryHasLiveData = typeof primary.has_live_data === "boolean" ? primary.has_live_data : undefined;
    const secondaryHasLiveData = typeof secondary.has_live_data === "boolean" ? secondary.has_live_data : undefined;
    const primaryHasSnapshotData = typeof primary.has_snapshot_data === "boolean" ? primary.has_snapshot_data : undefined;
    const secondaryHasSnapshotData = typeof secondary.has_snapshot_data === "boolean" ? secondary.has_snapshot_data : undefined;

    deduped.set(symbol, {
      ...secondary,
      ...primary,
      symbol,
      name: getText(primary, "name") || getText(secondary, "name") || symbol,
      last: getNumber(primary, "last") ?? getNumber(secondary, "last"),
      change_percent: getNumber(primary, "change_percent") ?? getNumber(secondary, "change_percent"),
      volume: getNumber(primary, "volume") ?? getNumber(secondary, "volume"),
      data_status: getText(primary, "data_status") || getText(secondary, "data_status") || undefined,
      data_status_label: getText(primary, "data_status_label") || getText(secondary, "data_status_label") || undefined,
      has_live_data: primaryHasLiveData ?? secondaryHasLiveData,
      has_snapshot_data: primaryHasSnapshotData ?? secondaryHasSnapshotData,
    });
  });

  return Array.from(deduped.values());
}

function readMarketCache(category: MarketCategory): MarketRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`market-last-known:${category}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { schemaVersion?: number; rows?: MarketRow[] };
    if ((parsed?.schemaVersion || 0) !== MARKET_CACHE_SCHEMA_VERSION) {
      window.sessionStorage.removeItem(`market-last-known:${category}`);
      return [];
    }
    return Array.isArray(parsed?.rows) ? dedupeMarketRows(parsed.rows) : [];
  } catch {
    return [];
  }
}

function writeMarketCache(category: MarketCategory, rows: MarketRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`market-last-known:${category}`, JSON.stringify({
      schemaVersion: MARKET_CACHE_SCHEMA_VERSION,
      rows: dedupeMarketRows(rows),
    }));
  } catch {
    // Ignore storage errors.
  }
}

export default function MarketCategoryPage() {
  const params = useParams();
  const category = (params.category as MarketCategory) || "bist";

  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeWindow, setActiveWindow] = React.useState<BistWindow>("5g");
  const [activeSummaryFilter, setActiveSummaryFilter] = React.useState<SummaryFilter>("all");
  const [data, setData] = React.useState<MarketRow[]>(() => readMarketCache(category));
  const [totalStocks, setTotalStocks] = React.useState(0);
  const [loadedCount, setLoadedCount] = React.useState(0);
  const [universeTotal, setUniverseTotal] = React.useState(0);
  const [universeLabel, setUniverseLabel] = React.useState("Tum BIST");
  const [refreshInProgress, setRefreshInProgress] = React.useState(false);
  const [addingSymbol, setAddingSymbol] = React.useState<string | null>(null);
  const hydratedSymbolsRef = React.useRef<Set<string>>(new Set());

  const portfolios = usePortfolioStore((state) => state.portfolios);
  const activePortfolioId = usePortfolioStore((state) => state.activePortfolioId);
  const fetchPortfolios = usePortfolioStore((state) => state.fetchPortfolios);
  const addAsset = usePortfolioStore((state) => state.addAsset);
  const portfolioError = usePortfolioStore((state) => state.error);

  const config = MARKET_CONFIG[category] || MARKET_CONFIG.bist;
  const isBist = category === "bist";
  const hasUsRichSignals = category === "us";
  const hasCryptoRichSignals = category === "crypto";
  const hasRichSignals = hasUsRichSignals || hasCryptoRichSignals;
  const hasCategorySignals = hasRichSignals || category === "commodities" || category === "funds";
  const nonBistColSpan = hasRichSignals ? 11 : hasCategorySignals ? 8 : 6;
  const currency: "TRY" | "USD" = category === "us" || category === "crypto" ? "USD" : "TRY";
  const analysisCacheEndpoint = React.useMemo(() => {
    if (category === "us") return "/market/analysis/us-stocks";
    if (category === "crypto") return "/market/analysis/crypto";
    if (category === "commodities") return "/market/analysis/commodities";
    if (category === "funds") return "/market/analysis/funds";
    return null;
  }, [category]);

  React.useEffect(() => {
    if (portfolios.length === 0) {
      void fetchPortfolios();
    }
  }, [fetchPortfolios, portfolios.length]);

  const fetchBistData = React.useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    try {
      const snapshotResponse = await MarketService.getLatestBistProprietarySnapshot();
      const nextRows = (snapshotResponse?.stocks || []) as MarketRow[];
      if (nextRows.length === 0) {
        const stocksResponse = await MarketService.getAllBistStocks();
        const fallbackRows = (stocksResponse.results || []) as MarketRow[];
        if (fallbackRows.length === 0) {
          return;
        }
        setData((current) => {
          const mergedFallbackRows = mergeBistRowsWithSnapshot(fallbackRows, current);
          writeMarketCache("bist", mergedFallbackRows);
          return mergedFallbackRows;
        });
        setTotalStocks(stocksResponse.total || fallbackRows.length);
        setLoadedCount(stocksResponse.live_count ?? stocksResponse.total ?? fallbackRows.length);
        setUniverseTotal(stocksResponse.total_registered ?? stocksResponse.total ?? fallbackRows.length);
        setUniverseLabel("Tum BIST");
        setRefreshInProgress(Boolean(
          typeof stocksResponse.total_registered === "number"
          && typeof stocksResponse.live_count === "number"
          && stocksResponse.live_count < stocksResponse.total_registered
        ));
        return;
      }
      setData((current) => {
        const mergedRows = mergeBistRowsWithSnapshot(nextRows, current);
        writeMarketCache("bist", mergedRows);
        return mergedRows;
      });
      setTotalStocks(snapshotResponse?.summary?.stock_count ?? nextRows.length);
      setLoadedCount(nextRows.length);
      setUniverseTotal(snapshotResponse?.summary?.stock_count ?? nextRows.length);
      setUniverseLabel("Tum BIST");
      setRefreshInProgress(false);

      void MarketService.getBistRefreshStatus()
        .then((statusResponse) => {
          setLoadedCount(statusResponse.stocks_cached ?? nextRows.length);
          setUniverseTotal(statusResponse.total_symbols ?? nextRows.length);
          setUniverseLabel(statusResponse.universe_label || "Tum BIST");
          setRefreshInProgress(Boolean(statusResponse.refresh_in_progress));
        })
        .catch(() => {
          setLoadedCount(nextRows.length);
          setUniverseTotal(snapshotResponse?.summary?.stock_count ?? nextRows.length);
          setUniverseLabel("Tum BIST");
          setRefreshInProgress(false);
        });
    } catch (error) {
      console.error("BIST fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOtherData = React.useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    try {
      let results: MarketRow[] = [];
      if (category === "us") results = (await MarketService.getUSMarkets()).all as unknown as MarketRow[];
      if (category === "crypto") results = (await MarketService.getCryptoMarket()).all as unknown as MarketRow[];
      if (category === "commodities") results = (await MarketService.getCommoditiesMarket()).all as unknown as MarketRow[];
      if (category === "funds") results = (await MarketService.getFundsMarket()).all as unknown as MarketRow[];
      const dedupedResults = dedupeMarketRows(results || []);
      setData((current) => {
        if (dedupedResults.length === 0 && current.length > 0) {
          return current;
        }
        return dedupedResults;
      });
      if (dedupedResults.length > 0) {
        writeMarketCache(category, dedupedResults);
      }
    } catch (error) {
      console.error("Market fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  React.useEffect(() => {
    setSearchQuery("");
    setActiveWindow("5g");
    setActiveSummaryFilter("all");
    hydratedSymbolsRef.current.clear();

    const cachedRows = readMarketCache(category);
    if (cachedRows.length > 0) {
      setData(cachedRows);
      setIsLoading(false);
    } else {
      setData([]);
      setIsLoading(true);
    }

    if (isBist) {
      clearEngineCache("/market/bist");
    } else if (analysisCacheEndpoint) {
      clearEngineCache(analysisCacheEndpoint);
    }

    if (isBist) fetchBistData(true);
    else fetchOtherData();
  }, [analysisCacheEndpoint, category, isBist, fetchBistData, fetchOtherData]);

  React.useEffect(() => {
    if (!isBist) return;

    const shouldPoll = refreshInProgress || (universeTotal > 0 && loadedCount < universeTotal);
    if (!shouldPoll) return;

    const timer = window.setTimeout(() => {
      void fetchBistData(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [fetchBistData, isBist, loadedCount, refreshInProgress, universeTotal]);

  const visibleData = React.useMemo(() => {
    if (isBist) {
      if (!searchQuery) return data;
      const query = normalizeSearchValue(searchQuery);
      return data.filter((item) =>
        normalizeSearchValue(item.symbol).includes(query) ||
        normalizeSearchValue(item.name || "").includes(query)
      );
    }
    if (!searchQuery) return sortNonBistRowsByScore(data);
    const query = normalizeSearchValue(searchQuery);
    return sortNonBistRowsByScore(data.filter((item) =>
      normalizeSearchValue(item.symbol).includes(query) ||
      normalizeSearchValue(item.name || "").includes(query)
    ));
  }, [data, isBist, searchQuery]);

  const allBistRows = React.useMemo(() => {
    if (!isBist) return [];

    const query = normalizeSearchValue(searchQuery);
    const matchPriority = (item: MarketRow) => {
      if (!query) return 9;
      const symbol = normalizeSearchValue(item.symbol);
      const name = normalizeSearchValue(item.name || "");
      if (symbol === query) return 0;
      if (symbol.startsWith(query)) return 1;
      if (symbol.includes(query)) return 2;
      if (name.startsWith(query)) return 3;
      if (name.includes(query)) return 4;
      return 9;
    };

    return visibleData
      .map((item) => ({
        item,
        signal: buildBistWindowSignal(item, activeWindow),
      }))
      .sort((a, b) => {
        if (query) {
          const matchDiff = matchPriority(a.item) - matchPriority(b.item);
          if (matchDiff !== 0) return matchDiff;
          const priorityDiff = (a.item.scan_priority_rank ?? 99) - (b.item.scan_priority_rank ?? 99);
          if (priorityDiff !== 0) return priorityDiff;
          return a.item.symbol.localeCompare(b.item.symbol, "tr");
        }
        const scoreDiff = b.signal.score - a.signal.score;
        if (scoreDiff !== 0) return scoreDiff;
        return (a.item.scan_priority_rank ?? 99) - (b.item.scan_priority_rank ?? 99);
      });
  }, [activeWindow, isBist, searchQuery, visibleData]);

  const bistRows = React.useMemo(() => {
    if (!isBist) return [];

    if (activeSummaryFilter === "strong") {
      return allBistRows.filter((row) => row.signal.score >= 78);
    }
    if (activeSummaryFilter === "watch") {
      return allBistRows.filter((row) => row.signal.score >= 62 && row.signal.score < 78);
    }
    if (activeSummaryFilter === "weak") {
      return allBistRows.filter((row) => row.signal.score < 62);
    }
    return allBistRows;
  }, [activeSummaryFilter, allBistRows, isBist]);

  React.useEffect(() => {
    if (!isBist || bistRows.length === 0) return;

    const missingVisibleSymbols = bistRows
      .slice(0, 12)
      .map(({ item }) => item)
      .filter((item) => {
        const adil = item.adil_deger;
        const fairValueMissing =
          !adil
          || adil.fair_value_price == null
          || adil.fair_value_label === "yetersiz_veri";
        const dividendMissing = item.dividend_yield == null;
        return (
          item.data_status !== "live"
          && (fairValueMissing || dividendMissing)
          && !hydratedSymbolsRef.current.has(item.symbol)
        );
      })
      .map((item) => item.symbol)
      .slice(0, 1);

    if (missingVisibleSymbols.length === 0) return;

    missingVisibleSymbols.forEach((symbol) => hydratedSymbolsRef.current.add(symbol));

    void MarketService.hydrateBistSymbols(missingVisibleSymbols).then((response) => {
      const enrichedRows = (response.results || []) as MarketRow[];
      if (enrichedRows.length === 0) return;
      setData((current) => {
        const merged = mergeBistRowsWithSnapshot(current, enrichedRows);
        writeMarketCache("bist", merged);
        return merged;
      });
    });
  }, [bistRows, isBist]);

  const summary = React.useMemo(() => {
    if (!isBist) return null;
    const rows = allBistRows;
    const strong = rows.filter((row) => row.signal.score >= 78).length;
    const watch = rows.filter((row) => row.signal.score >= 62 && row.signal.score < 78).length;
    const weak = rows.filter((row) => row.signal.score < 62).length;
    const dividend = rows.filter((row) => (getNumber(row.item, "dividend_yield") ?? 0) > 0).length;
    return { strong, watch, weak, total: rows.length, dividend };
  }, [allBistRows, isBist]);

  const getAssetTypeForCategory = React.useCallback((value: MarketCategory): PortfolioAssetType => {
    if (value === "crypto") return "crypto";
    if (value === "funds") return "fund";
    if (value === "commodities") return "commodity";
    if (value === "us") return "stock";
    return "stock";
  }, []);

  const handleQuickAdd = React.useCallback(async (item: MarketRow, portfolioId: string) => {
    const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === portfolioId) || null;
    if (!selectedPortfolio) {
      toast.error("Hizli alim icin once bir sepet olusturman gerekiyor.");
      return;
    }

    const price = getNumber(item, "last");
    if (!price || price <= 0) {
      toast.error("Bu varlik icin gecerli fiyat bulunamadi.");
      return;
    }

    setAddingSymbol(item.symbol);
    const success = await addAsset(selectedPortfolio.id, {
      symbol: item.symbol,
      type: getAssetTypeForCategory(category),
      quantity: 1,
      purchasePrice: price,
      purchaseDate: new Date().toISOString(),
      currency,
      name: item.name || item.symbol,
      note: "Piyasalar tablosundan hizli alim",
    });
    setAddingSymbol(null);

    if (!success) {
      toast.error(portfolioError || `${item.symbol} sepete eklenemedi.`);
      return;
    }

    toast.success(`${item.symbol}, ${selectedPortfolio.name} sepetine eklendi.`);
  }, [addAsset, category, currency, getAssetTypeForCategory, portfolioError, portfolios]);

  return (
    <div className="page-shell no-scrollbar overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="page-header-row mb-1 gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">{config.name}</h1>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {isBist && (
              <Link
                href="/analysis"
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                title="Bugun al, sat, tut kararlarini sistem tavsiyesine ceviren ekran"
              >
                <Target className="size-4" />
                Analiz
              </Link>
            )}
            {isBist && (
              <Link
                href="/market/outcomes"
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                title="Skorlarin sonradan ne kadar is yaptigini gosteren outcome raporu"
              >
                <LineChart className="size-4" />
                Sonuc Raporu
              </Link>
            )}
            <div className="relative group w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Varlik ara..."
                className="h-9 w-full rounded-lg border-border/40 bg-muted/30 pl-9 text-sm transition-all focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              onClick={() => (isBist ? fetchBistData(true) : fetchOtherData())}
              disabled={isLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-muted/30 px-3 text-muted-foreground transition-all hover:bg-muted hover:text-primary active:scale-95 disabled:opacity-50 sm:w-auto sm:px-2"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {isBist && summary && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setActiveSummaryFilter("all")}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/30",
                activeSummaryFilter === "all" && "border-primary/40 bg-primary/5"
              )}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Gorunen Hisse</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{summary.total}</p>
              <p className="mt-2 text-xs text-muted-foreground">Tum gorunen {universeLabel} evreni</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryFilter("strong")}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-all hover:border-emerald-300/40 hover:bg-emerald-500/5",
                activeSummaryFilter === "strong" && "border-emerald-400/50 bg-emerald-500/10"
              )}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Yuksek Guclu</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-600">{summary.strong}</p>
              <p className="mt-2 text-xs text-muted-foreground">Skor 78 ve ustu</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryFilter("watch")}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-all hover:border-amber-300/40 hover:bg-amber-500/5",
                activeSummaryFilter === "watch" && "border-amber-400/50 bg-amber-500/10"
              )}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Izleme Listesi</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-600">{summary.watch}</p>
              <p className="mt-2 text-xs text-muted-foreground">Skor 62-77 bandi</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryFilter("weak")}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-all hover:border-slate-300/40 hover:bg-slate-500/5",
                activeSummaryFilter === "weak" && "border-slate-400/50 bg-slate-500/10"
              )}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Zayiflar</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-500">{summary.weak}</p>
              <p className="mt-2 text-xs text-muted-foreground">Skor 62 alti • Temettu: {summary.dividend}</p>
            </button>
          </div>
        )}

        {isBist && summary && activeSummaryFilter !== "all" && (
          <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setActiveSummaryFilter("all")}
              className="rounded-full border px-2.5 py-1 transition-colors hover:bg-muted"
            >
              Filtreyi temizle
            </button>
          </div>
        )}

        {isBist && (
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            {BIST_WINDOWS.map((window) => (
              <button
                key={window.id}
                onClick={() => setActiveWindow(window.id)}
                className={cn(
                  "rounded-lg border px-4 py-1.5 text-xs font-medium transition-all",
                  activeWindow === window.id
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
                title={window.hint}
              >
                {window.name}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
          <div className="space-y-3 p-3 lg:hidden">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-xl border bg-background p-4">
                  <div className="h-4 w-24 rounded-full bg-muted/30" />
                  <div className="mt-3 h-4 w-40 rounded-full bg-muted/30" />
                  <div className="mt-4 h-20 rounded-xl bg-muted/20" />
                </div>
              ))
            ) : (isBist ? bistRows.length === 0 : visibleData.length === 0) ? (
              <div className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
                  <ShieldAlert className="size-10 stroke-[1]" />
                  <p className="text-sm font-medium">Veri bulunamadı veya filtreye uygun hisse yok.</p>
                </div>
              </div>
            ) : isBist ? (
              bistRows.map(({ item, signal }, index) => {
                const price = getNumber(item, "last");
                const day = getNumber(item, "change_percent");
                const globalAlphaReference = getNumber(item.hakiki_alfa ?? {}, "global_reference_return_pct") ?? getNumber(item, "global_reference_return_pct");
                const hakikiAlfa = getNumber(item, "hakiki_alfa_pct") ?? (item.hakiki_alfa?.hakiki_alfa_pct as number | undefined);
                const fairValuePremium = getNumber(item.adil_deger ?? {}, "premium_discount_pct");
                return (
                  <div key={item.symbol} className="rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/market/${item.symbol}`} className="font-semibold tracking-tight text-foreground transition-colors hover:text-primary">
                            {item.symbol}
                          </Link>
                          <FavoriteListPicker symbol={item.symbol} name={item.name} market="bist" size="icon-sm" className="-ml-1 size-7" />
                          <span className="text-[10px] text-muted-foreground">#{(index + 1).toString().padStart(2, "0")}</span>
                        </div>
                        {item.name && item.name !== item.symbol && (
                          <div className="mt-1 truncate text-xs uppercase tracking-tight text-muted-foreground">{item.name}</div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={addingSymbol === item.symbol || portfolios.length === 0}
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-lg border transition-all",
                              portfolios.length > 0
                                ? "bg-background text-emerald-600 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                : "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
                            )}
                          >
                            {addingSymbol === item.symbol ? <Loader2 className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}
                          </button>
                        </DropdownMenuTrigger>
                        {portfolios.length > 0 && (
                          <DropdownMenuContent align="end" className="w-56">
                            {portfolios.map((portfolio) => (
                              <DropdownMenuItem key={portfolio.id} onClick={() => void handleQuickAdd(item, portfolio.id)} className="flex items-center justify-between gap-3">
                                <span>{portfolio.name}</span>
                                {portfolio.id === activePortfolioId && <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Aktif</span>}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        )}
                      </DropdownMenu>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fiyat</div>
                        <div className="mt-1 font-mono font-semibold">{formatPrice(price, currency)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Gün %</div>
                        <div className={cn("mt-1 font-mono font-semibold", (day ?? 0) > 0 ? "text-emerald-500" : (day ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground")}>
                          {formatPercent(day)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Skor</div>
                        <div className="mt-1">
                          <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(signal.score))}>{signal.score}</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Aksiyon</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{simplifyActionLabel(signal.action)}</div>
                        <div className="text-xs text-muted-foreground">{simplifyHorizonLabel(signal.horizon)}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-lg bg-muted/30 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">GA</div>
                        <div className={cn("mt-1 font-mono font-semibold", (globalAlphaReference ?? 0) > 0 ? "text-emerald-600" : (globalAlphaReference ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground")}>{formatPercent(globalAlphaReference)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">HA</div>
                        <div className={cn("mt-1 font-mono font-semibold", (hakikiAlfa ?? 0) > 0 ? "text-emerald-600" : (hakikiAlfa ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground")}>{formatPercent(hakikiAlfa)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Fiyat Farkı</div>
                        <div className={cn("mt-1 font-mono font-semibold", (fairValuePremium ?? 0) > 0 ? "text-emerald-600" : (fairValuePremium ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground")}>{formatPercent(fairValuePremium)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              visibleData.map((item, index) => {
                const price = getNumber(item, "last");
                const day = getNumber(item, "change_percent");
                const marketSignal = (item.market_signal && typeof item.market_signal === "object" ? item.market_signal : null) as MarketSignal | null;
                const marketScore = marketSignal?.score;
                const marketAction = marketSignal?.action;
                const marketHorizon = marketSignal?.horizon;
                const marketReason = marketSignal?.reason;
                return (
                  <div key={item.symbol} className="rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/market/${item.symbol}`} className="font-semibold tracking-tight text-foreground transition-colors hover:text-primary">
                            {item.symbol}
                          </Link>
                          <FavoriteListPicker symbol={item.symbol} name={item.name} market={category} size="icon-sm" className="-ml-1 size-7" />
                          <span className="text-[10px] text-muted-foreground">#{(index + 1).toString().padStart(2, "0")}</span>
                        </div>
                        {item.name && item.name !== item.symbol && (
                          <div className="mt-1 truncate text-xs uppercase tracking-tight text-muted-foreground">{item.name}</div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={addingSymbol === item.symbol || portfolios.length === 0}
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-lg border transition-all",
                              portfolios.length > 0
                                ? "bg-background text-emerald-600 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                : "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
                            )}
                          >
                            {addingSymbol === item.symbol ? <Loader2 className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}
                          </button>
                        </DropdownMenuTrigger>
                        {portfolios.length > 0 && (
                          <DropdownMenuContent align="end" className="w-56">
                            {portfolios.map((portfolio) => (
                              <DropdownMenuItem key={portfolio.id} onClick={() => void handleQuickAdd(item, portfolio.id)} className="flex items-center justify-between gap-3">
                                <span>{portfolio.name}</span>
                                {portfolio.id === activePortfolioId && <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Aktif</span>}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        )}
                      </DropdownMenu>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fiyat</div>
                        <div className="mt-1 font-mono font-semibold">{formatPrice(price, currency)}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Gün %</div>
                        <div className={cn("mt-1 font-mono font-semibold", (day ?? 0) > 0 ? "text-emerald-500" : (day ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground")}>
                          {formatPercent(day)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Skor</div>
                        <div className="mt-1">
                          <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(marketScore ?? 0))}>{marketScore ?? "-"}</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Aksiyon</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{marketAction ? simplifyActionLabel(marketAction) : "-"}</div>
                        <div className="text-xs text-muted-foreground">{marketHorizon ? simplifyHorizonLabel(marketHorizon) : "-"}</div>
                      </div>
                    </div>

                    {marketReason && (
                      <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                        {marketReason}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-sm border-collapse">
            <thead>
              <tr className="bg-muted/20 border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                <th className="px-3 py-3.5 w-16 text-center">Al</th>
                <th className="px-4 py-3.5 w-12 text-center">#</th>
                <th className="px-4 py-3.5 text-left min-w-[220px]">Sembol & Sirket</th>
                <th className="px-4 py-3.5 text-right">Fiyat</th>
                <th className="px-4 py-3.5 text-right">Gun %</th>
                {isBist ? (
                  <>
                    <th className="px-4 py-3.5 text-center">Skor</th>
                    <th className="px-4 py-3.5 text-right">GA</th>
                    <th className="px-4 py-3.5 text-right">HA</th>
                    <th className="px-4 py-3.5 text-right">Adil</th>
                    <th className="px-4 py-3.5 text-center">Fiyat Farki</th>
                    <th className="px-4 py-3.5 text-left">Aksiyon</th>
                    <th className="px-4 py-3.5 text-left">Zaman Notu</th>
                  </>
                ) : hasUsRichSignals ? (
                  <>
                    <th className="px-4 py-3.5 text-center">Skor</th>
                    <th className="px-4 py-3.5 text-right">GA</th>
                    <th className="px-4 py-3.5 text-right">HA</th>
                    <th className="px-4 py-3.5 text-right">Adil</th>
                    <th className="px-4 py-3.5 text-center">Fiyat Farki</th>
                    <th className="px-4 py-3.5 text-left">Aksiyon</th>
                  </>
                ) : hasCryptoRichSignals ? (
                  <>
                    <th className="px-4 py-3.5 text-center">Skor</th>
                    <th className="px-4 py-3.5 text-right">BTC</th>
                    <th className="px-4 py-3.5 text-right">HA</th>
                    <th className="px-4 py-3.5 text-right">Ref</th>
                    <th className="px-4 py-3.5 text-center">Bant Farki</th>
                    <th className="px-4 py-3.5 text-left">Aksiyon</th>
                  </>
                ) : hasCategorySignals ? (
                  <>
                    <th className="px-4 py-3.5 text-center">Skor</th>
                    <th className="px-4 py-3.5 text-left">Aksiyon</th>
                    <th className="px-4 py-3.5 text-right">{category === "funds" ? "Tur" : "Hacim"}</th>
                  </>
                ) : (
                  <th className="px-4 py-3.5 text-right">Hacim</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/20">
              {isLoading ? (
                Array.from({ length: 14 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td colSpan={isBist ? 12 : nonBistColSpan} className="px-4 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-4 w-8 rounded-full bg-muted/30" />
                        <div className="h-4 w-36 rounded-full bg-muted/30" />
                        <div className="ml-auto h-4 w-80 rounded-full bg-muted/30" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (isBist ? bistRows.length === 0 : visibleData.length === 0) ? (
                <tr>
                  <td colSpan={isBist ? 12 : nonBistColSpan} className="px-4 py-24 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
                      <ShieldAlert className="size-10 stroke-[1]" />
                      <p className="text-sm font-medium">Veri bulunamadi veya filtreye uygun hisse yok.</p>
                    </div>
                  </td>
                </tr>
              ) : isBist ? (
                bistRows.map(({ item, signal }, index) => {
                  const price = getNumber(item, "last");
                  const day = getNumber(item, "change_percent");
                  const dividendYield = getNumber(item, "dividend_yield");
                  const dividendDaysLeft = getDividendDaysLeft(item);
                  const isDividend = (dividendYield ?? 0) > 0;
                  const globalAlphaReference = getNumber(item.hakiki_alfa ?? {}, "global_reference_return_pct") ?? getNumber(item, "global_reference_return_pct");
                  const hakikiAlfa = getNumber(item, "hakiki_alfa_pct") ?? (item.hakiki_alfa?.hakiki_alfa_pct as number | undefined);
                  const fairValuePrice = getNumber(item.adil_deger ?? {}, "fair_value_price");
                  const fairValuePremium = getNumber(item.adil_deger ?? {}, "premium_discount_pct");
                  const fairValueLabel = typeof item.adil_deger?.fair_value_label === "string" ? item.adil_deger.fair_value_label : undefined;
                  return (
                    <tr
                      key={item.symbol}
                      className={cn(
                        "transition-colors group/row",
                        isDividend
                          ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]"
                          : "hover:bg-muted/30"
                      )}
                    >
                      <td className="px-3 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={addingSymbol === item.symbol || portfolios.length === 0}
                              title={portfolios.length > 0 ? `${item.symbol} icin sepet sec` : "Once bir sepet olustur"}
                              className={cn(
                                "inline-flex size-8 items-center justify-center rounded-lg border transition-all",
                                portfolios.length > 0
                                  ? "bg-background text-emerald-600 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                  : "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
                              )}
                            >
                              {addingSymbol === item.symbol ? <Loader2 className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}
                            </button>
                          </DropdownMenuTrigger>
                          {portfolios.length > 0 && (
                            <DropdownMenuContent align="center" className="w-56">
                              {portfolios.map((portfolio) => (
                                <DropdownMenuItem
                                  key={portfolio.id}
                                  onClick={() => void handleQuickAdd(item, portfolio.id)}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span>{portfolio.name}</span>
                                  {portfolio.id === activePortfolioId && (
                                    <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Aktif</span>
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground/40 text-[10px] text-center font-mono">
                        {(index + 1).toString().padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/market/${item.symbol}`} className="flex flex-col gap-1 group/link">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[14px] text-foreground group-hover/link:text-primary transition-colors leading-none tracking-tight">
                              {item.symbol}
                            </span>
                            <FavoriteListPicker
                              symbol={item.symbol}
                              name={item.name}
                              market="bist"
                              size="icon-sm"
                              className="-ml-1 size-7"
                            />
                            {item.scan_priority_label && item.scan_priority_label !== "Diger" && (
                              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", priorityTone(item.scan_priority_label))}>
                                {item.scan_priority_label}
                              </span>
                            )}
                            {item.data_status_label && (
                              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", dataStatusTone(item.data_status))}>
                                {item.data_status_label}
                              </span>
                            )}
                            {isDividend && (
                              <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                {formatDividendTag(dividendYield, dividendDaysLeft)}
                              </span>
                            )}
                          </div>
                          {item.name && item.name !== item.symbol && (
                            <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[210px] uppercase tracking-tight opacity-70">
                              {item.name}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {formatPrice(price, currency)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-mono font-black tabular-nums",
                        (day ?? 0) > 0 && "text-emerald-500",
                        (day ?? 0) < 0 && "text-rose-500",
                        day === undefined && "text-muted-foreground"
                      )}>
                        {formatPercent(day)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(signal.score))}>
                          {signal.score}
                        </span>
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-mono font-bold tabular-nums",
                        (globalAlphaReference ?? 0) > 0 ? "text-emerald-500" : (globalAlphaReference ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                      )}>
                        {formatPercent(globalAlphaReference)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-mono font-bold tabular-nums",
                        (hakikiAlfa ?? 0) > 0 ? "text-emerald-500" : (hakikiAlfa ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                      )}>
                        {formatPercent(hakikiAlfa)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {fairValuePrice !== undefined ? formatPrice(fairValuePrice, currency) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={cn("inline-flex min-w-20 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", fairValueTone(fairValueLabel))}>
                            {fairValueLabel === "sismis" ? "Pahali" : fairValueLabel === "iskontolu" ? "Ucuz" : fairValueLabel === "makul" ? "Normal" : "Veri Yok"}
                          </span>
                          <span className={cn(
                            "text-xs font-mono tabular-nums",
                            (fairValuePremium ?? 0) > 0 ? "text-emerald-600" : (fairValuePremium ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground"
                          )}>
                            {fairValuePremium !== undefined ? formatPercent(fairValuePremium) : "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">{simplifyActionLabel(signal.action)}</span>
                          <span className="text-xs text-muted-foreground">{simplifyHorizonLabel(signal.horizon)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {signal.entryQualityLabel ? (
                            <span className={cn("inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", entryTone(signal.entryQualityLabel))}>
                              {signal.entryQualityLabel}
                            </span>
                          ) : (
                            <span className="inline-flex w-fit rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {signal.emphasisLabel ?? "Donem"}
                            </span>
                          )}
                          <span className="max-w-[180px] text-xs leading-5 text-muted-foreground">
                            {signal.entryNote ?? signal.thesis}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                visibleData.map((item, index) => {
                  const price = getNumber(item, "last");
                  const day = getNumber(item, "change_percent");
                  const volume = getNumber(item, "volume");
                  const marketSignal = (item.market_signal && typeof item.market_signal === "object"
                    ? item.market_signal
                    : null) as MarketSignal | null;
                  const marketScore = marketSignal?.score;
                  const marketAction = marketSignal?.action;
                  const marketHorizon = marketSignal?.horizon;
                  const marketReason = marketSignal?.reason;
                  const marketRegime = marketSignal?.regime;
                  const marketConfidence = marketSignal?.confidence_label;
                  const globalAlphaReference = getNumber(item.hakiki_alfa ?? {}, "global_reference_return_pct") ?? getNumber(item, "global_reference_return_pct");
                  const hakikiAlfa = getNumber(item, "hakiki_alfa_pct") ?? (item.hakiki_alfa?.hakiki_alfa_pct as number | undefined);
                  const fairValuePrice = getNumber(item.adil_deger ?? {}, "fair_value_price");
                  const fairValuePremium = getNumber(item.adil_deger ?? {}, "premium_discount_pct");
                  const fairValueLabel = typeof item.adil_deger?.fair_value_label === "string" ? item.adil_deger.fair_value_label : undefined;
                  const fairValueBand = typeof item.adil_deger?.fair_value_confidence_band === "string"
                    ? item.adil_deger.fair_value_confidence_band
                    : undefined;
                  return (
                    <tr key={item.symbol} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={addingSymbol === item.symbol || portfolios.length === 0}
                              title={portfolios.length > 0 ? `${item.symbol} icin sepet sec` : "Once bir sepet olustur"}
                              className={cn(
                                "inline-flex size-8 items-center justify-center rounded-lg border transition-all",
                                portfolios.length > 0
                                  ? "bg-background text-emerald-600 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                  : "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
                              )}
                            >
                              {addingSymbol === item.symbol ? <Loader2 className="size-4 animate-spin" /> : <CirclePlus className="size-4" />}
                            </button>
                          </DropdownMenuTrigger>
                          {portfolios.length > 0 && (
                            <DropdownMenuContent align="center" className="w-56">
                              {portfolios.map((portfolio) => (
                                <DropdownMenuItem
                                  key={portfolio.id}
                                  onClick={() => void handleQuickAdd(item, portfolio.id)}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span>{portfolio.name}</span>
                                  {portfolio.id === activePortfolioId && (
                                    <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Aktif</span>
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground/40 text-[10px] text-center font-mono">
                        {(index + 1).toString().padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/market/${item.symbol}`} className="flex flex-col gap-1 group/link">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[14px] text-foreground group-hover/link:text-primary transition-colors leading-none tracking-tight">
                              {item.symbol}
                            </span>
                            <FavoriteListPicker
                              symbol={item.symbol}
                              name={item.name}
                              market={category}
                              size="icon-sm"
                              className="-ml-1 size-7"
                            />
                            {item.data_status_label && (
                              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", dataStatusTone(item.data_status))}>
                                {item.data_status_label}
                              </span>
                            )}
                            {hasCategorySignals && marketRegime && (
                              <span className="inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                {marketRegime}
                              </span>
                            )}
                          </div>
                          {item.name && item.name !== item.symbol && (
                            <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[210px] uppercase tracking-tight opacity-70">
                              {item.name}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {formatPrice(price, currency)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-mono font-black tabular-nums",
                        (day ?? 0) > 0 && "text-emerald-500",
                        (day ?? 0) < 0 && "text-rose-500",
                        day === undefined && "text-muted-foreground"
                      )}>
                        {formatPercent(day)}
                      </td>
                      {hasUsRichSignals ? (
                        <>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(marketScore ?? 0))}>
                              {marketScore ?? "-"}
                            </span>
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            (globalAlphaReference ?? 0) > 0 ? "text-emerald-500" : (globalAlphaReference ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                          )}>
                            {formatPercent(globalAlphaReference)}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            (hakikiAlfa ?? 0) > 0 ? "text-emerald-500" : (hakikiAlfa ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                          )}>
                            {formatPercent(hakikiAlfa)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                            {fairValuePrice !== undefined ? formatPrice(fairValuePrice, currency) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn("inline-flex min-w-20 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", fairValueTone(fairValueLabel))}>
                                {fairValueLabel === "sismis" ? "Pahali" : fairValueLabel === "iskontolu" ? "Ucuz" : fairValueLabel === "makul" ? "Normal" : "Veri Sinirli"}
                              </span>
                              <span className={cn(
                                "text-xs font-mono tabular-nums",
                                (fairValuePremium ?? 0) > 0 ? "text-emerald-600" : (fairValuePremium ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground"
                              )}>
                                {fairValuePremium !== undefined ? formatPercent(fairValuePremium) : "-"}
                              </span>
                              {fairValueBand && (
                                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                  {fairValueBand}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[240px] flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-foreground">{marketAction ? simplifyActionLabel(marketAction) : "-"}</span>
                                {marketConfidence && (
                                  <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {marketConfidence}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{marketHorizon ? simplifyHorizonLabel(marketHorizon) : "-"}</span>
                              {marketReason && (
                                <span className="text-xs leading-5 text-muted-foreground">
                                  {marketReason}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : hasCryptoRichSignals ? (
                        <>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(marketScore ?? 0))}>
                              {marketScore ?? "-"}
                            </span>
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            (globalAlphaReference ?? 0) > 0 ? "text-emerald-500" : (globalAlphaReference ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                          )}>
                            {formatPercent(globalAlphaReference)}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            (hakikiAlfa ?? 0) > 0 ? "text-emerald-500" : (hakikiAlfa ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"
                          )}>
                            {formatPercent(hakikiAlfa)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                            {fairValuePrice !== undefined ? formatPrice(fairValuePrice, currency) : "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn("inline-flex min-w-20 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", fairValueTone(fairValueLabel))}>
                                {fairValueLabel === "sismis" ? "Uzamis" : fairValueLabel === "iskontolu" ? "Bant Alti" : fairValueLabel === "makul" ? "Makul" : "Veri Sinirli"}
                              </span>
                              <span className={cn(
                                "text-xs font-mono tabular-nums",
                                (fairValuePremium ?? 0) > 0 ? "text-emerald-600" : (fairValuePremium ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground"
                              )}>
                                {fairValuePremium !== undefined ? formatPercent(fairValuePremium) : "-"}
                              </span>
                              {fairValueBand && (
                                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                  {fairValueBand}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[240px] flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-foreground">{marketAction ? simplifyActionLabel(marketAction) : "-"}</span>
                                {marketConfidence && (
                                  <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {marketConfidence}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{marketHorizon ? simplifyHorizonLabel(marketHorizon) : "-"}</span>
                              {marketReason && (
                                <span className="text-xs leading-5 text-muted-foreground">
                                  {marketReason}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : hasCategorySignals ? (
                        <>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold", scoreTone(marketScore ?? 0))}>
                              {marketScore ?? "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex max-w-[240px] flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-foreground">{marketAction ?? "-"}</span>
                                {marketConfidence && (
                                  <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {marketConfidence}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{marketHorizon ?? "-"}</span>
                              {marketReason && (
                                <span className="text-xs leading-5 text-muted-foreground">
                                  {marketReason}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right text-xs",
                            category === "funds" ? "text-muted-foreground" : "font-mono text-muted-foreground"
                          )}>
                            {category === "funds" ? getText(item, "fund_type") || "-" : formatCompact(volume)}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {formatCompact(volume)}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          {isBist && data.length > 0 && (
            <div className="flex items-center justify-center py-6 border-t border-border/20">
              <span className="text-xs text-muted-foreground/60">
                {searchQuery
                  ? `${totalStocks} arama sonucu yuklendi • ${universeLabel} cache hazir: ${loadedCount}/${universeTotal}`
                  : refreshInProgress && loadedCount < universeTotal
                    ? `${loadedCount}/${universeTotal} ${universeLabel} hissesi cache'e alindi • yenileme suruyor`
                    : `${loadedCount}/${universeTotal} ${universeLabel} hissesi yuklendi`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
