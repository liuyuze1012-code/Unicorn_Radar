import { describe, expect, it } from "vitest";
import { getHistoricalCompanies } from "./comparables";
import { closestUnicorns, isUnicorn, median, takeaways } from "./lessons";

describe("lessons", () => {
  const all = getHistoricalCompanies();
  const airbnb = all.find((c) => c.name === "Airbnb")!;
  it("returns exactly the 5 closest unicorns, sorted by distance", () => {
    const u = closestUnicorns(airbnb, 5, airbnb.id);
    expect(u).toHaveLength(5);
    expect(u.every((x) => isUnicorn(x.company) && x.company.id !== airbnb.id)).toBe(true);
    expect(u.map((x) => x.distance)).toEqual([...u.map((x) => x.distance)].sort((a, b) => a - b));
  });
  it("median handles unknowns", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([null])).toBeNull();
  });
  it("flags a much smaller Series A", () => {
    const u = closestUnicorns(airbnb, 5).map((x) => x.company);
    const t = takeaways({ ...airbnb, seriesAAmountUsd: 1 }, u)[0]!;
    expect(t.note).toMatch(/bigger Series A/);
  });
});
