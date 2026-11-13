/**
 * Historical comparables: the 5,819 U.S. companies the model was trained on,
 * and a nearest-neighbour search over the same 8 Series A inputs.
 *
 * Similarity is measured on ALL inputs (standardized), never on 2D map position,
 * so "closest companies" are genuinely the most similar at their Series A.
 */
import companiesJson from "@/model/companies.json";
import unicornProfilesJson from "@/model/unicorn_profiles.json";
import { similarityVector, type Category, type CompanyInput } from "./scoring";

export type UnicornStatus = "within_5y" | "later" | "no" | "unknown" | "before_series_a";
/** 0 = stayed at Series A, 1 = reached Series B, 2 = reached Series C or later. */
export type Stage = 0 | 1 | 2;

export interface HistoricalCompany extends CompanyInput {
  id: number;
  name: string;
  /** "YYYY-MM" */
  seriesADate: string;
  year: number;
  /** Furthest stage within 3 / 5 years. null when that window ran past the data (Dec 2013). */
  stage3y: Stage | null;
  stage5y: Stage | null;
  /** within_5y = $1B private round within 5 years of Series A (the model's target). later = after 5 years. */
  unicorn: UnicornStatus;
  /** "YYYY-MM" of the first private round at >= $1B, if any. */
  firstBillionDate: string | null;
  /** Crunchbase status as of Dec 2013: operating / acquired / ipo / closed. */
  status2013: string | null;
  /** Model score: P(reaches Series B or later within 3 years). Use as a map axis. */
  stageScore: number;
  /** Model score: P($1B private round within 5 years). Use as a map axis. */
  unicornScore: number;
}

interface CompaniesFile {
  version: string;
  source: string;
  columns: string[];
  rows: (string | number | null)[][];
}

const FILE = companiesJson as unknown as CompaniesFile;
export const COMPANIES_SOURCE = FILE.source;

let cache: HistoricalCompany[] | null = null;
let vectors: number[][] | null = null;

/** All historical companies (parsed once, then cached). */
export function getHistoricalCompanies(): HistoricalCompany[] {
  if (cache) return cache;
  const idx = Object.fromEntries(FILE.columns.map((c, i) => [c, i])) as Record<string, number>;
  const get = (r: (string | number | null)[], c: string) => r[idx[c] ?? -1] ?? null;
  cache = FILE.rows.map((r, id) => ({
    id,
    name: String(get(r, "name")),
    seriesADate: String(get(r, "seriesADate")),
    year: Number(get(r, "year")),
    category: get(r, "category") as Category,
    hqState: get(r, "hqState") as string | null,
    seriesAAmountUsd: get(r, "seriesAAmountUsd") as number | null,
    priorEquityUsd: get(r, "priorEquityUsd") as number | null,
    priorRounds: get(r, "priorRounds") as number | null,
    monthsFirstFundingToA: get(r, "monthsFirstFundingToA") as number | null,
    ageMonthsAtA: get(r, "ageMonthsAtA") as number | null,
    seriesAInvestorCount: get(r, "seriesAInvestorCount") as number | null,
    stage3y: get(r, "stage3y") as Stage | null,
    stage5y: get(r, "stage5y") as Stage | null,
    unicorn: get(r, "unicorn") as UnicornStatus,
    firstBillionDate: get(r, "firstBillionDate") as string | null,
    status2013: get(r, "status2013") as string | null,
    stageScore: Number(get(r, "stageScore")),
    unicornScore: Number(get(r, "unicornScore")),
  }));
  return cache;
}

function getVectors(): number[][] {
  if (!vectors) vectors = getHistoricalCompanies().map((c) => similarityVector(c));
  return vectors;
}

export interface Neighbor {
  company: HistoricalCompany;
  /** Euclidean distance on standardized inputs (0 = identical inputs). */
  distance: number;
}

export interface NeighborSummary {
  n: number;
  /** Outcomes of neighbours whose 3-year window is fully observed. */
  stage3y: { observed: number; stayA: number; reachB: number; reachC: number };
  stage5y: { observed: number; stayA: number; reachB: number; reachC: number };
  /** Neighbours with a $1B private round within 5 years of Series A. */
  unicornsWithin5y: HistoricalCompany[];
  /** Neighbours that reached $1B later than 5 years after Series A. */
  unicornsLater: HistoricalCompany[];
  acquiredBy2013: number;
  closedBy2013: number;
}

export interface NeighborOptions {
  k?: number;
  /** Only compare within the same category (default true: comps are usually sector-specific). */
  sameCategory?: boolean;
  /** Exclude a historical company by id (e.g. when exploring one of the dots itself). */
  excludeId?: number;
}

/** The k most similar historical companies at their Series A. Deterministic. */
export function findNeighbors(input: CompanyInput, opts: NeighborOptions = {}): Neighbor[] {
  const { k = 25, sameCategory = true, excludeId } = opts;
  const q = similarityVector(input);
  const all = getHistoricalCompanies();
  const vecs = getVectors();
  const out: Neighbor[] = [];
  for (let i = 0; i < all.length; i++) {
    const c = all[i]!;
    if (c.id === excludeId) continue;
    if (sameCategory && c.category !== input.category) continue;
    const v = vecs[i]!;
    let s = 0;
    for (let j = 0; j < q.length; j++) s += ((q[j] ?? 0) - (v[j] ?? 0)) ** 2;
    out.push({ company: c, distance: Math.sqrt(s) });
  }
  out.sort((a, b) => a.distance - b.distance || a.company.id - b.company.id);
  return out.slice(0, k);
}

function stageCounts(cs: HistoricalCompany[], key: "stage3y" | "stage5y") {
  const obs = cs.filter((c) => c[key] !== null);
  return {
    observed: obs.length,
    stayA: obs.filter((c) => c[key] === 0).length,
    reachB: obs.filter((c) => c[key] === 1).length,
    reachC: obs.filter((c) => c[key] === 2).length,
  };
}

/** What actually happened to a set of companies (e.g. the neighbours). */
export function summarize(neighbors: Neighbor[]): NeighborSummary {
  const cs = neighbors.map((n) => n.company);
  return {
    n: cs.length,
    stage3y: stageCounts(cs, "stage3y"),
    stage5y: stageCounts(cs, "stage5y"),
    unicornsWithin5y: cs.filter((c) => c.unicorn === "within_5y"),
    unicornsLater: cs.filter((c) => c.unicorn === "later"),
    acquiredBy2013: cs.filter((c) => c.status2013 === "acquired").length,
    closedBy2013: cs.filter((c) => c.status2013 === "closed").length,
  };
}

// ---------- simple view: nearest unicorns ----------

export interface UnicornProfile {
  /** One-line description from Crunchbase (2013). */
  tagline: string | null;
  /** Short "about" paragraph, as the company described itself around 2013. */
  about2013: string | null;
  city: string | null;
  website: string | null;
  founded: string | null;
}

const PROFILES = unicornProfilesJson as unknown as Record<string, UnicornProfile>;

export function getUnicornProfile(name: string): UnicornProfile | null {
  return PROFILES[name] ?? null;
}

/**
 * Honest closeness, in plain words. Most companies cluster around typical values, so a
 * famous unicorn can easily fall in "your closest 1%" while being no more relevant than
 * dozens of ordinary companies. So every match also reports the crowd at that distance:
 * how many companies were at least this close, and how many of them became unicorns.
 */
export type ClosenessBand = "Closest 1%" | "Closest 5%" | "Closest 15%" | "Further away";

export interface UnicornMatch {
  company: HistoricalCompany;
  profile: UnicornProfile | null;
  distance: number;
  /** 1 = the single most similar company in the comparison pool. */
  rank: number;
  /** Companies compared against (same category for sameCategory matches, all categories otherwise). */
  poolSize: number;
  /** This unicorn is within your closest X% of the pool (1-100, smaller = closer). */
  closestPercent: number;
  band: ClosenessBand;
  /** Companies at least this close to you (= rank), and how many of them became unicorns (incl. this one). */
  crowd: { companies: number; unicorns: number };
}

export const CLOSENESS_BANDS: { band: ClosenessBand; maxPercent: number }[] = [
  { band: "Closest 1%", maxPercent: 1 },
  { band: "Closest 5%", maxPercent: 5 },
  { band: "Closest 15%", maxPercent: 15 },
  { band: "Further away", maxPercent: 100 },
];

const bandFor = (pct: number): ClosenessBand =>
  CLOSENESS_BANDS.find((b) => pct <= b.maxPercent)?.band ?? "Further away";

const isUnicorn = (c: HistoricalCompany, includeLater: boolean) =>
  c.unicorn === "within_5y" || (includeLater && c.unicorn === "later");

function unicornMatches(pool: Neighbor[], includeLater: boolean, keep: (c: HistoricalCompany) => boolean, k: number) {
  const out: UnicornMatch[] = [];
  let unicornsSoFar = 0;
  for (let i = 0; i < pool.length && out.length < k; i++) {
    const n = pool[i]!;
    if (!isUnicorn(n.company, includeLater)) continue;
    unicornsSoFar++;
    if (!keep(n.company)) continue;
    const rank = i + 1;
    const closestPercent = Math.max(1, Math.ceil((100 * rank) / pool.length));
    out.push({
      company: n.company,
      profile: getUnicornProfile(n.company.name),
      distance: n.distance,
      rank,
      poolSize: pool.length,
      closestPercent,
      band: bandFor(closestPercent),
      crowd: { companies: rank, unicorns: unicornsSoFar },
    });
  }
  return out;
}

/**
 * The historical unicorns most similar to this company at Series A.
 * - sameCategory: unicorns in the company's own category, ranked within that category.
 * - otherCategories: unicorns from other categories, ranked among all companies.
 * includeLater adds companies that reached $1B more than 5 years after their Series A.
 */
export function findNearestUnicorns(
  input: CompanyInput,
  opts: { k?: number; includeLater?: boolean; excludeId?: number } = {},
): { sameCategory: UnicornMatch[]; otherCategories: UnicornMatch[] } {
  const { k = 6, includeLater = true, excludeId } = opts;
  const ex = excludeId !== undefined ? { excludeId } : {};
  const same = findNeighbors(input, { k: Number.MAX_SAFE_INTEGER, sameCategory: true, ...ex });
  const all = findNeighbors(input, { k: Number.MAX_SAFE_INTEGER, sameCategory: false, ...ex });
  return {
    sameCategory: unicornMatches(same, includeLater, () => true, k),
    otherCategories: unicornMatches(all, includeLater, (c) => c.category !== input.category, k),
  };
}

export interface TraitRow {
  label: string;
  yours: string;
  theirs: string;
  /** "similar" when close (within ~25%), otherwise which side is higher. */
  comparison: "similar" | "you higher" | "you lower" | "different" | "unknown";
}

const fmtUsd = (v: number | null) =>
  v === null
    ? "Unknown"
    : v >= 1e9
      ? `$${(v / 1e9).toFixed(1)}B`
      : v >= 1e6
        ? `$${(v / 1e6).toFixed(1)}M`
        : v >= 1e3
          ? `$${Math.round(v / 1e3)}K`
          : `$${Math.round(v)}`;
const fmtYears = (m: number | null) => (m === null ? "Unknown" : `${(m / 12).toFixed(1)} years`);
const fmtNum = (v: number | null) => (v === null ? "Unknown" : String(Math.round(v)));

function compare(a: number | null, b: number | null, absTol: number): TraitRow["comparison"] {
  if (a === null || b === null) return "unknown";
  if (Math.abs(a - b) <= Math.max(absTol, 0.25 * Math.max(Math.abs(a), Math.abs(b)))) return "similar";
  return a > b ? "you higher" : "you lower";
}

const same = (a: string | null, b: string | null): TraitRow["comparison"] =>
  a === null || b === null ? "unknown" : a === b ? "similar" : "different";

/** Side-by-side Series A facts, in plain words, for a "You vs. them" card. */
export function compareTraits(yours: CompanyInput, theirs: CompanyInput): TraitRow[] {
  return [
    { label: "Series A size", yours: fmtUsd(yours.seriesAAmountUsd), theirs: fmtUsd(theirs.seriesAAmountUsd), comparison: compare(yours.seriesAAmountUsd, theirs.seriesAAmountUsd, 0) },
    { label: "Raised before Series A", yours: fmtUsd(yours.priorEquityUsd), theirs: fmtUsd(theirs.priorEquityUsd), comparison: compare(yours.priorEquityUsd, theirs.priorEquityUsd, 250_000) },
    { label: "Company age at Series A", yours: fmtYears(yours.ageMonthsAtA), theirs: fmtYears(theirs.ageMonthsAtA), comparison: compare(yours.ageMonthsAtA, theirs.ageMonthsAtA, 6) },
    { label: "Investors in the Series A", yours: fmtNum(yours.seriesAInvestorCount), theirs: fmtNum(theirs.seriesAInvestorCount), comparison: compare(yours.seriesAInvestorCount, theirs.seriesAInvestorCount, 1) },
    { label: "Time from first funding to Series A", yours: fmtYears(yours.monthsFirstFundingToA), theirs: fmtYears(theirs.monthsFirstFundingToA), comparison: compare(yours.monthsFirstFundingToA, theirs.monthsFirstFundingToA, 6) },
    { label: "Headquarters", yours: yours.hqState ?? "Unknown", theirs: theirs.hqState ?? "Unknown", comparison: same(yours.hqState, theirs.hqState) },
    { label: "Category", yours: yours.category, theirs: theirs.category, comparison: same(yours.category, theirs.category) },
  ];
}
