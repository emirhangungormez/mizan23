"use client";

import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw, Moon, Sun, Clock } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { checkEngineHealth } from "@/lib/api-client";
import { QuickSearch } from "@/components/dashboard/quick-search";

type RefreshNotice = {
  tone: "muted" | "success" | "warning";
  text: string;
};

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 rounded-md"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Temayi degistir</span>
    </Button>
  );
}

export function DashboardHeader() {
  const {
    triggerRefresh,
    isLoadingDashboard,
    isLoadingAssetAnalysis,
    lastUpdated,
    fetchDashboardData,
  } = useDashboardStore();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  const [engineStatus, setEngineStatus] = React.useState<"good" | "bad" | "checking">("checking");
  const [latency, setLatency] = React.useState<number | null>(null);
  const [refreshNotice, setRefreshNotice] = React.useState<RefreshNotice | null>(null);
  const refreshNoticeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshing = isLoadingDashboard || isLoadingAssetAnalysis;

  const pageLabel = !mounted
    ? "Yukleniyor..."
    : pathname.includes("/market")
      ? "Varlik Detayi"
      : pathname.includes("/portfolio")
        ? "Sepet Yonetimi"
        : "Anasayfa";

  const showRefreshNotice = React.useCallback((notice: RefreshNotice, durationMs = 4500) => {
    if (refreshNoticeTimeoutRef.current) {
      clearTimeout(refreshNoticeTimeoutRef.current);
    }

    setRefreshNotice(notice);
    refreshNoticeTimeoutRef.current = setTimeout(() => {
      setRefreshNotice(null);
      refreshNoticeTimeoutRef.current = null;
    }, durationMs);
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    return () => {
      if (refreshNoticeTimeoutRef.current) {
        clearTimeout(refreshNoticeTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    const checkHealth = async () => {
      const start = Date.now();
      const health = await checkEngineHealth();
      setLatency(Date.now() - start);
      setEngineStatus(health.healthy ? "good" : "bad");
    };

    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    const start = Date.now();
    showRefreshNotice(
      { tone: "muted", text: "Yenileme baslatildi, dashboard ve analizler tazeleniyor." },
      6000,
    );

    try {
      triggerRefresh();
      await fetchDashboardData();

      const health = await checkEngineHealth();
      const elapsed = Date.now() - start;

      setLatency(elapsed);
      setEngineStatus(health.healthy ? "good" : "bad");

      showRefreshNotice({
        tone: health.healthy ? "success" : "warning",
        text: health.healthy
          ? `Dashboard guncellendi, analizler arka planda yenileniyor. (${elapsed}ms)`
          : `Dashboard guncellendi ama engine yaniti zayif. (${elapsed}ms)`,
      });
    } catch (error) {
      setEngineStatus("bad");
      showRefreshNotice(
        {
          tone: "warning",
          text:
            error instanceof Error
              ? `Yenileme sirasinda hata olustu: ${error.message}`
              : "Yenileme sirasinda bir hata olustu.",
        },
        7000,
      );
    }
  };

  return (
    <header className="px-4 py-3 sm:px-6 border-b bg-card sticky top-0 z-10 w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2" />

          <div className="hidden sm:flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" />
            <span className="text-sm font-medium">{pageLabel}</span>
          </div>

          <div className="ml-2">
            <QuickSearch />
          </div>

          <div className="hidden lg:flex items-center gap-2 ml-2 text-xs text-muted-foreground relative group">
            <Clock className="size-3" />
            <span>
              {mounted
                ? new Date().toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" })
                : "---"}
            </span>
            <span className="font-mono">
              {mounted && lastUpdated ? new Date(lastUpdated).toLocaleTimeString("tr-TR") : "--:--:--"}
            </span>
            {refreshNotice ? (
              <span
                className={cn(
                  "max-w-[240px] truncate text-[11px]",
                  refreshNotice.tone === "success" && "text-emerald-600",
                  refreshNotice.tone === "warning" && "text-amber-600",
                  refreshNotice.tone === "muted" && "text-muted-foreground",
                )}
                title={refreshNotice.text}
              >
                {refreshNotice.text}
              </span>
            ) : null}
            <div className="relative flex items-center justify-center ml-2 size-2">
              {engineStatus === "good" ? (
                <div className="absolute size-full rounded-full bg-emerald-500/40 animate-ping" />
              ) : null}
              <div
                className={cn(
                  "size-full rounded-full relative z-10 cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.3)]",
                  engineStatus === "good"
                    ? "bg-emerald-500 animate-pulse"
                    : engineStatus === "bad"
                      ? "bg-red-500"
                      : "bg-yellow-500 animate-pulse",
                )}
              />
            </div>
            <div className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 px-3 py-2 bg-popover border rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap text-xs">
              <div className="font-medium mb-1">
                {engineStatus === "good"
                  ? "Sistem aktif"
                  : engineStatus === "bad"
                    ? "Baglanti sorunu"
                    : "Kontrol ediliyor..."}
              </div>
              <div className="text-muted-foreground">Gecikme: {latency ? `${latency}ms` : "---"}</div>
              <div className="text-muted-foreground">
                Son guncelleme: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString("tr-TR") : "---"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-2 px-2 py-1 bg-muted/50 rounded text-xs">
            <span className="text-muted-foreground">Sistem</span>
            <span
              className={cn(
                "font-mono",
                latency && latency < 500
                  ? "text-emerald-500"
                  : latency && latency < 2000
                    ? "text-yellow-500"
                    : "text-muted-foreground",
              )}
            >
              {latency ? `${latency}ms` : "..."}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!mounted || isRefreshing}
            className="h-8 gap-1.5 text-xs font-bold border-border/50 hover:bg-muted transition-all"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">YENILE</span>
          </Button>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
