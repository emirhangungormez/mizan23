"use client";

import * as React from "react";
import { useTheme } from "next-themes";

type TradingViewAdvancedChartProps = {
  symbol: string;
  assetType?: "STOCK" | "INDEX" | "FOREX" | "CRYPTO" | "FUND";
  period?: string;
  height?: number;
};

function resolveTradingViewSymbol(symbol: string, assetType?: TradingViewAdvancedChartProps["assetType"]) {
  const normalized = symbol.trim().toUpperCase();

  if (!normalized) return null;

  if (assetType === "CRYPTO") {
    if (normalized.endsWith("-USD")) {
      const base = normalized.replace("-USD", "");
      return `BINANCE:${base}USDT`;
    }
    return `BINANCE:${normalized.replace("-", "")}`;
  }

  if (assetType === "FOREX") {
    if (normalized.endsWith("=X")) {
      const pair = normalized.replace("=X", "");
      return `FX:${pair}`;
    }

    if (normalized.length === 6) {
      return `FX:${normalized}`;
    }
  }

  if (assetType === "INDEX") {
    if (normalized === "^GSPC") return "SP:SPX";
    if (normalized === "^DJI") return "DJ:DJI";
    if (normalized === "^IXIC") return "NASDAQ:IXIC";
    return `BIST:${normalized.replace("^", "")}`;
  }

  if (assetType === "STOCK") {
    if (/^[A-Z]{3,6}$/.test(normalized)) {
      return `BIST:${normalized}`;
    }
    return normalized;
  }

  if (assetType === "FUND") {
    return normalized;
  }

  return normalized;
}

function resolveInterval(period?: string) {
  switch (period) {
    case "1d":
      return "15";
    case "5d":
      return "60";
    case "1mo":
    case "3mo":
      return "D";
    case "6mo":
    case "1y":
      return "W";
    case "5y":
    case "max":
      return "M";
    default:
      return "D";
  }
}

export function TradingViewAdvancedChart({
  symbol,
  assetType,
  period = "1mo",
  height = 460,
}: TradingViewAdvancedChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();

  const tvSymbol = React.useMemo(() => resolveTradingViewSymbol(symbol, assetType), [assetType, symbol]);
  const interval = React.useMemo(() => resolveInterval(period), [period]);

  React.useEffect(() => {
    if (!containerRef.current || !tvSymbol) return;

    const container = containerRef.current;
    container.innerHTML = "";

    const widgetHost = document.createElement("div");
    widgetHost.className = "tradingview-widget-container__widget h-full w-full";
    container.appendChild(widgetHost);

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright hidden";
    container.appendChild(copyright);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "Europe/Istanbul",
      theme: resolvedTheme === "dark" ? "dark" : "light",
      style: "1",
      locale: "tr",
      allow_symbol_change: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      save_image: true,
      backgroundColor: "rgba(0, 0, 0, 0)",
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [interval, resolvedTheme, tvSymbol]);

  if (!tvSymbol) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-sm text-muted-foreground"
      >
        TradingView görünümü bu varlık için hazırlanamadı.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        ref={containerRef}
        style={{ height }}
        className="tradingview-widget-container h-full w-full"
      />
    </div>
  );
}
