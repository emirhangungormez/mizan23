"use client";

import { Info } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FundamentalInfo {
    symbol?: string;
    currency?: string;
    market_cap?: number;
    marketCap?: number;
    pe_ratio?: number;
    trailingPE?: number;
    pb_ratio?: number;
    priceToBook?: number;
    free_float_ratio?: number;
    heldByPublic?: number;
    foreign_ratio?: number;
    dividend_yield?: number;
    dividendYield?: number;
    beta?: number;
    volume?: number;
    regularMarketVolume?: number;
}

interface FundamentalGridProps {
    info: FundamentalInfo | null | undefined;
    className?: string;
}

export function FundamentalGrid({ info, className }: FundamentalGridProps) {
    const currency = info?.currency || (info?.symbol?.includes('-USD') || (info?.symbol?.includes('.') && !info?.symbol?.endsWith('.IS')) ? "USD" : "TRY");
    const currencySign = currency === "USD" ? "$" : "₺";
    const currencyLabel = currency === "USD" ? "USD" : "TL";

    const formatValue = (val: number | undefined | null, type?: 'money' | 'percent' | 'number') => {
        if (val === undefined || val === null || val === 0) return "---";
        if (type === 'money') {
            if (val >= 1e9) return (val / 1e9).toFixed(2) + ` Mlr ${currencyLabel}`;
            if (val >= 1e6) return (val / 1e6).toFixed(2) + ` Mn ${currencyLabel}`;
            return `${currencySign}${val.toLocaleString(currency === 'USD' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 0 })}`;
        }
        if (type === 'percent') return "%" + val.toFixed(2);
        return val.toLocaleString(currency === 'USD' ? 'en-US' : 'tr-TR');
    };

    const metrics = [
        { label: "Piyasa Değeri", value: formatValue(info?.market_cap || info?.marketCap, 'money'), hint: "Şirketin toplam piyasa değeri" },
        { label: "F/K Oranı", value: formatValue(info?.pe_ratio || info?.trailingPE), hint: "Fiyat / Kazanç Oranı" },
        { label: "PD/DD", value: formatValue(info?.pb_ratio || info?.priceToBook), hint: "Piyasa Değeri / Defter Değeri" },
        { label: "Halka Açıklık", value: formatValue(info?.free_float_ratio || info?.heldByPublic, 'percent'), hint: "Halka açık pay oranı" },
        { label: "Yabancı Oranı", value: formatValue(info?.foreign_ratio, 'percent'), hint: "Yabancı yatırımcı takas oranı" },
        { label: "Temettü Verimi", value: formatValue(info?.dividend_yield ?? info?.dividendYield, 'percent'), hint: "Yıllık temettü verimi" },
        { label: "Beta", value: formatValue(info?.beta), hint: "Piyasaya göre oynaklık katsayısı" },
        { label: "Hacim (24s)", value: formatValue(info?.volume || info?.regularMarketVolume, 'money'), hint: "Son 24 saatlik işlem hacmi" },
    ];

    return (
        <section className={cn("bg-card border rounded-lg overflow-hidden", className)}>
            <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/20">
                <Info className="size-4 text-primary" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Temel Veriler & Finansal Ölçüler</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y border-t-0">
                {metrics.map((m, i) => (
                    <div key={i} className="p-4 flex flex-col gap-1 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">{m.label}</span>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Info className="size-3 text-muted-foreground/50" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="text-xs">{m.hint}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <p className="text-sm font-black font-mono tracking-tight">{m.value}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
