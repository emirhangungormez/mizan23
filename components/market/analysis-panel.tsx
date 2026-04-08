"use client";

import { Progress } from "@/components/ui/progress";
import { Activity, Zap, TrendingUp, ShieldAlert } from "lucide-react";

interface AnalysisPanelProps {
    scores: {
        momentum: number;
        volatility: number;
        trend_strength: number;
        risk_score: number;
    };
}

export function AnalysisPanel({ scores }: AnalysisPanelProps) {
    const items = [
        { label: "Yukarı Eğilim (Momentum)", value: scores.momentum, icon: Activity, color: "text-blue-500", desc: "Fiyatın son dönemdeki hızı" },
        { label: "Dalgalı Piyasa (Volatilite)", value: scores.volatility, icon: Zap, color: "text-amber-500", desc: "Fiyat hareketlerindeki oynaklık" },
        { label: "Trend Gücü", value: scores.trend_strength, icon: TrendingUp, color: "text-emerald-500", desc: "Mevcut yönün kararlılığı" },
        { label: "Risk Skoru", value: scores.risk_score, icon: ShieldAlert, color: "text-red-500", desc: "Olası kayıp riski seviyesi" },
    ];

    return (
        <div className="bg-card border rounded-lg overflow-hidden h-full">
            <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/20">
                <Activity className="size-4 text-primary" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Tek Bakışta Teknik Analiz</h3>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {items.map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <item.icon className={item.color + " size-4"} />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold leading-none">{item.label}</span>
                                    <span className="text-[9px] text-muted-foreground">{item.desc}</span>
                                </div>
                            </div>
                            <span className="text-sm font-black font-mono">{item.value}%</span>
                        </div>
                        <Progress value={item.value} className="h-1.5" />
                    </div>
                ))}
            </div>
        </div>
    );
}
