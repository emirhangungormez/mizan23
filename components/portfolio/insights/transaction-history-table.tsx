"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { History, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolio-store";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";

export default function TransactionHistoryTable() {
    const { portfolios, activePortfolioId } = usePortfolioStore();
    const activePortfolio = portfolios.find(p => p.id === activePortfolioId);
    const transactions = activePortfolio?.transactions || [];

    const {
        displayCurrency,
        normalizeToTRY,
        convertToDisplay
    } = usePerformanceCalculator(activePortfolio ? [activePortfolio] : []);

    const currencySymbol = displayCurrency === 'USD' ? '$' : '₺';
    const locale = displayCurrency === 'USD' ? 'en-US' : 'tr-TR';
    const getTxTimestamp = React.useCallback((value?: string) => (value ? new Date(value).getTime() : 0), []);

    // Sort transactions by sell date descending
    const sortedTransactions = React.useMemo(() => {
        return [...transactions].sort((a, b) =>
            getTxTimestamp(b.sell_date) - getTxTimestamp(a.sell_date)
        );
    }, [getTxTimestamp, transactions]);

    if (!activePortfolio || transactions.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col min-h-[200px] mt-6">
                <div className="px-6 py-4 border-b border-border flex items-center gap-4 bg-muted/5">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                        <History className="size-4" />
                    </div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Geçmiş İşlemler</h3>
                </div>
                <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground/60 text-xs font-medium uppercase tracking-widest">
                    Henüz gerçekleşmiş bir işlem yok.
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col mt-6">
            <div className="px-6 py-4 border-b border-border flex items-center gap-4 bg-muted/5">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                    <History className="size-4" />
                </div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Geçmiş İşlemler</h3>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th className="py-4 px-6 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Varlık</th>
                            <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Alım/Satım Tarihi</th>
                            <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Miktar</th>
                            <th className="py-4 px-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Alış/Satış Fiyatı</th>
                            <th className="py-4 px-6 text-[10px] font-medium text-muted-foreground uppercase tracking-widest text-right">Kar / Zarar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sortedTransactions.map((tx) => {
                            const realizedProfit = tx.profit_loss || 0;
                            const isProfit = realizedProfit >= 0;
                            // Assuming tx values are in their original currency. We display them as recorded.
                            // But we might want to respect displayCurrency if needed. 
                            // For history, it's better to show recorded values usually, but let's stick to displayCurrency logic if possible or just show recorded symbol.
                            const txCurrencySymbol = tx.currency === 'USD' ? '$' : tx.currency === 'EUR' ? '€' : '₺';

                            return (
                                <tr key={tx.id} className="hover:bg-muted/5 transition-colors cursor-default">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded bg-muted flex items-center justify-center font-medium text-[10px] text-muted-foreground">
                                                {tx.symbol.substring(0, 2)}
                                            </div>
                                            <span className="text-[13px] font-medium tracking-tight">{tx.symbol}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <div className="size-1.5 rounded-full bg-rose-500" />
                                                <span className="text-[11px] font-medium text-foreground tabular-nums">
                                                    {tx.sell_date ? new Date(tx.sell_date).toLocaleDateString(locale) : '-'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 opacity-60">
                                                <div className="size-1.5 rounded-full bg-emerald-500" />
                                                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                                    {tx.buy_date ? new Date(tx.buy_date).toLocaleDateString(locale) : '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                            {tx.quantity}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-bold text-foreground/90 tabular-nums">
                                                {txCurrencySymbol}{(tx.sell_price || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                                Mly: {txCurrencySymbol}{(tx.buy_price || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <div className={cn(
                                            "flex flex-col items-end gap-0.5 font-bold tabular-nums",
                                            isProfit ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            <div className="flex items-center gap-1 text-[11px]">
                                                {isProfit ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                                %{Math.abs(tx.profit_loss_pct || 0).toFixed(2)}
                                            </div>
                                            <span className="text-[10px] opacity-80">
                                                {isProfit ? "+" : "-"}{txCurrencySymbol}{Math.abs(realizedProfit).toLocaleString(locale, { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
