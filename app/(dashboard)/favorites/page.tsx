"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FavoriteListPicker } from "@/components/favorites/favorite-list-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MarketService, type MarketQuote } from "@/services/market.service";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  useFavoritesStore,
  type FavoriteList,
  type FavoriteListItem,
  type FavoriteMarket,
} from "@/store/favorites-store";
import { useUserStore } from "@/store/user-store";

type MarketSignal = {
  score?: number;
  action?: string;
  horizon?: string;
};

type RawMarketRow = {
  symbol: string;
  name?: string;
  last?: number;
  change_percent?: number;
  market_signal?: MarketSignal;
  hakiki_alfa?: {
    global_reference_return_pct?: number;
    hakiki_alfa_pct?: number;
  };
  global_reference_return_pct?: number;
  hakiki_alfa_pct?: number;
  signals?: Record<string, { score?: number; action?: string; horizon?: string }>;
  firsat_skoru?: number;
  adil_deger?: {
    fair_value_price?: number | null;
    premium_discount_pct?: number | null;
    fair_value_label?: string;
  };
  reference_band?: {
    reference_price?: number | null;
    premium_discount_pct?: number | null;
    label?: string;
  };
  [key: string]: unknown;
};

type FavoriteTableRow = FavoriteListItem & {
  price?: number;
  changePercent?: number;
  score?: number;
  globalAlpha?: number;
  hakikiAlfa?: number;
  action?: string;
  horizon?: string;
  comparisonPrice?: number | null;
  comparisonDelta?: number | null;
  comparisonLabel?: string | null;
};

function toRawMarketRow(row: MarketQuote | RawMarketRow): RawMarketRow {
  return { ...row };
}

const MARKET_LABELS: Record<FavoriteMarket, string> = {
  bist: "BIST",
  us: "ABD",
  crypto: "Kripto",
  commodities: "Emtia",
  funds: "Fon",
  fx: "FX",
};

function getNumber(item: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  return undefined;
}

function formatPrice(value: number | undefined, market: FavoriteMarket) {
  if (value == null || Number.isNaN(value)) return "-";
  const symbol = market === "us" || market === "crypto" || market === "commodities" ? "$" : "₺";
  return `${symbol}${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function scoreTone(score?: number) {
  const value = score ?? 0;
  if (value >= 75) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (value >= 60) return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  return "border-slate-500/20 bg-slate-500/10 text-slate-700";
}

function marketBadgeTone(market: FavoriteMarket) {
  if (market === "bist") return "border-rose-500/20 bg-rose-500/10 text-rose-700";
  if (market === "us") return "border-sky-500/20 bg-sky-500/10 text-sky-700";
  if (market === "crypto") return "border-orange-500/20 bg-orange-500/10 text-orange-700";
  if (market === "commodities") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  if (market === "funds") return "border-violet-500/20 bg-violet-500/10 text-violet-700";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
}

function comparisonTone(value?: number | null) {
  if ((value ?? 0) > 0) return "text-emerald-600";
  if ((value ?? 0) < 0) return "text-rose-600";
  return "text-muted-foreground";
}

function summaryCardClass(accent?: string) {
  return cn("rounded-xl border bg-card p-4", accent);
}

function normalizeFavoriteRow(item: FavoriteListItem, raw?: RawMarketRow): FavoriteTableRow {
  const marketSignal = raw?.market_signal;
  const bistSignal = raw?.signals?.firsatlar;
  const comparisonFromFairValue = raw?.adil_deger;
  const comparisonFromReference =
    (raw?.reference_band as Record<string, unknown> | undefined) || undefined;

  return {
    ...item,
    name: raw?.name || item.name || item.symbol,
    price: getNumber(raw, "last"),
    changePercent: getNumber(raw, "change_percent"),
    score: marketSignal?.score ?? bistSignal?.score ?? getNumber(raw, "firsat_skoru"),
    globalAlpha:
      getNumber(
        raw?.hakiki_alfa as Record<string, unknown> | undefined,
        "global_reference_return_pct",
      ) ?? getNumber(raw, "global_reference_return_pct"),
    hakikiAlfa:
      getNumber(raw?.hakiki_alfa as Record<string, unknown> | undefined, "hakiki_alfa_pct") ??
      getNumber(raw, "hakiki_alfa_pct"),
    action: marketSignal?.action ?? bistSignal?.action,
    horizon: marketSignal?.horizon ?? bistSignal?.horizon,
    comparisonPrice:
      getNumber(
        comparisonFromFairValue as Record<string, unknown> | undefined,
        "fair_value_price",
      ) ?? getNumber(comparisonFromReference, "reference_price"),
    comparisonDelta:
      getNumber(
        comparisonFromFairValue as Record<string, unknown> | undefined,
        "premium_discount_pct",
      ) ?? getNumber(comparisonFromReference, "premium_discount_pct"),
    comparisonLabel:
      (typeof comparisonFromFairValue?.fair_value_label === "string"
        ? comparisonFromFairValue.fair_value_label
        : null) ??
      (typeof comparisonFromReference?.label === "string" ? comparisonFromReference.label : null),
  };
}

export default function FavoritesManagementPage() {
  const currentUserId = useUserStore((state) => state.currentUser?.id);
  const lists = useFavoritesStore((state) => state.lists);
  const initializeFavorites = useFavoritesStore((state) => state.initialize);
  const createList = useFavoritesStore((state) => state.createList);
  const deleteList = useFavoritesStore((state) => state.deleteList);
  const removeItemFromList = useFavoritesStore((state) => state.removeItemFromList);
  const dashboardData = useDashboardStore((state) => state.dashboardData);
  const fetchDashboardData = useDashboardStore((state) => state.fetchDashboardData);

  const [selectedListId, setSelectedListId] = React.useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [newListName, setNewListName] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [rows, setRows] = React.useState<FavoriteTableRow[]>([]);
  const [createError, setCreateError] = React.useState("");

  const userLists = React.useMemo(
    () => lists.filter((list) => list.userId === currentUserId),
    [currentUserId, lists],
  );

  const selectedList = React.useMemo(
    () => userLists.find((list) => list.id === selectedListId) ?? null,
    [selectedListId, userLists],
  );

  React.useEffect(() => {
    void initializeFavorites(currentUserId || null);
  }, [currentUserId, initializeFavorites]);

  React.useEffect(() => {
    if (selectedListId && userLists.every((list) => list.id !== selectedListId)) {
      setSelectedListId(null);
    }
  }, [selectedListId, userLists]);

  const handleCreateList = React.useCallback(() => {
    const normalizedName = newListName.trim().replace(/\s+/g, " ");

    if (!currentUserId) {
      const nextError = "Liste olusturmak icin once bir yatirimci profili secilmelidir.";
      setCreateError(nextError);
      toast.error(nextError);
      return;
    }

    if (!normalizedName) {
      const nextError = "Liste olusturmak icin bir isim yazin.";
      setCreateError(nextError);
      toast.error(nextError);
      return;
    }

    const existingList = userLists.find(
      (list) =>
        list.name.trim().toLocaleLowerCase("tr-TR") === normalizedName.toLocaleLowerCase("tr-TR"),
    );

    if (existingList) {
      setSelectedListId(existingList.id);
      setCreateDialogOpen(false);
      setCreateError("");
      toast.message("Mevcut liste acildi.");
      return;
    }

    void (async () => {
      const createdId = await createList(currentUserId, normalizedName);
      if (!createdId) {
        const nextError = "Liste olusturulamadi. Ismi kontrol edip tekrar dene.";
        setCreateError(nextError);
        toast.error(nextError);
        return;
      }

      setSelectedListId(createdId);
      setNewListName("");
      setCreateError("");
      setCreateDialogOpen(false);
      toast.success("Liste olusturuldu.");
    })();
  }, [createList, currentUserId, newListName, userLists]);

  const loadListRows = React.useCallback(
    async (list: FavoriteList | null) => {
      if (!list || list.items.length === 0) {
        setRows([]);
        return;
      }

      setIsLoading(true);
      try {
        const neededMarkets = new Set(list.items.map((item) => item.market));
        const marketMaps = new Map<FavoriteMarket, Map<string, RawMarketRow>>();

        if (neededMarkets.has("bist")) {
          const response = await MarketService.getAllBistStocks();
          marketMaps.set(
            "bist",
            new Map((response.results || []).map((row) => [row.symbol, toRawMarketRow(row)])),
          );
        }

        const parallelTasks: Array<Promise<void>> = [];

        if (neededMarkets.has("us")) {
          parallelTasks.push(
            MarketService.getUSMarkets().then((response) => {
              marketMaps.set(
                "us",
                new Map((response.all || []).map((row) => [row.symbol, toRawMarketRow(row)])),
              );
            }),
          );
        }

        if (neededMarkets.has("crypto")) {
          parallelTasks.push(
            MarketService.getCryptoMarket().then((response) => {
              marketMaps.set(
                "crypto",
                new Map((response.all || []).map((row) => [row.symbol, toRawMarketRow(row)])),
              );
            }),
          );
        }

        if (neededMarkets.has("commodities")) {
          parallelTasks.push(
            MarketService.getCommoditiesMarket().then((response) => {
              marketMaps.set(
                "commodities",
                new Map((response.all || []).map((row) => [row.symbol, toRawMarketRow(row)])),
              );
            }),
          );
        }

        if (neededMarkets.has("funds")) {
          parallelTasks.push(
            MarketService.getFundsMarket().then((response) => {
              marketMaps.set(
                "funds",
                new Map((response.all || []).map((row) => [row.symbol, toRawMarketRow(row)])),
              );
            }),
          );
        }

        await Promise.all(parallelTasks);

        if (neededMarkets.has("fx")) {
          if (!dashboardData?.fx?.length) {
            await fetchDashboardData();
          }
          const fxRows = useDashboardStore.getState().dashboardData?.fx || [];
          marketMaps.set("fx", new Map(fxRows.map((row) => [row.symbol, toRawMarketRow(row)])));
        }

        const normalizedRows = list.items
          .map((item) => normalizeFavoriteRow(item, marketMaps.get(item.market)?.get(item.symbol)))
          .sort((left, right) => {
            const scoreDiff = (right.score ?? -1) - (left.score ?? -1);
            if (scoreDiff !== 0) return scoreDiff;

            const dayDiff = (right.changePercent ?? -999) - (left.changePercent ?? -999);
            if (dayDiff !== 0) return dayDiff;

            return left.symbol.localeCompare(right.symbol, "tr");
          });

        setRows(normalizedRows);
      } catch (error) {
        console.error("[Favorites] Failed to load list data:", error);
        toast.error("Liste verileri yuklenemedi.");
        setRows(list.items.map((item) => normalizeFavoriteRow(item)));
      } finally {
        setIsLoading(false);
      }
    },
    [dashboardData?.fx, fetchDashboardData],
  );

  React.useEffect(() => {
    void loadListRows(selectedList);
  }, [loadListRows, selectedList]);

  return (
    <div className="page-shell no-scrollbar overflow-y-auto">
      <div className="flex flex-col gap-5">
        <div className="page-header-row gap-3">
          <div className="space-y-1">
            {selectedList ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedListId(null)}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Liste seçimine dön
                </button>
                <h1 className="text-2xl font-medium tracking-tight text-foreground">
                  {selectedList.name}
                </h1>
              </>
            ) : (
              <h1 className="text-2xl font-medium tracking-tight text-foreground">
                Favori Listelerim
              </h1>
            )}
          </div>

          <Button
            type="button"
            onClick={() => {
              setCreateError("");
              setCreateDialogOpen(true);
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="size-4" />
            Liste Oluştur
          </Button>
        </div>

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              setCreateError("");
              setNewListName("");
            }
          }}
        >
          <DialogContent className="overflow-hidden rounded-[1.75rem] border bg-card p-0 shadow-none sm:max-w-[480px]">
            <div className="p-6 sm:p-7">
              <div className="mb-6">
                <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                  Yeni Liste
                </div>
                <DialogTitle className="mt-2 text-2xl font-medium tracking-tight">
                  Favori listesi oluştur
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Yeni bir takip listesi tanimla ve varliklarini bu listenin icinde grupla.
                </DialogDescription>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="favorite-list-name"
                    className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
                  >
                    Liste adi
                  </Label>
                  <Input
                    id="favorite-list-name"
                    placeholder="Orn: Temettu Takip Listesi"
                    value={newListName}
                    onChange={(event) => {
                      setNewListName(event.target.value);
                      if (createError) setCreateError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateList();
                      }
                    }}
                    className="h-12 rounded-2xl border bg-background px-4 text-sm"
                    autoFocus
                  />
                </div>

                {createError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-600">
                    {createError}
                  </div>
                ) : null}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                    className="h-11 flex-1 rounded-2xl"
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateList}
                    className="h-11 flex-[1.4] rounded-2xl border border-border/70 bg-background text-foreground shadow-none hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="size-4" />
                      <span>Liste oluştur</span>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {userLists.length === 0 ? (
          <div className="rounded-2xl border bg-card px-6 py-16 text-center">
            <Star className="mx-auto size-10 text-amber-400" />
            <h2 className="mt-4 text-xl font-semibold">Henuz liste yok</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ilk favori listesini olusturup varliklarini gruplamaya baslayabilirsin.
            </p>
          </div>
        ) : !selectedList ? (
          <section className="rounded-xl border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {userLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedListId(list.id)}
                  className="rounded-xl border bg-background px-4 py-4 text-left transition-all hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold tracking-tight">{list.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Listeyi ac</div>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                      {list.items.length}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={summaryCardClass()}>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Liste</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">
                  {selectedList.name}
                </div>
              </div>
              <div className={summaryCardClass()}>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Kayitli Varlik
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">
                  {selectedList.items.length}
                </div>
              </div>
              <div className={summaryCardClass("border-emerald-500/20")}>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Yuksek Skorlu
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">
                  {rows.filter((row) => (row.score ?? 0) >= 75).length}
                </div>
              </div>
              <div className={summaryCardClass()}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Listeyi Yönet
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Secili listeyi silebilirsin.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`${selectedList.name} listesini silmek istiyor musun?`)) {
                        return;
                      }
                      void deleteList(selectedList.id, currentUserId || null);
                      toast.success("Liste silindi.");
                    }}
                  >
                    <Trash2 className="size-4" />
                    Sil
                  </Button>
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-border/40 bg-card">
              <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-lg font-medium tracking-tight">{selectedList.name}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadListRows(selectedList)}
                  className="w-full sm:w-auto"
                >
                  <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
                  Yenile
                </Button>
              </div>

              <div className="space-y-3 p-4 lg:hidden">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="animate-pulse rounded-xl border bg-background p-4">
                      <div className="h-4 w-24 rounded-full bg-muted/30" />
                      <div className="mt-3 h-4 w-40 rounded-full bg-muted/30" />
                      <div className="mt-4 h-16 rounded-xl bg-muted/20" />
                    </div>
                  ))
                ) : rows.length === 0 ? (
                  <div className="rounded-xl border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                    Bu listede henüz varlık yok.
                  </div>
                ) : (
                  rows.map((row) => (
                    <div key={`${row.market}-${row.symbol}`} className="rounded-xl border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/market/${row.symbol}?market=${row.market}`} className="font-semibold tracking-tight text-foreground transition-colors hover:text-primary">
                              {row.symbol}
                            </Link>
                            <FavoriteListPicker
                              symbol={row.symbol}
                              name={row.name}
                              market={row.market}
                              size="icon-sm"
                              className="-ml-1 size-7"
                            />
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                                marketBadgeTone(row.market),
                              )}
                            >
                              {MARKET_LABELS[row.market]}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-xs uppercase tracking-tight text-muted-foreground">
                            {row.name || row.symbol}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeItemFromList(selectedList.id, row.symbol, row.market)}
                          className="rounded-lg border p-2 text-muted-foreground transition-colors hover:text-rose-600"
                          title="Listeden cikar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fiyat</div>
                          <div className="mt-1 font-mono font-semibold">{formatPrice(row.price, row.market)}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Gün %</div>
                          <div className={cn("mt-1 font-mono font-semibold", comparisonTone(row.changePercent))}>
                            {formatPercent(row.changePercent)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Skor</div>
                          <div className="mt-1">
                            <span
                              className={cn(
                                "inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold",
                                scoreTone(row.score),
                              )}
                            >
                              {row.score != null ? Math.round(row.score) : "-"}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Aksiyon</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{row.action || "-"}</div>
                          <div className="text-xs text-muted-foreground">{row.horizon || "-"}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <div className="text-muted-foreground">
                          Kıyas: <span className={cn("font-medium", comparisonTone(row.comparisonDelta))}>{formatPercent(row.comparisonDelta)}</span>
                        </div>
                        <div className="text-muted-foreground">{formatDate(row.addedAt)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/20 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="w-12 px-4 py-3.5 text-center">#</th>
                    <th className="min-w-[220px] px-4 py-3.5 text-left">Sembol & Sirket</th>
                    <th className="px-4 py-3.5 text-left">Piyasa</th>
                    <th className="px-4 py-3.5 text-right">Fiyat</th>
                    <th className="px-4 py-3.5 text-right">Gun %</th>
                    <th className="px-4 py-3.5 text-center">Skor</th>
                    <th className="px-4 py-3.5 text-right">GA</th>
                    <th className="px-4 py-3.5 text-right">HA</th>
                    <th className="px-4 py-3.5 text-center">Kıyas</th>
                    <th className="px-4 py-3.5 text-left">Aksiyon</th>
                    <th className="px-4 py-3.5 text-left">Eklenme</th>
                    <th className="px-4 py-3.5 text-right">Islem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={index} className="animate-pulse">
                        <td colSpan={12} className="px-4 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-4 w-8 rounded-full bg-muted/30" />
                            <div className="h-4 w-40 rounded-full bg-muted/30" />
                            <div className="ml-auto h-4 w-72 rounded-full bg-muted/30" />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-20 text-center text-muted-foreground">
                        Bu listede henüz varlık yok.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr key={`${row.market}-${row.symbol}`} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 text-center font-mono text-[10px] text-muted-foreground/40">
                          {(index + 1).toString().padStart(2, "0")}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/market/${row.symbol}?market=${row.market}`} className="group/link flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="leading-none font-bold tracking-tight text-foreground transition-colors group-hover/link:text-primary">
                                {row.symbol}
                              </span>
                              <FavoriteListPicker
                                symbol={row.symbol}
                                name={row.name}
                                market={row.market}
                                size="icon-sm"
                                className="-ml-1 size-7"
                              />
                            </div>
                            <span className="max-w-[220px] truncate text-[10px] font-medium uppercase tracking-tight text-muted-foreground opacity-70">
                              {row.name || row.symbol}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                              marketBadgeTone(row.market),
                            )}
                          >
                            {MARKET_LABELS[row.market]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                          {formatPrice(row.price, row.market)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono font-black tabular-nums",
                            (row.changePercent ?? 0) > 0 && "text-emerald-500",
                            (row.changePercent ?? 0) < 0 && "text-rose-500",
                            row.changePercent == null && "text-muted-foreground",
                          )}
                        >
                          {formatPercent(row.changePercent)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              "inline-flex min-w-14 justify-center rounded-lg border px-2.5 py-1 text-xs font-bold",
                              scoreTone(row.score),
                            )}
                          >
                            {row.score != null ? Math.round(row.score) : "-"}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            comparisonTone(row.globalAlpha),
                          )}
                        >
                          {formatPercent(row.globalAlpha)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono font-bold tabular-nums",
                            comparisonTone(row.hakikiAlfa),
                          )}
                        >
                          {formatPercent(row.hakikiAlfa)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-mono font-semibold">
                              {row.comparisonPrice != null
                                ? formatPrice(row.comparisonPrice, row.market)
                                : "-"}
                            </span>
                            <span
                              className={cn(
                                "text-[11px] font-medium",
                                comparisonTone(row.comparisonDelta),
                              )}
                            >
                              {row.comparisonLabel ?? "Kıyas"} {formatPercent(row.comparisonDelta)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-foreground">{row.action || "Izle"}</span>
                            <span className="text-xs text-muted-foreground">{row.horizon || "-"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(row.addedAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-rose-600"
                            onClick={() => {
                              void removeItemFromList(selectedList.id, row.symbol, currentUserId || null);
                              toast.success(`${row.symbol} listeden cikarildi.`);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
