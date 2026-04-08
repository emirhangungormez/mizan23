"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
    Building2,
    Globe,
    TrendingUp,
    TrendingDown,
    Minus,
    DollarSign,
    BarChart3,
    PieChart,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
} from "lucide-react";

interface CompanyProfile {
    symbol: string;
    name: string;
    sector?: string;
    industry?: string;
    description?: string;
    website?: string;
    last_price?: number;
    change_percent?: number;
    market_cap?: number;
    fifty_two_week_high?: number;
    fifty_two_week_low?: number;
}

interface CompanyMultiples {
    pe_ratio?: number;
    pb_ratio?: number;
    ev_ebitda?: number;
    dividend_yield?: number;
    market_cap?: number;
}

interface CompanyScore {
    profitability: number;
    leverage: number;
    liquidity: number;
    overall: number;
    grade: string;
}

interface CompanySidebarProps {
    profile: CompanyProfile;
    multiples?: CompanyMultiples;
    score?: CompanyScore;
    className?: string;
}

function formatLargeNumber(num: number | undefined): string {
    if (!num) return "-";
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)} T₺`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)} Mr₺`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)} Mn₺`;
    return num.toLocaleString("tr-TR");
}

function MetricRow({
    label,
    value,
    valueColor,
}: {
    label: string;
    value: React.ReactNode;
    valueColor?: string;
}) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={cn("text-sm font-mono font-medium", valueColor)}>
                {value ?? "-"}
            </span>
        </div>
    );
}



export function CompanySidebar({ profile, multiples, score, className }: CompanySidebarProps) {
    const isPositive = (profile.change_percent ?? 0) > 0;
    const isNegative = (profile.change_percent ?? 0) < 0;

    const isUS = profile.symbol.endsWith("-USD") || (profile.symbol.includes(".") && !profile.symbol.endsWith(".IS"));
    const currencySign = isUS ? "$" : "₺";
    const locale = isUS ? "en-US" : "tr-TR";

    const formatLargeNumber = (num: number | undefined): string => {
        if (!num) return "-";
        if (isUS) {
            if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
            if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
            if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
            return `$${num.toLocaleString("en-US")}`;
        }
        if (num >= 1e12) return `${(num / 1e12).toFixed(2)} T₺`;
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)} Mr₺`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)} Mn₺`;
        return `${num.toLocaleString("tr-TR")} ₺`;
    };

    return (
        <div className={cn("bg-card border rounded-lg overflow-hidden", className)}>
            {/* Header - Company Name & Price */}
            <div className="p-4 border-b bg-gradient-to-br from-primary/5 to-transparent">
                <div className="flex items-start gap-3">
                    <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {profile.symbol.substring(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-lg truncate">{profile.symbol}</h2>
                        <p className="text-xs text-muted-foreground truncate">{profile.name}</p>
                    </div>
                </div>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-3">
                    <span className="text-2xl font-bold font-mono">
                        {currencySign}{profile.last_price?.toLocaleString(locale, { minimumFractionDigits: 2 }) ?? "-"}
                    </span>
                    <div
                        className={cn(
                            "flex items-center gap-0.5 px-2 py-0.5 rounded text-sm font-bold",
                            isPositive && "text-emerald-500 bg-emerald-500/10",
                            isNegative && "text-red-500 bg-red-500/10",
                            !isPositive && !isNegative && "text-muted-foreground bg-muted/50"
                        )}
                    >
                        {isPositive && <ArrowUpRight className="size-4" />}
                        {isNegative && <ArrowDownRight className="size-4" />}
                        {!isPositive && !isNegative && <Minus className="size-4" />}
                        %{Math.abs(profile.change_percent ?? 0).toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Company Info */}
            <div className="p-4 border-b">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Şirket Bilgileri
                </h3>
                <div className="space-y-0.5">
                    <MetricRow label="Sektör" value={profile.sector} />
                    <MetricRow label="Endüstri" value={profile.industry} />
                    {profile.website && (
                        <MetricRow
                            label="Website"
                            value={
                                <a
                                    href={`https://${profile.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    {profile.website.replace("www.", "")}
                                </a>
                            }
                        />
                    )}
                </div>
            </div>

            {/* Market Multiples */}
            {multiples && (
                <div className="p-4 border-b">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Çarpanlar
                    </h3>
                    <div className="space-y-0.5">
                        <MetricRow label="Piyasa Değeri" value={formatLargeNumber(multiples.market_cap)} />
                        <MetricRow label="F/K Oranı" value={multiples.pe_ratio?.toFixed(2)} />
                        <MetricRow label="PD/DD" value={multiples.pb_ratio?.toFixed(2)} />
                        <MetricRow label="FD/FAVÖK" value={multiples.ev_ebitda?.toFixed(2)} />
                        {multiples.dividend_yield && (
                            <MetricRow
                                label="Temettü Verimi"
                                value={`%${multiples.dividend_yield.toFixed(2)}`}
                                valueColor="text-emerald-500"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* 52 Week Range */}
            <div className="p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    52 Haftalık Aralık
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-red-500">
                        {currencySign}{profile.fifty_two_week_low?.toLocaleString(locale, { minimumFractionDigits: 2 }) ?? "-"}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        {profile.last_price && profile.fifty_two_week_high && profile.fifty_two_week_low && (
                            <div
                                className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full relative"
                                style={{
                                    width: `${Math.min(
                                        100,
                                        ((profile.last_price - profile.fifty_two_week_low) /
                                            (profile.fifty_two_week_high - profile.fifty_two_week_low)) *
                                        100
                                    )}%`,
                                }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 size-2.5 bg-white border-2 border-primary rounded-full" />
                            </div>
                        )}
                    </div>
                    <span className="text-xs font-mono text-emerald-500">
                        {currencySign}{profile.fifty_two_week_high?.toLocaleString(locale, { minimumFractionDigits: 2 }) ?? "-"}
                    </span>
                </div>
            </div>
        </div>
    );
}
