/** Pure helpers for the Comparables Map: outcome classes, axis presets, value lookup. */
import type { CompanyInput } from "./scoring";
import type { HistoricalCompany, NeighborSummary } from "./comparables";

export type Outcome = "stayA" | "reachB" | "reachC" | "unicorn" | "unobserved";
export const OUTCOMES: Outcome[] = ["stayA", "reachB", "reachC", "unicorn", "unobserved"];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  stayA: "Stayed at Series A",
  reachB: "Reached Series B",
  reachC: "Reached Series C+",
  unicorn: "Unicorn within 5 years",
  unobserved: "Outcome not yet observable",
};

/** Map color class. Unicorn within 5y wins; otherwise stage5y, falling back to stage3y. */
export function outcomeOf(c: Pick<HistoricalCompany, "unicorn" | "stage3y" | "stage5y">): Outcome {
  if (c.unicorn === "within_5y") return "unicorn";
  const s = c.stage5y ?? c.stage3y;
  if (s === null) return "unobserved";
  return s === 0 ? "stayA" : s === 1 ? "reachB" : "reachC";
}

export type Plottable = CompanyInput & { stageScore: number; unicornScore: number };
export type AxisScale = "linear" | "log" | "symlog";
export interface Axis {
  label: string;
  scale: AxisScale;
  value: (c: Plottable) => number | null;
  format: "pct" | "usd" | "num" | "years";
}
export interface Preset {
  name: string;
  x: Axis;
  y: Axis;
}

const posOrNull = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
const nonNeg = (v: number | null) => (v !== null && Number.isFinite(v) && v >= 0 ? v : null);

const A_SIZE: Axis = { label: "Series A size", scale: "log", value: (c) => posOrNull(c.seriesAAmountUsd), format: "usd" };

export const PRESETS: Preset[] = [
  {
    name: "Model scores",
    x: { label: "Likelihood of raising Series B within 3 years", scale: "linear", value: (c) => c.stageScore, format: "pct" },
    y: { label: "Unicorn score", scale: "log", value: (c) => posOrNull(c.unicornScore), format: "pct" },
  },
  {
    name: "A size vs age",
    x: A_SIZE,
    y: { label: "Company age at Series A (years)", scale: "linear", value: (c) => (nonNeg(c.ageMonthsAtA) === null ? null : c.ageMonthsAtA! / 12), format: "years" },
  },
  {
    name: "A size vs investors",
    x: A_SIZE,
    y: { label: "Number of Series A investors", scale: "linear", value: (c) => posOrNull(c.seriesAInvestorCount), format: "num" },
  },
  {
    name: "Prior equity vs months to A",
    x: { label: "Equity raised before Series A", scale: "symlog", value: (c) => nonNeg(c.priorEquityUsd), format: "usd" },
    y: { label: "Months from first funding to Series A", scale: "linear", value: (c) => nonNeg(c.monthsFirstFundingToA), format: "num" },
  },
];

export function formatValue(v: number, f: Axis["format"]): string {
  if (f === "pct") return v < 0.01 ? `${(v * 100).toFixed(2)}%` : `${(v * 100).toFixed(0)}%`;
  if (f === "usd") return formatUsd(v);
  if (f === "years") return `${+v.toFixed(1)}y`;
  return `${+v.toFixed(1)}`;
}

export function formatUsd(v: number | null): string {
  if (v === null) return "unknown";
  if (v >= 1e9) return `$${+(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${+(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${+(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function stageLabel(s: 0 | 1 | 2 | null): string {
  return s === null ? "not yet observable" : s === 0 ? "Stayed at Series A" : s === 1 ? "Series B" : "Series C or later";
}

/** Similarity bar width: 1 − distance relative to the farthest (25th) neighbour. */
export function similarity(distance: number, maxDistance: number): number {
  return maxDistance > 0 ? Math.max(0, 1 - distance / maxDistance) : 1;
}

/** Share of a category's companies (observed 3y window) that stayed at A / reached B / reached C+. */
export function categoryStageAverage(all: HistoricalCompany[], category: string): NeighborSummary["stage3y"] {
  const obs = all.filter((c) => c.category === category && c.stage3y !== null);
  return {
    observed: obs.length,
    stayA: obs.filter((c) => c.stage3y === 0).length,
    reachB: obs.filter((c) => c.stage3y === 1).length,
    reachC: obs.filter((c) => c.stage3y === 2).length,
  };
}
