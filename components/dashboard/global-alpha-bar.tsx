"use client";

import * as React from "react";
import { fetchGlobalAlpha, peekEngineCache, type GlobalAlphaItem, type GlobalAlphaResponse } from "@/lib/api-client";

function formatTrillionUsd(value: number) {
  if (value >= 100) return `$${value.toFixed(0)}T`;
  if (value >= 10) return `$${value.toFixed(1)}T`;
  return `$${value.toFixed(2)}T`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}%${value.toFixed(2)}`;
}

function formatPeriodLabel(period: "daily" | "weekly" | "monthly" | "ytd" | "yearly" | "five_years" | "all") {
  switch (period) {
    case "daily":
      return "Gunluk";
    case "weekly":
      return "Haftalik";
    case "monthly":
      return "Aylik";
    case "ytd":
      return "YTD";
    case "yearly":
      return "Yillik";
    case "five_years":
      return "5Y";
    case "all":
      return "Tumu";
    default:
      return "Gunluk";
  }
}

export function GlobalAlphaBar({
  period = "daily",
}: {
  period?: "daily" | "weekly" | "monthly" | "ytd" | "yearly" | "five_years" | "all";
}) {
  const initialCache = React.useMemo(() => {
    const query = `?period=${period}`;
    return (
      peekEngineCache<GlobalAlphaResponse>(`/dashboard/global-alpha${query}`) ||
      peekEngineCache<GlobalAlphaResponse>(`/dashboard/dashboard/global-alpha${query}`)
    );
  }, [period]);

  const [items, setItems] = React.useState<GlobalAlphaItem[]>(initialCache?.core_items || initialCache?.items || []);
  const [total, setTotal] = React.useState<number>(initialCache?.total_trillion_usd || 0);
  const [gaRatio, setGaRatio] = React.useState<number | null>(
    typeof initialCache?.core_daily_return_pct === "number"
      ? initialCache.core_daily_return_pct
      : typeof initialCache?.daily_return_pct === "number"
        ? initialCache.daily_return_pct
        : null,
  );
  const [resolvedPeriod, setResolvedPeriod] = React.useState<string | null>(initialCache ? period : null);
  const [isLoadingPeriod, setIsLoadingPeriod] = React.useState(!initialCache);

  React.useEffect(() => {
    let cancelled = false;

    setItems(initialCache?.core_items || initialCache?.items || []);
    setTotal(initialCache?.total_trillion_usd || 0);
    setGaRatio(
      typeof initialCache?.core_daily_return_pct === "number"
        ? initialCache.core_daily_return_pct
        : typeof initialCache?.daily_return_pct === "number"
          ? initialCache.daily_return_pct
          : null,
    );
    setResolvedPeriod(initialCache ? period : null);
    setIsLoadingPeriod(!initialCache);

    const load = async (force = false) => {
      try {
        const data = await fetchGlobalAlpha(force, period);
        if (cancelled) return;

        setItems(data.core_items || data.items || []);
        setTotal(data.total_trillion_usd || 0);

        const ratio = typeof data.core_daily_return_pct === "number" && !Number.isNaN(data.core_daily_return_pct)
          ? data.core_daily_return_pct
          : typeof data.daily_return_pct === "number" && !Number.isNaN(data.daily_return_pct)
            ? data.daily_return_pct
            : null;

        setResolvedPeriod(period);
        setIsLoadingPeriod(false);

        if (ratio !== null) {
          setGaRatio(ratio);
          return;
        }

        if (!force) {
          await load(true);
          return;
        }

        setGaRatio(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[GlobalAlphaBar] Fetch failed:", error);
        setResolvedPeriod(null);
        setIsLoadingPeriod(false);
        setGaRatio(null);
      }
    };

    void load(false);
    const interval = setInterval(() => void load(true), 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [initialCache, period]);

  const showResolvedData = resolvedPeriod === period && !isLoadingPeriod;
  const visibleItems = showResolvedData ? items : [];
  const visibleTotal = showResolvedData ? total : 0;
  const visibleGaRatio = showResolvedData ? gaRatio : null;
  const normalizedVisibleItems = React.useMemo(
    () => visibleItems.map((item) => ({ ...item, share: item.share ?? 0 })),
    [visibleItems],
  );

  return (
    <section className="shrink-0 rounded-xl border bg-card/95 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          <div className="flex h-7 w-full">
            {normalizedVisibleItems.length > 0 ? (
              normalizedVisibleItems.map((item) => (
                <div
                  key={item.key}
                  className="h-full transition-all"
                  style={{
                    width: `${Math.max(item.share ?? 0, 1.5)}%`,
                    backgroundColor: item.color,
                  }}
                  title={`${item.label}: ${item.share.toFixed(2)}% • ${formatTrillionUsd(item.estimated_value_trillion_usd)}`}
                />
              ))
            ) : (
              <div className="h-full w-full animate-pulse bg-muted" />
            )}
          </div>
        </div>

        <div className="flex h-7 min-w-[132px] shrink-0 items-center justify-center rounded-lg border bg-muted/20 px-4 text-right">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">GA</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">{formatPeriodLabel(period)}</span>
            <p className={`text-lg font-bold ${visibleGaRatio !== null && visibleGaRatio >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {visibleGaRatio === null ? "--" : formatPercent(visibleGaRatio)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-1.5 rounded-lg bg-muted/20 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <div className="shrink-0 font-medium text-foreground">
            {formatTrillionUsd(visibleTotal)}
          </div>
          {normalizedVisibleItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-foreground">{item.label}</span>
              <span>%{(item.share ?? 0).toFixed(2)}</span>
              <span>{formatTrillionUsd(item.estimated_value_trillion_usd)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
