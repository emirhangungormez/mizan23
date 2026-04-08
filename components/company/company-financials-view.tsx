"use client";

import * as React from "react";
import {
    fetchCompanyFinancials,
    type BistProprietarySnapshot,
    type CompanyFinancials,
} from "@/lib/api-client";
import { CompanyInsights } from "@/components/company/company-insights";
import { QuarterlyChart, FinancialSummaryTable } from "@/components/company/financial-charts";
import { CompanyScoreCard } from "@/components/company/score-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart3, Building2, ChevronDown, ChevronUp, Target } from "lucide-react";
import { toast } from "sonner";

interface CompanyFinancialsViewProps {
    symbol: string;
    className?: string;
    currentPrice?: number;
    valuationSnapshot?: BistProprietarySnapshot["adil_deger"] | null;
    valuationScore?: number | null;
}

const EMPTY_DATA: CompanyFinancials = {
    profile: { symbol: "", name: "", description: "Veri yok", last_price: 0 },
    metrics: {
        income: {},
        previous_income: {},
        balance: {},
        previous_balance: {},
        ratios: {},
        multiples: {},
    },
    quarterly: {
        periods: [],
        revenue: [],
        gross_profit: [],
        operating_profit: [],
        net_profit: [],
        ebitda: [],
    },
    score: {
        profitability: 0,
        leverage: 0,
        liquidity: 0,
        overall: 0,
        grade: "N/A",
    },
    shareholders: [],
    subsidiaries: [],
};

const FAIR_VALUE_LABELS: Record<string, string> = {
    iskontolu: "Iskontolu",
    sismis: "Pahali",
    makul: "Makul",
    yetersiz_veri: "Veri Yok",
};

const FAIR_VALUE_METHOD_LABELS: Record<string, string> = {
    bank_book_value: "Banka PD/DD",
    bank_earnings: "Banka Kar",
    bank_pb_proxy: "Banka PD/DD Proxy",
    bank_pe_proxy: "Banka F/K Proxy",
    earnings: "Net Kar",
    book_value: "Defter Degeri",
    ev_ebitda: "EV/FAVOK",
    free_cashflow: "Serbest Nakit",
    earnings_proxy: "F/K Proxy",
    book_value_proxy: "PD/DD Proxy",
};

function formatMoney(value: number | null | undefined, currencySign: string, locale: string) {
    if (value === undefined || value === null || Number.isNaN(value)) return "---";
    return `${currencySign}${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
    if (value === undefined || value === null || Number.isNaN(value)) return "---";
    const sign = value > 0 ? "+" : "";
    return `${sign}%${value.toFixed(2)}`;
}

function formatCompactMoney(value: number | null | undefined, currencySign: string, unitBillion: string, unitMillion: string) {
    if (value === undefined || value === null || Number.isNaN(value)) return "---";
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} ${unitBillion} ${currencySign}`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} ${unitMillion} ${currencySign}`;
    return `${currencySign}${value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function mapBandLabel(value: string | null | undefined) {
    if (value === "guclu") return "Guclu";
    if (value === "tahmini") return "Tahmini";
    return "Yetersiz";
}

export function CompanyFinancialsView({
    symbol,
    className,
    currentPrice,
    valuationSnapshot,
    valuationScore,
}: CompanyFinancialsViewProps) {
    const [data, setData] = React.useState<CompanyFinancials | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const cacheKey = `financials_cache_${symbol}`;

            try {
                const result = await fetchCompanyFinancials(symbol);
                if (!result) throw new Error("Veri bos");

                setData(result);
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(result));
                } catch (error) {
                    console.warn("[CompanyFinancials] Cache save failed:", error);
                }
            } catch (error) {
                console.error("[CompanyFinancials] Fetch error:", error);

                try {
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        const parsed = JSON.parse(cached) as CompanyFinancials;
                        if (parsed && typeof parsed === "object" && "quarterly" in parsed && "metrics" in parsed) {
                            setData(parsed);
                            toast.warning("Sirket finansallari onbellekten gosteriliyor.");
                        } else {
                            setData({
                                ...EMPTY_DATA,
                                profile: { ...EMPTY_DATA.profile, symbol, name: symbol },
                            });
                        }
                    } else {
                        setData({
                            ...EMPTY_DATA,
                            profile: { ...EMPTY_DATA.profile, symbol, name: symbol },
                        });
                    }
                } catch {
                    setData({
                        ...EMPTY_DATA,
                        profile: { ...EMPTY_DATA.profile, symbol, name: symbol },
                    });
                }
            } finally {
                setIsLoading(false);
            }
        };

        void fetchData();
    }, [symbol]);

    if (isLoading) {
        return (
            <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-4", className)}>
                <Skeleton className="h-24 rounded-lg md:col-span-4" />
                <Skeleton className="h-96 rounded-lg md:col-span-1" />
                <Skeleton className="h-96 rounded-lg md:col-span-3" />
            </div>
        );
    }

    if (!data) return null;

    const { profile, metrics, quarterly, score } = data;
    const isUS = symbol.endsWith("-USD") || (symbol.includes(".") && !symbol.endsWith(".IS"));
    const currencySign = isUS ? "$" : "₺";
    const currencyLabel = isUS ? "USD" : "TL";
    const unitBillion = isUS ? "B" : "Mlr";
    const unitMillion = isUS ? "M" : "Mn";
    const locale = isUS ? "en-US" : "tr-TR";

    const actualPrice = currentPrice ?? profile.last_price ?? null;
    const fairValuePrice = valuationSnapshot?.fair_value_price ?? null;
    const fairValueMarketCap = valuationSnapshot?.fair_value_market_cap ?? null;
    const premiumDiscountPct = valuationSnapshot?.premium_discount_pct ?? null;
    const valuationConfidence = valuationSnapshot?.confidence ?? null;
    const valuationLabel = FAIR_VALUE_LABELS[String(valuationSnapshot?.fair_value_label ?? "yetersiz_veri")] ?? "Veri Yok";
    const valuationComponents = Array.isArray(valuationSnapshot?.components) ? valuationSnapshot.components : [];
    const valuationHasRealData = fairValuePrice !== null;

    const valuationTone =
        valuationSnapshot?.fair_value_label === "iskontolu"
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
            : valuationSnapshot?.fair_value_label === "sismis"
                ? "border-rose-500/25 bg-rose-500/10 text-rose-700"
                : "border-sky-500/25 bg-sky-500/10 text-sky-700";
    const hasQuarterlyData = [quarterly.revenue, quarterly.ebitda, quarterly.net_profit]
        .some((series) => Array.isArray(series) && series.some((value) => Math.abs(Number(value || 0)) > 0));
    const hasIncomeSummaryData = [
        metrics.income?.revenue,
        metrics.income?.gross_profit,
        metrics.income?.operating_profit,
        metrics.income?.net_profit,
    ].some((value) => value !== undefined && value !== null && Math.abs(Number(value)) > 0);
    const hasBalanceSummaryData = [
        metrics.balance?.current_assets,
        metrics.balance?.non_current_assets,
        metrics.balance?.total_assets,
        metrics.balance?.equity,
        metrics.balance?.net_debt,
    ].some((value) => value !== undefined && value !== null && Math.abs(Number(value)) > 0);
    const hasFinancialScore =
        (score?.overall ?? 0) > 0
        || (score?.profitability ?? 0) > 0
        || (score?.leverage ?? 0) > 0
        || (score?.liquidity ?? 0) > 0
        || (score?.grade && score.grade !== "N/A");
    const hasDescription = Boolean(profile.description && profile.description.trim() && profile.description !== "Veri yok");

    return (
        <div className={cn("space-y-6", className)}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-1">
                    <div className="rounded-xl border bg-card p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-sm font-bold">
                                <Target className="size-4 text-emerald-500" />
                                Adil Deger Motoru
                            </h3>
                            {valuationHasRealData ? (
                                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", valuationTone)}>
                                    {valuationLabel}
                                </span>
                            ) : (
                                <span className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    Veri Yok
                                </span>
                            )}
                        </div>

                        {valuationHasRealData ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <MetricCard label="Guncel Fiyat" value={formatMoney(actualPrice, currencySign, locale)} />
                                    <MetricCard label="Adil Deger" value={formatMoney(fairValuePrice, currencySign, locale)} />
                                    <MetricCard
                                        label="Fiyat Farki"
                                        value={formatPercent(premiumDiscountPct)}
                                        tone={
                                            (premiumDiscountPct ?? 0) > 0
                                                ? "text-emerald-600"
                                                : (premiumDiscountPct ?? 0) < 0
                                                    ? "text-rose-600"
                                                    : undefined
                                        }
                                    />
                                    <MetricCard
                                        label="Skor / Guven"
                                        value={`${valuationScore != null ? Math.round(valuationScore) : "--"} / ${valuationConfidence != null ? Math.round(valuationConfidence) : "--"}`}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                                    <InfoPill label="Veri Bandi" value={mapBandLabel(valuationSnapshot?.fair_value_data_band)} />
                                    <InfoPill label="Guven Bandi" value={mapBandLabel(valuationSnapshot?.fair_value_confidence_band)} />
                                    <InfoPill label="Sektor Ailesi" value={String(valuationSnapshot?.sector_family ?? "genel")} />
                                    <InfoPill
                                        label="Buyume Izi"
                                        value={valuationSnapshot?.growth_score != null ? `${Math.round(valuationSnapshot.growth_score)}/100` : "--"}
                                    />
                                </div>

                                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Hedef Piyasa Degeri</p>
                                    <p className="mt-2 text-sm font-semibold text-foreground">
                                        {formatCompactMoney(fairValueMarketCap, currencySign, unitBillion, unitMillion)}
                                    </p>
                                </div>

                                {valuationComponents.length > 0 && (
                                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Model Bilesenleri</p>
                                        <div className="mt-3 space-y-2">
                                            {valuationComponents.map((component, index) => (
                                                <div key={`${component.method}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                                                    <span className="font-medium text-foreground">
                                                        {FAIR_VALUE_METHOD_LABELS[component.method] ?? component.method}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        %{Math.round(component.weight * 100)} • x{component.multiple.toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="text-[10px] leading-5 text-muted-foreground">
                                    Bu alan placeholder degil. Degerleme, proprietary motorun urettigi gercek `adil_deger`
                                    verisini kullaniyor; net kar, ozsermaye, EV/FAVOK, serbest nakit ve sektor carpani
                                    bilesenleri dinamik agirliklarla birlestiriliyor.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                                Bu hisse icin su anda guvenilir proprietary adil deger verisi uretilmemis. Placeholder
                                bant gostermek yerine alani bos birakiyoruz.
                            </div>
                        )}
                    </div>

                    {hasFinancialScore && <CompanyScoreCard score={score} />}
                </div>

                <div className="space-y-6 lg:col-span-2">
                    {!isUS && <CompanyInsights symbol={symbol} />}

                    {hasQuarterlyData && (
                        <div className="rounded-xl border bg-card p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-bold">
                                    <BarChart3 className="size-4 text-primary" />
                                    Finansal Trendler
                                </h3>
                            </div>
                            <div className="grid h-[180px] grid-cols-1 gap-4 md:grid-cols-3">
                                <QuarterlyChart
                                    title="Satislar"
                                    data={quarterly.revenue?.map((value) => value / 1e9) || []}
                                    periods={quarterly.periods || []}
                                    color="#3b82f6"
                                    unit={`${unitBillion} ${currencySign}`}
                                />
                                <QuarterlyChart
                                    title="FAVOK"
                                    data={quarterly.ebitda?.map((value) => value / 1e9) || []}
                                    periods={quarterly.periods || []}
                                    color="#10b981"
                                    unit={`${unitBillion} ${currencySign}`}
                                />
                                <QuarterlyChart
                                    title="Net Kar"
                                    data={quarterly.net_profit?.map((value) => value / 1e9) || []}
                                    periods={quarterly.periods || []}
                                    color="#f59e0b"
                                    unit={`${unitBillion} ${currencySign}`}
                                />
                            </div>
                        </div>
                    )}

                    {(hasIncomeSummaryData || hasBalanceSummaryData) && (
                        <div className="rounded-xl border bg-card overflow-hidden">
                            <div className="flex items-center justify-between p-5 pb-2">
                                <h3 className="flex items-center gap-2 text-sm font-bold">
                                    <BarChart3 className="size-4 text-primary" />
                                    Ozet Finansal Tablo
                                </h3>
                                <span className="text-[10px] text-muted-foreground">Son 4 donem</span>
                            </div>
                            <div className="overflow-x-auto p-2">
                                <FinancialSummaryTable
                                    incomeData={metrics.income || {}}
                                    balanceData={metrics.balance}
                                    previousIncomeData={metrics.previous_income}
                                    previousBalanceData={metrics.previous_balance}
                                    unitLabel={`${unitBillion} ${currencyLabel}`}
                                />
                            </div>
                        </div>
                    )}

                    {hasDescription && (
                        <div className="rounded-xl border bg-card p-5">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-bold">
                                    <Building2 className="size-4 text-primary" />
                                    Sirket Bilgileri
                                </h3>
                            </div>
                            <CompanyDescription description={profile.description || "Veri yok"} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-lg font-bold", tone)}>{value}</p>
        </div>
    );
}

function InfoPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
            {label}: <span className="font-semibold text-foreground">{value}</span>
        </div>
    );
}

function CompanyDescription({ description, className }: { description: string; className?: string }) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const shouldTruncate = (description?.length || 0) > 400;

    return (
        <div className={cn("relative text-xs leading-relaxed text-muted-foreground", className)}>
            <p className={cn("transition-all duration-500", !isExpanded && shouldTruncate && "line-clamp-[8] mask-linear-fade")}>
                {description || "Sirket aciklamasi bulunamadi."}
            </p>
            {shouldTruncate && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-auto p-0 text-xs font-medium text-primary hover:bg-transparent hover:text-primary/80"
                    onClick={() => setIsExpanded((current) => !current)}
                >
                    {isExpanded ? (
                        <span className="flex items-center gap-1">Daha az <ChevronUp className="size-3" /></span>
                    ) : (
                        <span className="flex items-center gap-1">Devamini oku <ChevronDown className="size-3" /></span>
                    )}
                </Button>
            )}
        </div>
    );
}
