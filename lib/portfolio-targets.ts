export type PortfolioTargetProfile =
  | "intraday"
  | "one_month"
  | "six_month"
  | "one_year"
  | "custom";

export type PortfolioTargetMode = "system" | "manual";

export interface PortfolioTargetPreset {
  key: PortfolioTargetProfile;
  label: string;
  description: string;
  defaultReturnPct: number;
  minMultiplier?: number;
  maxMultiplier?: number;
}

export const PORTFOLIO_TARGET_PRESETS: PortfolioTargetPreset[] = [
  {
    key: "intraday",
    label: "Gun Ici",
    description: "Kisa trade akisi icin hizli kar alma hedefi.",
    defaultReturnPct: 1,
    minMultiplier: 0.8,
    maxMultiplier: 1.6,
  },
  {
    key: "one_month",
    label: "1 Ay",
    description: "Swing veya kisa vade pozisyonlar icin dengeli hedef.",
    defaultReturnPct: 5,
    minMultiplier: 0.75,
    maxMultiplier: 1.55,
  },
  {
    key: "six_month",
    label: "6 Ay",
    description: "Orta vadeli tasima icin daha sabirli hedef.",
    defaultReturnPct: 15,
    minMultiplier: 0.7,
    maxMultiplier: 1.6,
  },
  {
    key: "one_year",
    label: "1 Yil",
    description: "Uzun vade birikim ve trend takibi icin buyuk hedef.",
    defaultReturnPct: 45,
    minMultiplier: 0.65,
    maxMultiplier: 1.7,
  },
  {
    key: "custom",
    label: "Ozel",
    description: "Hedef yuzdesini hisse bazinda elle belirle.",
    defaultReturnPct: 10,
    minMultiplier: 0.75,
    maxMultiplier: 1.5,
  },
];

export const DEFAULT_PORTFOLIO_TARGET_PROFILE: PortfolioTargetProfile = "six_month";

export function getTargetPreset(
  key?: PortfolioTargetProfile | null
): PortfolioTargetPreset {
  return (
    PORTFOLIO_TARGET_PRESETS.find((preset) => preset.key === key) ||
    PORTFOLIO_TARGET_PRESETS.find(
      (preset) => preset.key === DEFAULT_PORTFOLIO_TARGET_PROFILE
    ) ||
    PORTFOLIO_TARGET_PRESETS[0]
  );
}

export function getDefaultTargetReturnPct(
  key?: PortfolioTargetProfile | null
): number {
  return getTargetPreset(key).defaultReturnPct;
}

export function resolveTargetReturnPct(
  key?: PortfolioTargetProfile | null,
  targetReturnPct?: number | null
): number {
  const numeric =
    typeof targetReturnPct === "number" && Number.isFinite(targetReturnPct)
      ? targetReturnPct
      : NaN;

  if (numeric > 0) {
    return numeric;
  }

  return getDefaultTargetReturnPct(key);
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

export function computeSystemTargetReturnPct(input: {
  profile?: PortfolioTargetProfile | null;
  tradeScore?: number | null;
  longScore?: number | null;
  firsatScore?: number | null;
  radarScore?: number | null;
  hakikiAlfaPct?: number | null;
}): number {
  const preset = getTargetPreset(input.profile);
  const base = preset.defaultReturnPct;
  const trade = Number.isFinite(input.tradeScore as number) ? Number(input.tradeScore) : 50;
  const long = Number.isFinite(input.longScore as number) ? Number(input.longScore) : 50;
  const firsat = Number.isFinite(input.firsatScore as number) ? Number(input.firsatScore) : 50;
  const radar = Number.isFinite(input.radarScore as number) ? Number(input.radarScore) : 50;
  const alfa = Number.isFinite(input.hakikiAlfaPct as number) ? Number(input.hakikiAlfaPct) : 0;

  const scoreMix = (trade * 0.4) + (long * 0.35) + (firsat * 0.15) + (radar * 0.1);
  const strength = (scoreMix - 50) / 50;
  const alphaBoost = clamp(alfa / 12, -0.2, 0.2);
  const multiplier = clamp(
    1 + (strength * 0.35) + alphaBoost,
    preset.minMultiplier || 0.75,
    preset.maxMultiplier || 1.5
  );

  return Math.round(base * multiplier * 10) / 10;
}

export function resolveTargetMode(input: {
  profile?: PortfolioTargetProfile | null;
  mode?: PortfolioTargetMode | null;
  targetReturnPct?: number | null;
}): PortfolioTargetMode {
  if (input.mode === "manual" || input.mode === "system") {
    return input.mode;
  }

  if (
    input.profile === "custom" &&
    typeof input.targetReturnPct === "number" &&
    Number.isFinite(input.targetReturnPct) &&
    input.targetReturnPct > 0
  ) {
    return "manual";
  }

  return "system";
}
