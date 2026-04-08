"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import("react-apexcharts"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full animate-pulse bg-muted/20 flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Yükleniyor...</span>
        </div>
    )
});

interface TreemapItem {
    symbol: string;
    name?: string;
    weight: number;
    change: number;
}

interface StockTreemapProps {
    data: TreemapItem[];
    height?: number;
    onItemClick?: (symbol: string) => void;
}

export function StockTreemap({ data, height = 280, onItemClick }: StockTreemapProps) {
    const { theme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !data || data.length === 0) {
        return (
            <div
                style={{ height }}
                className="bg-muted/10 flex items-center justify-center"
            >
                <span className="text-muted-foreground text-sm">Veri bekleniyor...</span>
            </div>
        );
    }

    const isDark = theme === "dark";

    // Sort data by change (highest gainers first, then losers)
    const sortedData = [...data].sort((a, b) => b.change - a.change);

    // Professional green/red color palette - dark muted tones
    const seriesData = sortedData.map(item => {
        let fillColor: string;

        if (item.change > 0) {
            // Positive - deep forest green shades
            if (isDark) {
                if (item.change > 5) fillColor = "#052e16";      // Very deep green
                else if (item.change > 3) fillColor = "#14532d"; // Deep green
                else if (item.change > 1.5) fillColor = "#166534"; // Dark green
                else fillColor = "#1a5c38";                      // Muted green
            } else {
                if (item.change > 5) fillColor = "#166534";
                else if (item.change > 3) fillColor = "#15803d";
                else if (item.change > 1.5) fillColor = "#16a34a";
                else fillColor = "#22c55e";
            }
        } else if (item.change < 0) {
            // Negative - deep maroon/burgundy shades
            if (isDark) {
                if (item.change < -5) fillColor = "#450a0a";     // Very deep red
                else if (item.change < -3) fillColor = "#5c1a1a"; // Deep maroon
                else if (item.change < -1.5) fillColor = "#6b2020"; // Dark burgundy
                else fillColor = "#5a3030";                      // Muted red-brown
            } else {
                if (item.change < -5) fillColor = "#991b1b";
                else if (item.change < -3) fillColor = "#b91c1c";
                else if (item.change < -1.5) fillColor = "#dc2626";
                else fillColor = "#ef4444";
            }
        } else {
            // Neutral - dark gray
            fillColor = isDark ? "#1c1c1f" : "#d4d4d8";
        }

        return {
            x: item.symbol,
            // Weight determines area size - use actual weight percentage
            y: item.weight,
            fillColor,
            meta: {
                change: item.change,
                weight: item.weight,
                name: item.name
            }
        };
    });

    const options: ApexCharts.ApexOptions = {
        chart: {
            type: "treemap",
            toolbar: { show: false },
            animations: {
                enabled: true,
                speed: 300,
            },
            background: "transparent",
            fontFamily: "inherit",
            events: {
                dataPointSelection: (event, chartContext, config) => {
                    const symbol = config.w.config.series[0].data[config.dataPointIndex]?.x;
                    if (symbol && onItemClick) {
                        onItemClick(symbol);
                    }
                }
            }
        },
        legend: { show: false },
        dataLabels: {
            enabled: true,
            style: {
                fontSize: "11px",
                fontFamily: "inherit",
                fontWeight: 500,
                colors: ["#ffffff"]
            },
            formatter: function (text: string, op: any) {
                // Hide labels for very small cells
                if (op.value < 1) return "";
                return text;
            },
            offsetY: 0,
        },
        tooltip: {
            enabled: true,
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                const data = w.config.series[0].data[dataPointIndex];
                const change = data.meta?.change || 0;
                const weight = data.meta?.weight || 0;
                const name = data.meta?.name || data.x;
                const isPositive = change >= 0;

                const bgColor = isDark ? "#18181b" : "#ffffff";
                const textColor = isDark ? "#fafafa" : "#18181b";
                const mutedColor = isDark ? "#a1a1aa" : "#71717a";
                const borderColor = isDark ? "#27272a" : "#e4e4e7";
                // Same colors as price chart
                const greenColor = "#10b981";
                const redColor = "#ef4444";

                return `
                    <div style="
                        background: ${bgColor};
                        border: 1px solid ${borderColor};
                        border-radius: 8px;
                        padding: 12px 14px;
                        font-family: inherit;
                        box-shadow: 0 4px 12px rgba(0,0,0,${isDark ? "0.4" : "0.08"});
                        min-width: 150px;
                    ">
                        <div style="font-weight: 600; font-size: 13px; color: ${textColor};">
                            ${data.x}
                        </div>
                        <div style="font-size: 11px; color: ${mutedColor}; margin-bottom: 8px;">
                            ${name}
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px;">
                            <span style="color: ${mutedColor};">Değişim</span>
                            <span style="color: ${isPositive ? greenColor : redColor}; font-weight: 600;">
                                ${isPositive ? "+" : ""}${change.toFixed(2)}%
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 3px;">
                            <span style="color: ${mutedColor};">Ağırlık</span>
                            <span style="color: ${textColor}; font-weight: 600;">
                                %${weight.toFixed(2)}
                            </span>
                        </div>
                    </div>
                `;
            }
        },
        plotOptions: {
            treemap: {
                distributed: true,
                enableShades: false,
                borderRadius: 0,
                useFillColorAsStroke: false,
            }
        },
        stroke: {
            width: 3,
            colors: [isDark ? "#09090b" : "#ffffff"]
        },
        colors: seriesData.map(d => d.fillColor),
        states: {
            hover: {
                filter: {
                    type: "lighten"
                }
            },
            active: {
                filter: {
                    type: "lighten"
                }
            }
        }
    };

    const series = [{
        data: seriesData
    }];

    return (
        <div style={{ height }} className="w-full">
            <Chart
                options={options}
                series={series}
                type="treemap"
                height={height}
                width="100%"
            />
        </div>
    );
}
