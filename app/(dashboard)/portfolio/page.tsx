"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatePortfolioModal } from "@/components/portfolio/create-portfolio-modal";
import { PortfolioList } from "@/components/portfolio/portfolio-list";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import { useDashboardStore } from "@/store/dashboard-store";
import { usePortfolioStore } from "@/store/portfolio-store";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { value: "1D", label: "Bugün", short: "1G" },
  { value: "1W", label: "Hafta", short: "1H" },
  { value: "1M", label: "Ay", short: "1A" },
  { value: "1Y", label: "Yıl", short: "1Y" },
  { value: "ALL", label: "Tümü", short: "T" },
] as const;

export default function PortfoliosPage() {
  const fetchPortfolios = usePortfolioStore((state) => state.fetchPortfolios);
  const setActivePortfolio = usePortfolioStore((state) => state.setActivePortfolio);
  const fetchDashboardData = useDashboardStore((state) => state.fetchDashboardData);
  const { selectedTimeframe, setSelectedTimeframe, displayCurrency, toggleCurrency } = usePerformanceCalculator();
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    fetchPortfolios();
    fetchDashboardData();
    setActivePortfolio("");
  }, [fetchDashboardData, fetchPortfolios, setActivePortfolio]);

  return (
    <div className="page-shell no-scrollbar overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center rounded-lg border bg-muted/30 p-1">
            <button
              onClick={() => displayCurrency !== "TRY" && toggleCurrency()}
              className={cn(
                "rounded-md px-3 py-1 text-[10px] font-medium transition-all",
                displayCurrency === "TRY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              TL
            </button>
            <button
              onClick={() => displayCurrency !== "USD" && toggleCurrency()}
              className={cn(
                "rounded-md px-3 py-1 text-[10px] font-medium transition-all",
                displayCurrency === "USD" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              USD
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PERIOD_OPTIONS.map((option) => {
              const isActive = selectedTimeframe === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedTimeframe(option.value as any)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                  aria-pressed={isActive}
                >
                  <span className="hidden sm:inline">{option.label}</span>
                  <span className="sm:hidden">{option.short}</span>
                </button>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="h-8 px-3 text-xs">
            <Plus className="size-3.5 mr-1.5" />
            Sepet Ekle
          </Button>
        </div>

        <PortfolioList />
      </div>

      <CreatePortfolioModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
