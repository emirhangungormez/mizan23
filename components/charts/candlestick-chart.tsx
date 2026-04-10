"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

interface CandlestickChartProps {
    data: Array<{
        Date?: string;
        date?: string;
        Datetime?: string;
        datetime?: string;
        index?: string;
        Open?: number;
        open?: number;
        High?: number;
        high?: number;
        Low?: number;
        low?: number;
        Close?: number;
        close?: number;
        Volume?: number;
        volume?: number;
    }>;
    height?: number;
    symbol?: string;
    period?: string;
    interval?: string;
    useHeikinAshi?: boolean;
}

// Candlestick chart using Lightweight Charts
function CandlestickChartInner({ data, height = 400, symbol, period = "1mo", interval = "1d", useHeikinAshi = false }: CandlestickChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [haData, setHaData] = useState<CandlestickChartProps["data"]>([]);

    useEffect(() => {
        if (useHeikinAshi && symbol) {
            setHaData([]);
            const fetchHA = async () => {
                const MarketService = (await import("@/services/market.service")).MarketService;
                const res = await MarketService.getHeikinAshi(symbol, period, interval);
                const nextData = Array.isArray(res?.data) ? (res.data as CandlestickChartProps["data"]) : null;
                if (nextData) {
                    setHaData(nextData);
                }
            };
            fetchHA();
        } else {
            setHaData([]);
        }
    }, [interval, period, useHeikinAshi, symbol]);

    useEffect(() => {
        const displayData = useHeikinAshi ? haData : data;
        if (!chartContainerRef.current || !displayData || displayData.length === 0) return;

        let chart: any = null;
        let candlestickSeries: any = null;

        const initChart = async () => {
            try {
                const LightweightCharts = await import("lightweight-charts");

                if (!chartContainerRef.current) return;

                const isDark = theme === "dark";

                // Create chart
                chart = LightweightCharts.createChart(chartContainerRef.current, {
                    width: chartContainerRef.current.clientWidth,
                    height: height,
                    layout: {
                        background: { color: isDark ? "#0f172a" : "#ffffff" },
                        textColor: isDark ? "#94a3b8" : "#64748b",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
                    },
                    grid: {
                        vertLines: { color: isDark ? "#1e293b" : "#eef2f7" },
                        horzLines: { color: isDark ? "#1e293b" : "#eef2f7" },
                    },
                    crosshair: {
                        mode: 1,
                    },
                    rightPriceScale: {
                        borderColor: isDark ? "#334155" : "#dbe4ee",
                        autoScale: true,
                    },
                    timeScale: {
                        borderColor: isDark ? "#334155" : "#dbe4ee",
                        timeVisible: true,
                        secondsVisible: false,
                        rightOffset: 6,
                    },
                });

                // Add candlestick series
                candlestickSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
                    upColor: "#10b981",
                    downColor: "#ef4444",
                    borderUpColor: "#10b981",
                    borderDownColor: "#ef4444",
                    wickUpColor: "#10b981",
                    wickDownColor: "#ef4444",
                    lastValueVisible: true,
                    priceLineVisible: true,
                });

                // Format and set data
                const formattedData = displayData
                    .filter(item => {
                        const dateStr = item.Datetime || item.datetime || item.Date || item.date || item.index;
                        const open = item.Open ?? item.open;
                        const close = item.Close ?? item.close;
                        return dateStr && open != null && close != null;
                    })
                    .map(item => {
                        const dateStr = item.Datetime || item.datetime || item.Date || item.date || item.index || "";
                        const timestamp = Math.floor(new Date(dateStr).getTime() / 1000);

                        return {
                            time: timestamp,
                            open: item.Open ?? item.open ?? 0,
                            high: item.High ?? item.high ?? 0,
                            low: item.Low ?? item.low ?? 0,
                            close: item.Close ?? item.close ?? 0,
                        };
                    })
                    .sort((a, b) => a.time - b.time);

                if (formattedData.length > 0) {
                    candlestickSeries.setData(formattedData);
                    chart.timeScale().fitContent();
                }

                // Handle resize
                const handleResize = () => {
                    if (chartContainerRef.current && chart) {
                        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
                    }
                };

                window.addEventListener("resize", handleResize);

                return () => {
                    window.removeEventListener("resize", handleResize);
                    if (chart) {
                        chart.remove();
                    }
                };
            } catch (error) {
                console.error("Error initializing chart:", error);
            }
        };

        initChart();

        return () => {
            if (chart) {
                chart.remove();
            }
        };
    }, [data, haData, useHeikinAshi, theme, height]);

    if (!data || data.length === 0) {
        return (
            <div
                style={{ height }}
                className="bg-card flex items-center justify-center"
            >
                <span className="text-muted-foreground text-sm">Grafik verisi bulunamadı</span>
            </div>
        );
    }

    return (
        <div
            ref={chartContainerRef}
            className="w-full"
            style={{ height }}
        />
    );
}

// Export with dynamic import to avoid SSR issues
export const CandlestickChart = dynamic(
    () => Promise.resolve(CandlestickChartInner),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-[400px] bg-muted/20 animate-pulse rounded-lg flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Grafik yükleniyor...</span>
            </div>
        )
    }
);
