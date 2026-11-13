/** Plain-language copy and pin layout for Unicorn Atlas. Pure; similarity comes from findNearestUnicorns ranks. */
import type { Category } from "./scoring";
import type { UnicornMatch } from "./comparables";

export const LAND_NAME: Record<Category, string> = {
  "B2B software": "B2B Software Valley",
  "B2C software": "Consumer Bay",
  Hardware: "Hardware Ridge",
  Other: "Life Sciences Coast",
};

export const CATEGORY_PLAIN: Record<Category, string> = {
  "B2B software": "B2B software",
  "B2C software": "consumer software",
  Hardware: "hardware",
  Other: "biotech, health or energy",
};

/** Ring radii (SVG units) for the 1% / 5% / 15% contours. */
export const RINGS = [
  { label: "Closest 1%", pct: 1, r: 90 },
  { label: "Closest 5%", pct: 5, r: 170 },
  { label: "Closest 15%", pct: 15, r: 250 },
] as const;

/** Distance of a pin from "You": grows with rank, and lands inside the right ring band. */
export function pinRadius(rank: number, poolSize: number): number {
  const p = Math.min(100, (100 * rank) / Math.max(1, poolSize));
  const stops: [number, number][] = [[0, 34], [1, 90], [5, 170], [15, 250], [100, 330]];
  for (let i = 1; i < stops.length; i++) {
    const [p0, r0] = stops[i - 1]!;
    const [p1, r1] = stops[i]!;
    if (p <= p1) return r0 + ((p - p0) / (p1 - p0)) * (r1 - r0);
  }
  return 330;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function headline(same: UnicornMatch[]): string {
  const names = same.slice(0, 3).map((m) => m.company.name);
  return names.length ? `At its Series A, your company looked most like ${listNames(names)}.` : "We found no unicorns in your category to compare with.";
}

/** Always shown: how many companies were at least as close as the first match, and how many became unicorns. */
export function honestyLine(first: UnicornMatch | undefined, category: Category): string {
  if (!first) return "Most companies never reach a $1B valuation.";
  const { companies, unicorns } = first.crowd;
  return `But ${plural(companies, `${CATEGORY_PLAIN[category]} company`, `${CATEGORY_PLAIN[category]} companies`)} looked at least that similar to you — and ${unicorns.toLocaleString()} of them became a unicorn.`;
}

export function stageSentence(reachBOrLater: number): string {
  const x = Math.round(reachBOrLater * 10);
  return `About ${x} in 10 companies like yours raised a Series B within 3 years`;
}

export function multipleSentence(multiple: number): string {
  const m = multiple >= 10 ? Math.round(multiple) : Math.round(multiple * 10) / 10;
  return `${m}× the typical odds of becoming a unicorn`;
}

export function closenessSentence(m: UnicornMatch, category: Category, sameCategory: boolean): string {
  const pool = sameCategory ? `${m.poolSize.toLocaleString()} ${CATEGORY_PLAIN[category]} companies` : `${m.poolSize.toLocaleString()} companies`;
  const band = m.band === "Further away" ? `closest ${m.closestPercent}%` : m.band.toLowerCase();
  return `${m.company.name} is #${m.rank.toLocaleString()} of ${pool} most like you (${band}). Of those ${m.rank.toLocaleString()}, ${m.crowd.unicorns.toLocaleString()} became a unicorn.`;
}

export const yearOf = (ym: string | null | undefined) => (ym ? Number(ym.slice(0, 4)) : null);
