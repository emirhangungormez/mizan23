"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bitcoin,
  Coins,
  Command,
  DollarSign,
  Loader2,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboard-store";

interface SearchResult {
  symbol: string;
  name: string;
  type: "stock" | "index" | "crypto" | "fx" | "commodity" | "fund";
  last?: number;
  change_percent?: number;
  market?: string;
  sector?: string;
}

interface AssetSearchApiResult {
  symbol: string;
  name: string;
  type?: "stock" | "forex" | "crypto" | "commodity" | "fund";
  market?: string;
  sector?: string;
  price?: number;
  change?: number;
}

interface AssetSearchApiResponse {
  success?: boolean;
  results?: AssetSearchApiResult[];
}

const TYPE_ICONS = {
  stock: BarChart3,
  index: TrendingUp,
  crypto: Bitcoin,
  fx: DollarSign,
  commodity: Coins,
  fund: Wallet,
};

const TYPE_LABELS = {
  stock: "Hisse",
  index: "Endeks",
  crypto: "Kripto",
  fx: "Döviz",
  commodity: "Emtia",
  fund: "Fon",
};

const TYPE_COLORS = {
  stock: "text-blue-600 bg-blue-500/10",
  index: "text-violet-600 bg-violet-500/10",
  crypto: "text-orange-600 bg-orange-500/10",
  fx: "text-emerald-600 bg-emerald-500/10",
  commodity: "text-amber-600 bg-amber-500/10",
  fund: "text-fuchsia-600 bg-fuchsia-500/10",
};

const triggerClassName =
  "flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40";

function repairDisplayText(value: string) {
  if (!value) return "";
  if (!/[ÃÄÅâÐ]/.test(value)) return value;

  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function normalizeText(value: string) {
  return repairDisplayText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .trim();
}

function mapRemoteType(type?: string): SearchResult["type"] {
  if (type === "forex") return "fx";
  if (type === "crypto") return "crypto";
  if (type === "commodity" || type === "gold") return "commodity";
  if (type === "fund") return "fund";
  return "stock";
}

function scoreResult(item: SearchResult, query: string) {
  const q = normalizeText(query);
  if (!q) return 0;

  const symbol = normalizeText(item.symbol);
  const name = normalizeText(item.name || "");
  const sector = normalizeText(item.sector || "");
  const market = normalizeText(item.market || "");
  const combined = `${symbol}${name}${sector}${market}`;

  let score = 0;

  if (symbol === q) score += 2000;
  if (name === q) score += 1500;

  if (symbol.startsWith(q)) score += 800;
  if (name.startsWith(q)) score += 600;

  if (symbol.includes(q)) score += 300;
  if (name.includes(q)) score += 200;
  if (sector.includes(q)) score += 120;
  if (market.includes(q)) score += 120;

  if (item.type === "commodity" && (q.includes("altin") || q.includes("gold"))) {
    score += 1000;
    if (symbol.includes("s1")) score += 2000;
  }

  if (combined.includes(q)) score += 10;
  return score;
}

function toSearchResult(item: {
  symbol: string;
  name?: string;
  last?: number;
  change_percent?: number;
  market?: string;
  type: SearchResult["type"];
}): SearchResult {
  return {
    symbol: item.symbol,
    name: repairDisplayText(item.name || item.symbol),
    type: item.type,
    last: item.last,
    change_percent: item.change_percent,
    market: repairDisplayText(item.market || ""),
  };
}

export function QuickSearch() {
  const router = useRouter();
  const { dashboardData } = useDashboardStore();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [remoteResults, setRemoteResults] = React.useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allItems = React.useMemo((): SearchResult[] => {
    const items: SearchResult[] = [];

    (dashboardData?.indices || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "index",
          last: item.last,
          change_percent: item.change_percent,
          market: "BIST",
        }),
      );
    });

    (dashboardData?.stocks || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "stock",
          last: item.last,
          change_percent: item.change_percent,
          market: "BIST",
        }),
      );
    });

    (dashboardData?.crypto || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "crypto",
          last: item.last,
          change_percent: item.change_percent,
          market: "Kripto",
        }),
      );
    });

    (dashboardData?.fx || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "fx",
          last: item.last,
          change_percent: item.change_percent,
          market: "Döviz",
        }),
      );
    });

    (dashboardData?.commodities || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "commodity",
          last: item.last,
          change_percent: item.change_percent,
          market: "Emtia",
        }),
      );
    });

    (dashboardData?.us_markets || []).forEach((item) => {
      items.push(
        toSearchResult({
          symbol: item.symbol,
          name: item.name,
          type: "stock",
          last: item.last,
          change_percent: item.change_percent,
          market: "ABD",
        }),
      );
    });

    return items.filter(
      (item, index, array) => array.findIndex((candidate) => candidate.symbol === item.symbol) === index,
    );
  }, [dashboardData]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(
          `/api/assets/search?query=${encodeURIComponent(trimmed)}&type=all&limit=40`,
        );
        const data = (await response.json()) as AssetSearchApiResponse;

        if (isCancelled) {
          return;
        }

        if (!response.ok || data.success === false) {
          setRemoteResults([]);
          return;
        }

        const mapped =
          data.results?.map((item) => ({
            symbol: item.symbol,
            name: repairDisplayText(item.name || item.symbol),
            type: mapRemoteType(item.type),
            last: item.price,
            change_percent: item.change,
            market: repairDisplayText(item.market || ""),
            sector: repairDisplayText(item.sector || ""),
          })) || [];

        setRemoteResults(mapped);
      } catch (error) {
        console.error("Hızlı arama başarısız oldu:", error);
        if (!isCancelled) {
          setRemoteResults([]);
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const results = React.useMemo(() => {
    if (!query.trim()) {
      return allItems.slice(0, 12);
    }

    const mergedMap = new Map<string, SearchResult>();
    [...allItems, ...remoteResults].forEach((item) => {
      mergedMap.set(item.symbol, item);
    });

    return [...mergedMap.values()]
      .map((item) => ({ item, score: scoreResult(item, query) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 18)
      .map(({ item }) => item);
  }, [allItems, query, remoteResults]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }

      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setSelectedIndex(0);
    setRemoteResults([]);

    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  const navigateTo = (item: SearchResult) => {
    setIsOpen(false);
    router.push(`/market/${item.symbol}`);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter" && results[selectedIndex]) {
      event.preventDefault();
      navigateTo(results[selectedIndex]);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={triggerClassName}>
        <Search className="size-4" />
        <span className="hidden sm:inline">Ara...</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono md:inline-flex">
          <Command className="size-3" />K
        </kbd>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="top-[18vh] max-w-[min(92vw,42rem)] translate-y-0 overflow-hidden rounded-2xl border bg-card p-0 shadow-none">
          <DialogTitle className="sr-only">Varlık Arama</DialogTitle>
          <DialogDescription className="sr-only">
            Hisse, endeks, kripto, emtia, fon ve döviz ara
          </DialogDescription>

          <div className="border-b px-4">
            <div className="flex items-center gap-3">
              <Search className="size-5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Hisse, şirket adı, sektör, kripto, döviz ara... Örn: banka, thy, altın"
                className="flex-1 bg-transparent py-4 text-lg outline-none placeholder:text-muted-foreground/50"
              />
              {isSearching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Search className="mx-auto mb-3 size-8 opacity-20" />
                <p className="text-sm">Sonuç bulunamadı</p>
                <p className="mt-1 text-xs">Şirket adı, sembol veya sektörle tekrar dene.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((item, index) => {
                  const Icon = TYPE_ICONS[item.type];
                  const isSelected = index === selectedIndex;
                  const changePercent = item.change_percent || 0;

                  return (
                    <button
                      key={`${item.type}-${item.symbol}`}
                      onClick={() => navigateTo(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "border-primary/20 bg-primary/10"
                          : "border-transparent hover:bg-muted/50",
                      )}
                    >
                      <div className={cn("shrink-0 rounded-lg p-2", TYPE_COLORS[item.type])}>
                        <Icon className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{item.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{item.symbol}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{TYPE_LABELS[item.type]}</span>
                          {item.market ? <span>• {item.market}</span> : null}
                          {item.sector ? <span className="truncate">• {item.sector}</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {typeof item.last === "number" ? (
                          <span className="font-mono text-sm font-medium">
                            {item.last.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-bold",
                            changePercent >= 0
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-red-500/10 text-red-500",
                          )}
                        >
                          {changePercent >= 0 ? "+" : ""}
                          {changePercent.toFixed(2)}%
                        </span>
                        <ArrowRight
                          className={cn(
                            "size-4 transition-all",
                            isSelected
                              ? "translate-x-0 text-primary"
                              : "-translate-x-1 text-muted-foreground opacity-0 group-hover:translate-x-0 group-hover:opacity-100",
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">↑↓</kbd>
                gezin
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">↵</kbd>
                seç
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">esc</kbd>
                kapat
              </span>
            </div>
            <span>{results.length} sonuç</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
