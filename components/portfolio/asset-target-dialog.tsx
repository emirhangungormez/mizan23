"use client";

import * as React from "react";
import { Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  computeSystemTargetReturnPct,
  PORTFOLIO_TARGET_PRESETS,
  getDefaultTargetReturnPct,
  resolveTargetReturnPct,
  resolveTargetMode,
  type PortfolioTargetMode,
  type PortfolioTargetProfile,
} from "@/lib/portfolio-targets";
import { usePortfolioAnalysis, usePortfolioStore, type PortfolioAsset } from "@/store/portfolio-store";

interface AssetTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId: string;
  asset: PortfolioAsset | null;
}

export function AssetTargetDialog({
  open,
  onOpenChange,
  portfolioId,
  asset,
}: AssetTargetDialogProps) {
  const analysis = usePortfolioAnalysis();
  const updateAssetSettings = usePortfolioStore((state) => state.updateAssetSettings);

  const [profile, setProfile] = React.useState<PortfolioTargetProfile>("six_month");
  const [mode, setMode] = React.useState<PortfolioTargetMode>("system");
  const [targetReturn, setTargetReturn] = React.useState("15");
  const [isSaving, setIsSaving] = React.useState(false);

  const currentDecision =
    asset && analysis?.holding_decisions
      ? analysis.holding_decisions.find((item) => item.symbol === asset.symbol) || null
      : null;

  React.useEffect(() => {
    if (!open || !asset) return;

    const nextProfile = asset.target_profile || "six_month";
    const nextMode = resolveTargetMode({
      profile: asset.target_profile,
      mode: asset.target_mode,
      targetReturnPct: asset.target_return_pct,
    });
    const nextTarget =
      nextMode === "manual"
        ? resolveTargetReturnPct(asset.target_profile, asset.target_return_pct)
        : currentDecision?.system_target_return_pct ||
          computeSystemTargetReturnPct({
            profile: nextProfile,
            tradeScore: currentDecision?.trade_skoru,
            longScore: currentDecision?.uzun_vade_skoru,
            firsatScore: currentDecision?.firsat_skoru,
            radarScore: currentDecision?.radar_skoru,
            hakikiAlfaPct: currentDecision?.hakiki_alfa_pct,
          });

    setProfile(nextProfile);
    setMode(nextMode);
    setTargetReturn(String(nextTarget));
  }, [asset, currentDecision, open]);

  const numericTarget = Number(targetReturn || 0);
  const safeManualTarget =
    Number.isFinite(numericTarget) && numericTarget > 0 ? numericTarget : 0;
  const systemTarget =
    currentDecision?.system_target_return_pct ||
    computeSystemTargetReturnPct({
      profile,
      tradeScore: currentDecision?.trade_skoru,
      longScore: currentDecision?.uzun_vade_skoru,
      firsatScore: currentDecision?.firsat_skoru,
      radarScore: currentDecision?.radar_skoru,
      hakikiAlfaPct: currentDecision?.hakiki_alfa_pct,
    });
  const presetSuggestions = React.useMemo(
    () =>
      Object.fromEntries(
        PORTFOLIO_TARGET_PRESETS.map((preset) => [
          preset.key,
          computeSystemTargetReturnPct({
            profile: preset.key,
            tradeScore: currentDecision?.trade_skoru,
            longScore: currentDecision?.uzun_vade_skoru,
            firsatScore: currentDecision?.firsat_skoru,
            radarScore: currentDecision?.radar_skoru,
            hakikiAlfaPct: currentDecision?.hakiki_alfa_pct,
          }),
        ])
      ) as Record<PortfolioTargetProfile, number>,
    [
      currentDecision?.firsat_skoru,
      currentDecision?.hakiki_alfa_pct,
      currentDecision?.radar_skoru,
      currentDecision?.trade_skoru,
      currentDecision?.uzun_vade_skoru,
    ]
  );
  const activeTarget = mode === "manual" ? safeManualTarget : systemTarget;
  const purchasePrice = asset?.avgPrice || asset?.avg_price || 0;
  const previewTargetPrice =
    purchasePrice > 0 && activeTarget > 0
      ? purchasePrice * (1 + activeTarget / 100)
      : 0;
  const isValid =
    !!asset &&
    (mode === "system" || safeManualTarget > 0);

  const handlePresetSelect = (nextProfile: PortfolioTargetProfile) => {
    setProfile(nextProfile);
    if (mode === "manual") {
      setTargetReturn(String(getDefaultTargetReturnPct(nextProfile)));
    } else {
      const nextSystem = computeSystemTargetReturnPct({
        profile: nextProfile,
        tradeScore: currentDecision?.trade_skoru,
        longScore: currentDecision?.uzun_vade_skoru,
        firsatScore: currentDecision?.firsat_skoru,
        radarScore: currentDecision?.radar_skoru,
        hakikiAlfaPct: currentDecision?.hakiki_alfa_pct,
      });
      setTargetReturn(String(nextSystem));
    }
  };

  const handleTargetChange = (value: string) => {
    setTargetReturn(value);
  };

  const handleModeChange = (nextMode: PortfolioTargetMode) => {
    setMode(nextMode);
    if (nextMode === "system") {
      setTargetReturn(String(systemTarget));
      return;
    }

    setTargetReturn(
      String(
        resolveTargetReturnPct(
          profile,
          currentDecision?.target_mode === "manual"
            ? currentDecision?.target_return_pct
            : asset?.target_return_pct
        )
      )
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!asset || !isValid) return;

    setIsSaving(true);
    const success = await updateAssetSettings(portfolioId, asset.symbol, {
      target_profile: profile,
      target_mode: mode,
      target_return_pct: mode === "manual" ? safeManualTarget : systemTarget,
    });
    if (success) {
      toast.success(`${asset.symbol} icin hedef plan guncellendi.`);
      onOpenChange(false);
    } else {
      toast.error("Hedef plani kaydedilemedi.");
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card p-0 shadow-none">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Target className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Hedef Plani
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                {asset?.symbol || "Varlik"} icin zaman ufku ve kar hedefi belirleyin.
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          <div className="grid gap-3 md:grid-cols-5">
            {PORTFOLIO_TARGET_PRESETS.map((preset) => {
              const active = profile === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetSelect(preset.key)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted/40"
                  )}
                >
                  <div className="text-sm font-semibold">{preset.label}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Baz: %{preset.defaultReturnPct}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-foreground/80">
                    Sistem: %{presetSuggestions[preset.key].toFixed(1)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => handleModeChange("system")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                mode === "system"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border bg-background hover:bg-muted/40"
              )}
            >
              <div className="text-sm font-semibold">Sistem Orani</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Sistem bu profil icin otomatik hedef belirlesin.
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("manual")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                mode === "manual"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border bg-background hover:bg-muted/40"
              )}
            >
              <div className="text-sm font-semibold">Ben Belirleyeyim</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Sistem oranini override et ama uyarisi gorunsun.
              </div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label htmlFor="target-return" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "manual" ? "Manuel Hedef Getiri" : "Sistem Hedefi"}
              </Label>
              <Input
                id="target-return"
                type="number"
                min="0.1"
                step="0.1"
                value={mode === "manual" ? targetReturn : String(systemTarget)}
                onChange={(event) => handleTargetChange(event.target.value)}
                disabled={mode === "system"}
                className="h-11 rounded-lg"
              />
              <div className="text-xs text-muted-foreground">
                {mode === "system"
                  ? "Bu oran sistem tarafindan skorlar ve profil yapisina gore otomatik uretildi."
                  : "Bu oran artik sistemin gercek hedefi degil; manuel override olarak saklanacak."}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Hedef Ozet
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Profil</div>
                  <div className="text-sm font-semibold">
                    {PORTFOLIO_TARGET_PRESETS.find((preset) => preset.key === profile)?.label || "Ozel"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sistem onerisi</div>
                  <div className="text-sm font-semibold tabular-nums">%{systemTarget.toFixed(1)}</div>
                </div>
                {mode === "manual" ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Aktif manuel hedef</div>
                    <div className="text-sm font-semibold tabular-nums">%{safeManualTarget.toFixed(1)}</div>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs text-muted-foreground">Ortalama maliyet</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {purchasePrice.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Hedef fiyat</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {previewTargetPrice.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={cn(
            "rounded-xl border p-4 text-sm",
            mode === "manual"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-900"
              : "border-border bg-primary/[0.04] text-muted-foreground"
          )}>
            {mode === "manual"
              ? `Manuel override aktif. Sistem bu profil icin %${systemTarget.toFixed(1)} oneriyor; kaydedecegin oran kullanici ayari olarak islenecek.`
              : currentDecision?.target_system_reason || "Bu hedef, sepet analizinde ana plan olarak kullanilir. Sistem hedefe yaklasma, hedefe ulasma ve skor zayiflama anlarinda farkli aksiyon onerileri uretir."}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Iptal
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving ? "Kaydediliyor..." : "Hedefi Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
