/**
 * Historical comparables: the 5,819 U.S. companies the model was trained on,
 * and a nearest-neighbour search over the same 8 Series A inputs.
 *
 * Similarity is measured on ALL inputs (standardized), never on 2D map position,
 * so "closest companies" are genuinely the most similar at their Series A.
 */
import companiesJson from "@/model/companies.json";
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
