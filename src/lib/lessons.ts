/** Pure helpers for the Unicorn Lessons page: closest unicorns and numbers-only takeaways. */
import { findNeighbors, type HistoricalCompany, type Neighbor } from "./comparables";
import { formatUsd } from "./mapModel";
import type { CompanyInput } from "./scoring";

export const isUnicorn = (c: HistoricalCompany) => c.unicorn === "within_5y" || c.unicorn === "later";

/** The n most similar companies (all 8 inputs) that reached $1B. Same category first, then any category to fill up. */
export function closestUnicorns(input: CompanyInput, n = 5, excludeId?: number): Neighbor[] {
  const opts = excludeId !== undefined ? { excludeId } : {};
  const same = findNeighbors(input, { k: 1e6, sameCategory: true, ...opts }).filter((x) => isUnicorn(x.company));
  if (same.length >= n) return same.slice(0, n);
  const ids = new Set(same.map((x) => x.company.id));
  const rest = findNeighbors(input, { k: 1e6, sameCategory: false, ...opts }).filter((x) => isUnicorn(x.company) && !ids.has(x.company.id));
  return [...same, ...rest].slice(0, n);
}

export function median(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

export interface Takeaway { label: string; yours: string; theirs: string; note: string }

type Field = { key: keyof CompanyInput; label: string; fmt: (n: number) => string; more: string; less: string };
const FIELDS: Field[] = [
  { key: "seriesAAmountUsd", label: "Series A size", fmt: formatUsd, more: "You raised more than they did at Series A.", less: "They raised a bigger Series A; consider whether you are under-capitalized." },
  { key: "priorEquityUsd", label: "Money raised before Series A", fmt: formatUsd, more: "You raised more before your A than they did.", less: "They raised more before their A, often from seed rounds that built traction." },
  { key: "priorRounds", label: "Rounds before Series A", fmt: (n) => `${+n.toFixed(1)}`, more: "You took more rounds to get to A.", less: "They had more early rounds before A." },
  { key: "monthsFirstFundingToA", label: "Months from first funding to A", fmt: (n) => `${n.toFixed(0)} months`, more: "You took longer to reach A; they moved faster.", less: "You reached A faster than they did." },
  { key: "ageMonthsAtA", label: "Company age at A", fmt: (n) => `${(n / 12).toFixed(1)} years`, more: "You are older at A than they were.", less: "You are younger at A than they were." },
  { key: "seriesAInvestorCount", label: "Series A investors", fmt: (n) => `${+n.toFixed(1)}`, more: "Your A round has more investors than theirs.", less: "They brought more investors into the A, widening their network for later rounds." },
];

/** Compare your inputs with the median of the given unicorns. Within ±15% counts as similar. */
export function takeaways(input: CompanyInput, unicorns: HistoricalCompany[]): Takeaway[] {
  return FIELDS.map((f) => {
    const theirs = median(unicorns.map((c) => c[f.key] as number | null));
    const mine = input[f.key] as number | null;
    const t = theirs === null ? "unknown" : f.fmt(theirs);
    if (mine === null) return { label: f.label, yours: "unknown", theirs: t, note: "Add this to your scorecard to compare." };
    if (theirs === null) return { label: f.label, yours: f.fmt(mine), theirs: t, note: "Not enough data on these unicorns." };
    const ratio = theirs === 0 ? (mine === 0 ? 1 : Infinity) : mine / theirs;
    const note = ratio > 1.15 ? f.more : ratio < 0.85 ? f.less : "You are in line with them.";
    return { label: f.label, yours: f.fmt(mine), theirs: t, note };
  });
}
