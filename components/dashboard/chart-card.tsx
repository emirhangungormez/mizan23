"use client";

import * as React from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Line,
    LineChart,
} from "recharts";
import {
    Calendar as CalendarIcon,
    ChevronDown,
    Settings,
    Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const mockData = [
    { time: "09:00", p1: 11200, p2: 10800, p3: 9500, p4: 12100 },
    { time: "10:00", p1: 11250, p2: 10900, p3: 9600, p4: 12050 },
    { time: "11:00", p1: 11230, p2: 11000, p3: 9750, p4: 11900 },
    { time: "12:00", p1: 11300, p2: 11150, p3: 9800, p4: 11800 },
    { time: "13:00", p1: 11350, p2: 11050, p3: 9900, p4: 11950 },
    { time: "14:00", p1: 11320, p2: 10950, p3: 10100, p4: 12000 },
    { time: "15:00", p1: 11400, p2: 11100, p3: 10250, p4: 12150 },
    { time: "16:00", p1: 11450, p2: 11250, p3: 10400, p4: 12300 },
    { time: "17:00", p1: 11498, p2: 11350, p3: 10550, p4: 12450 },
];

const lineColors = {
    p1: "#ec4899", // pink
    p2: "#06b6d4", // cyan
    p3: "#f97316", // orange
    p4: "#22c55e", // green
};

export function ChartCard() {
    const { theme } = useTheme();
    const [chartType, setChartType] = React.useState<"line" | "area">("line");
    const [showGrid, setShowGrid] = React.useState(true);
    const [visibleLines, setVisibleLines] = React.useState<Record<string, boolean>>({
        p1: true,
        p2: true,
        p3: true,
        p4: true,
    });

    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);

    const axisColor = theme === "dark" ? "#71717a" : "#868c98";
    const gridColor = theme === "dark" ? "#3f3f46" : "#e2e4e9";

    if (!mounted) {
        return <div className="rounded-lg border bg-card h-[400px] animate-pulse" />;
    }

    return (
        <div className="bg-card text-card-foreground rounded-lg border flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    <h3 className="font-medium text-sm sm:text-base">Piyasa Analiz Trendi</h3>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 border-border/50 text-xs">
                                <CalendarIcon className="size-3.5" />
                                Son 24 Saat
                                <ChevronDown className="size-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>Son 1 Saat</DropdownMenuItem>
                            <DropdownMenuItem>Son 24 Saat</DropdownMenuItem>
                            <DropdownMenuItem>Son 7 Gün</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="size-7 border-border/50">
                                <Settings className="size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="text-xs">Grafik Tipi</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    <DropdownMenuItem onClick={() => setChartType("line")}>
                                        Çizgi {chartType === "line" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setChartType("area")}>
                                        Alan {chartType === "area" && "✓"}
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                checked={showGrid}
                                onCheckedChange={setShowGrid}
                                className="text-xs"
                            >
                                Izgarayı Göster
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="text-xs">Serileri Göster</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    {Object.entries(visibleLines).map(([key, value]) => (
                                        <DropdownMenuCheckboxItem
                                            key={key}
                                            checked={value}
                                            onCheckedChange={() =>
                                                setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }))
                                            }
                                            className="text-xs"
                                        >
                                            <span
                                                className="size-2 rounded-full mr-2"
                                                style={{ backgroundColor: lineColors[key as keyof typeof lineColors] }}
                                            />
                                            Seri {key.replace("p", "")}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="p-4">
                <div className="h-[250px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {chartType === "area" ? (
                            <AreaChart data={mockData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />}
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} hide />
                                <Tooltip />
                                <defs>
                                    {Object.entries(lineColors).map(([key, color]) => (
                                        <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                {Object.entries(visibleLines).map(([key, visible]) => visible && (
                                    <Area
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stroke={lineColors[key as keyof typeof lineColors]}
                                        strokeWidth={2}
                                        fill={`url(#gradient-${key})`}
                                        dot={false}
                                    />
                                ))}
                            </AreaChart>
                        ) : (
                            <LineChart data={mockData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />}
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} hide />
                                <Tooltip />
                                {Object.entries(visibleLines).map(([key, visible]) => visible && (
                                    <Line
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stroke={lineColors[key as keyof typeof lineColors]}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                    />
                                ))}
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
