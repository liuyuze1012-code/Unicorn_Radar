/**
 * Series A Radar scoring.
 *
 * Runs the pre-trained logistic regression models (trained in Python on 5,819
 * U.S. Series A companies, 2005-2013) entirely in the browser. Deterministic:
 * the same input always gives the same output. No AI is involved here.
 *
 * Model files live in src/model/ and are produced by unicorn-predictor/ml/export_web.py.
 * src/lib/scoring.test.ts checks these results against the Python model exactly.
 */
import stage3yJson from "@/model/stage_3y.json";
import stage5yJson from "@/model/stage_5y.json";
import unicornJson from "@/model/unicorn.json";
import referenceJson from "@/model/reference.json";

// ---------- public types ----------

export const CATEGORIES = ["B2B software", "B2C software", "Hardware", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Facts known at the company's first Series A. `null` means unknown. */
export interface CompanyInput {
  category: Category;
  seriesAAmountUsd: number | null;
  /** Total equity (angel/seed/other) raised before the Series A. Unknown is treated as 0, as in training. */
  priorEquityUsd: number | null;
  /** Number of equity rounds before the Series A. Unknown is treated as 0, as in training. */
  priorRounds: number | null;
  /** Months from the first recorded funding round to the Series A. Unknown is treated as 0 (Series A was the first round). */
  monthsFirstFundingToA: number | null;
  ageMonthsAtA: number | null;
  seriesAInvestorCount: number | null;
  /** U.S. state code, e.g. "CA". */
  hqState: string | null;
}

export interface Driver {
  feature: string;
  label: string;
  /** Contribution to the log-odds (weight x standardized value). Positive raises the score. */
  contribution: number;
}

export interface StageForecast {
  horizonYears: number;
  stayA: number;
  reachB: number; // reaches exactly Series B
  reachC: number; // reaches Series C or later
  reachBOrLater: number;
  baseRates: { stayA: number; reachB: number; reachC: number };
  drivers: Driver[];
}

export interface UnicornForecast {
  probability: number;
  /** 5th-95th percentile across bootstrap refits of the model. */
  range: { low: number; high: number };
  baseRate: number;
  multipleOfBaseRate: number;
  multipleRange: { low: number; high: number };
  drivers: Driver[];
}

export interface Scorecard {
  modelVersion: string;
  stage3y: StageForecast;
  stage5y: StageForecast;
  unicorn: UnicornForecast;
  /** Share of historical companies in the same category ranked below this one (0-100). */
  percentile: { stage3yReachB: number; unicorn: number; cohortSize: number; category: Category };
  inputsProvided: number;
  inputsTotal: number;
  missingInputs: string[];
}

// ---------- model file types ----------

interface Prep {
  features: string[];
  columns: string[];
  impute_median: Record<string, number>;
  missing_flag_cols: string[];
  mean: number[];
  std: number[];
}
interface Linear {
  intercept: number;
  coef: number[];
}
interface StageModel {
  version: string;
  horizon_years: number;
  prep: Prep;
  reach_b: Linear;
  reach_c: Linear;
  base_rates: { stay_a: number; reach_b: number; reach_c: number };
}
interface UnicornModel extends Linear {
  version: string;
  base_rate: number;
  prep: Prep;
  bootstrap: (Linear & { median: number[]; mean: number[]; std: number[] })[];
}
interface Reference {
  stage_3y_reach_b: Record<string, { n: number; percentiles: number[] }>;
  unicorn: Record<string, { n: number; unicorns: number; percentiles: number[] }>;
}

const STAGE_3Y = stage3yJson as unknown as StageModel;
const STAGE_5Y = stage5yJson as unknown as StageModel;
const UNICORN = unicornJson as unknown as UnicornModel;
const REFERENCE = referenceJson as unknown as Reference;

export const MODEL_VERSION = UNICORN.version;

// ---------- feature engineering (must mirror ml/train_stage.py Prep.raw) ----------

const HUB_STATES = new Set(["CA", "NY", "MA"]);

const LABELS: Record<string, string> = {
  log_a_size: "Series A size",
  log_prior_equity: "Equity raised before Series A",
  months_to_a: "Months from first funding to Series A",
  age_years: "Company age at Series A",
  log_investors: "Number of Series A investors",
  hub_state: "Headquarters in CA / NY / MA",
  prior_rounds: "Rounds before Series A",
  "cat_B2C software": "Category: B2C software",
  cat_Hardware: "Category: Hardware",
  cat_Other: "Category: Other (bio / clean / med)",
  log_a_size_missing: "Series A size unknown",
  age_years_missing: "Founding date unknown",
  log_investors_missing: "Investor count unknown",
};

const pos = (v: number | null): number | null => (v !== null && Number.isFinite(v) && v > 0 ? v : null);

/** Raw (unscaled) feature values. `null` = missing. */
export function rawFeatures(c: CompanyInput): Record<string, number | null> {
  const size = pos(c.seriesAAmountUsd);
  const inv = pos(c.seriesAInvestorCount);
  const age = c.ageMonthsAtA !== null && Number.isFinite(c.ageMonthsAtA) && c.ageMonthsAtA >= 0 ? c.ageMonthsAtA : null;
  const months = c.monthsFirstFundingToA !== null && Number.isFinite(c.monthsFirstFundingToA) ? Math.max(0, c.monthsFirstFundingToA) : 0;
  return {
    log_a_size: size === null ? null : Math.log10(size),
    log_prior_equity: Math.log10(1 + Math.max(0, c.priorEquityUsd ?? 0)),
    months_to_a: Math.min(months, 120),
    age_years: age === null ? null : Math.min(age / 12, 20),
    log_investors: inv === null ? null : Math.log2(inv),
    hub_state: c.hqState !== null && HUB_STATES.has(c.hqState.trim().toUpperCase()) ? 1 : 0,
    prior_rounds: Math.min(Math.max(0, c.priorRounds ?? 0), 5),
    "cat_B2C software": c.category === "B2C software" ? 1 : 0,
    cat_Hardware: c.category === "Hardware" ? 1 : 0,
    cat_Other: c.category === "Other" ? 1 : 0,
  };
}

/** Median-fill, add missing flags, standardize. Returns values in prep.columns order. */
function transform(raw: Record<string, number | null>, prep: Prep, medians?: number[], mean?: number[], std?: number[]): number[] {
  const filled: Record<string, number> = {};
  prep.features.forEach((f, i) => {
    const v = raw[f];
    const med = medians ? (medians[i] ?? 0) : (prep.impute_median[f] ?? 0);
    filled[f] = v === null || v === undefined ? med : v;
  });
  for (const f of prep.missing_flag_cols) filled[`${f}_missing`] = raw[f] === null ? 1 : 0;
  const mu = mean ?? prep.mean;
  const sd = std ?? prep.std;
  return prep.columns.map((col, i) => ((filled[col] ?? 0) - (mu[i] ?? 0)) / (sd[i] || 1));
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (w: number[], x: number[]) => w.reduce((s, wi, i) => s + wi * (x[i] ?? 0), 0);

function drivers(prep: Prep, coef: number[], x: number[]): Driver[] {
  return prep.columns
    .map((col, i) => ({ feature: col, label: LABELS[col] ?? col, contribution: (coef[i] ?? 0) * (x[i] ?? 0) }))
    .filter((d) => Math.abs(d.contribution) > 1e-6)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function stageForecast(m: StageModel, raw: Record<string, number | null>): StageForecast {
  const x = transform(raw, m.prep);
  const pB = sigmoid(m.reach_b.intercept + dot(m.reach_b.coef, x));
  const pC = Math.min(sigmoid(m.reach_c.intercept + dot(m.reach_c.coef, x)), pB);
  return {
    horizonYears: m.horizon_years,
    stayA: 1 - pB,
    reachB: pB - pC,
    reachC: pC,
    reachBOrLater: pB,
    baseRates: { stayA: m.base_rates.stay_a, reachB: m.base_rates.reach_b, reachC: m.base_rates.reach_c },
    drivers: drivers(m.prep, m.reach_b.coef, x),
  };
}

function quantile(sorted: number[], q: number): number {
  const pos_ = (sorted.length - 1) * q;
  const lo = Math.floor(pos_);
  const hi = Math.ceil(pos_);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos_ - lo);
}

function unicornForecast(raw: Record<string, number | null>): UnicornForecast {
  const m = UNICORN;
  const x = transform(raw, m.prep);
  const p = sigmoid(m.intercept + dot(m.coef, x));
  const boots = m.bootstrap
    .map((b) => sigmoid(b.intercept + dot(b.coef, transform(raw, m.prep, b.median, b.mean, b.std))))
    .sort((a, b) => a - b);
  const low = quantile(boots, 0.05);
  const high = quantile(boots, 0.95);
  return {
    probability: p,
    range: { low, high },
    baseRate: m.base_rate,
    multipleOfBaseRate: p / m.base_rate,
    multipleRange: { low: low / m.base_rate, high: high / m.base_rate },
    drivers: drivers(m.prep, m.coef, x),
  };
}

/** Percent of the reference distribution below `v` (0-100), from 101 stored percentiles. */
function percentileOf(v: number, pcts: number[]): number {
  if (pcts.length === 0) return 50;
  if (v <= (pcts[0] ?? 0)) return 0;
  if (v >= (pcts[pcts.length - 1] ?? 1)) return 100;
  for (let i = 1; i < pcts.length; i++) {
    const a = pcts[i - 1] ?? 0;
    const b = pcts[i] ?? 0;
    if (v <= b) return i - 1 + (b > a ? (v - a) / (b - a) : 0);
  }
  return 100;
}

const INPUT_FIELDS: [keyof CompanyInput, string][] = [
  ["seriesAAmountUsd", "Series A amount"],
  ["priorEquityUsd", "Equity raised before Series A"],
  ["priorRounds", "Rounds before Series A"],
  ["monthsFirstFundingToA", "First funding date"],
  ["ageMonthsAtA", "Founding date"],
  ["seriesAInvestorCount", "Series A investor count"],
  ["hqState", "Headquarters state"],
];

/** Score one company. Pure and deterministic: batch and single scoring give identical results. */
export function scoreCompany(input: CompanyInput): Scorecard {
  const raw = rawFeatures(input);
  const stage3y = stageForecast(STAGE_3Y, raw);
  const stage5y = stageForecast(STAGE_5Y, raw);
  const unicorn = unicornForecast(raw);
  const refStage = REFERENCE.stage_3y_reach_b[input.category];
  const refUni = REFERENCE.unicorn[input.category];
  const missingInputs = INPUT_FIELDS.filter(([k]) => input[k] === null).map(([, label]) => label);
  return {
    modelVersion: MODEL_VERSION,
    stage3y,
    stage5y,
    unicorn,
    percentile: {
      stage3yReachB: percentileOf(stage3y.reachBOrLater, refStage?.percentiles ?? []),
      unicorn: percentileOf(unicorn.probability, refUni?.percentiles ?? []),
      cohortSize: refUni?.n ?? 0,
      category: input.category,
    },
    inputsProvided: 1 + INPUT_FIELDS.length - missingInputs.length, // +1 for category (always required)
    inputsTotal: 1 + INPUT_FIELDS.length,
    missingInputs,
  };
}

/**
 * Standardized feature vector used for similarity (comparables), on the 3-year stage
 * model's scale. Category flags are excluded: comparables are filtered by category instead.
 */
export function similarityVector(input: CompanyInput): number[] {
  const x = transform(rawFeatures(input), STAGE_3Y.prep);
  return STAGE_3Y.prep.columns.flatMap((col, i) => (col.startsWith("cat_") ? [] : [x[i] ?? 0]));
}

export const SIMILARITY_FEATURES = STAGE_3Y.prep.columns
  .filter((c) => !c.startsWith("cat_"))
  .map((c) => LABELS[c] ?? c);

// ---------- helpers for the UI ----------

/** Whole months between two dates (as the model expects: days / 30.44). Returns null if either is missing. */
export function monthsBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return (to.getTime() - from.getTime()) / 86_400_000 / 30.44;
}
