export interface GlobalMarketAllocationItem {
  key: string;
  label: string;
  symbol: string;
  estimatedValueTrillionUsd: number;
  color: string;
  tone: string;
  thesis: string;
}

// Strategic baseline values for the dashboard visualization.
// These are intentionally editable and can later be replaced by live feeds.
export const GLOBAL_MARKET_ALLOCATION_AS_OF = "2026-03-31";

export const globalMarketAllocationSeed: GlobalMarketAllocationItem[] = [
  {
    key: "usd",
    label: "Dolar Likiditesi",
    symbol: "USD",
    estimatedValueTrillionUsd: 120,
    color: "#22c55e",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    thesis: "Kuresel rezerv para ve likidite omurgasi."
  },
  {
    key: "sp500",
    label: "S&P 500",
    symbol: "^GSPC",
    estimatedValueTrillionUsd: 52,
    color: "#3b82f6",
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    thesis: "Risk istahi ve ABD sirket sermayesinin cekirdegi."
  },
  {
    key: "gold",
    label: "Altin",
    symbol: "XAU",
    estimatedValueTrillionUsd: 23,
    color: "#f59e0b",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    thesis: "Gecmis boyunca deger saklama ve guvenli liman."
  },
  {
    key: "euro",
    label: "Euro",
    symbol: "EUR",
    estimatedValueTrillionUsd: 18,
    color: "#8b5cf6",
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    thesis: "Avrupa ticaret ve rezerv dengesi icin ana para alani."
  },
  {
    key: "bitcoin",
    label: "Bitcoin",
    symbol: "BTC",
    estimatedValueTrillionUsd: 1.7,
    color: "#f97316",
    tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    thesis: "Dijital kitlik tezinin en saf temsilcisi."
  },
  {
    key: "silver",
    label: "Gumus",
    symbol: "XAG",
    estimatedValueTrillionUsd: 1.6,
    color: "#94a3b8",
    tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    thesis: "Hem sanayi hem deger saklama tarafina temas eden hibrit metal."
  }
];
