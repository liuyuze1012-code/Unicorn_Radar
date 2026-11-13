/** Company inputs as URL search params, shared by /scorecard, /scorecard/new and /map. */
import { CATEGORIES, type Category, type CompanyInput } from "./scoring";

export interface CompanySearch {
  name?: string | undefined;
  cat?: Category | undefined;
  a?: number | undefined;
  pe?: number | undefined;
  pr?: number | undefined;
  m?: number | undefined;
  age?: number | undefined;
  inv?: number | undefined;
  st?: string | undefined;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export function parseCompanySearch(s: { [K in keyof CompanySearch]?: unknown }): CompanySearch {
  return {
    name: typeof s.name === "string" && s.name ? s.name : undefined,
    cat: CATEGORIES.includes(s.cat as Category) ? (s.cat as Category) : undefined,
    a: num(s.a), pe: num(s.pe), pr: num(s.pr), m: num(s.m), age: num(s.age), inv: num(s.inv),
    st: typeof s.st === "string" && s.st ? s.st : undefined,
  };
}

export function toCompanyInput(s: CompanySearch & { cat: Category }): CompanyInput {
  return {
    category: s.cat,
    seriesAAmountUsd: s.a ?? null,
    priorEquityUsd: s.pe ?? null,
    priorRounds: s.pr ?? null,
    monthsFirstFundingToA: s.m ?? null,
    ageMonthsAtA: s.age ?? null,
    seriesAInvestorCount: s.inv ?? null,
    hqState: s.st ?? null,
  };
}
