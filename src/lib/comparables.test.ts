import { describe, expect, it } from "vitest";
import { compareTraits, findNearestUnicorns, findNeighbors, getHistoricalCompanies, summarize } from "./comparables";
import { scoreCompany } from "./scoring";

describe("historical companies", () => {
  const all = getHistoricalCompanies();

  it("loads all 5,819 companies with 50 model-target unicorns", () => {
    expect(all).toHaveLength(5819);
    expect(all.filter((c) => c.unicorn === "within_5y")).toHaveLength(50);
  });

  it("stored map scores match the live scoring model", () => {
    for (const c of all.filter((_, i) => i % 97 === 0)) {
      const s = scoreCompany(c);
      expect(Math.abs(s.stage3y.reachBOrLater - c.stageScore)).toBeLessThan(1e-4);
      expect(Math.abs(s.unicorn.probability - c.unicornScore)).toBeLessThan(1e-4);
    }
  });
});

describe("findNeighbors", () => {
  const all = getHistoricalCompanies();
  const airbnb = all.find((c) => c.name === "Airbnb")!;

  it("a company's own inputs find itself first, at distance 0", () => {
    const n = findNeighbors(airbnb, { k: 5 });
    expect(n[0]!.distance).toBeCloseTo(0, 6);
    expect(n.every((x) => x.company.category === airbnb.category)).toBe(true);
    expect(n.map((x) => x.distance)).toEqual([...n.map((x) => x.distance)].sort((a, b) => a - b));
  });

  it("excludeId removes the company itself", () => {
    const n = findNeighbors(airbnb, { k: 25, excludeId: airbnb.id });
    expect(n).toHaveLength(25);
    expect(n.some((x) => x.company.id === airbnb.id)).toBe(false);
  });

  it("summary counts are consistent", () => {
    const s = summarize(findNeighbors(airbnb, { k: 25 }));
    expect(s.n).toBe(25);
    expect(s.stage3y.stayA + s.stage3y.reachB + s.stage3y.reachC).toBe(s.stage3y.observed);
    expect(s.unicornsWithin5y.map((c) => c.name)).toContain("Airbnb");
  });

  it("is deterministic", () => {
    expect(findNeighbors(airbnb).map((n) => n.company.id)).toEqual(findNeighbors(airbnb).map((n) => n.company.id));
  });
});

describe("findNearestUnicorns", () => {
  const all = getHistoricalCompanies();
  const lyft = all.find((c) => c.name === "Lyft")!;

  it("returns unicorns only, nearest first, split by category, with honest crowd counts", () => {
    const { sameCategory, otherCategories } = findNearestUnicorns(lyft, { k: 6, excludeId: lyft.id });
    expect(sameCategory).toHaveLength(6);
    expect(sameCategory.every((x) => x.company.category === lyft.category)).toBe(true);
    expect(otherCategories.every((x) => x.company.category !== lyft.category)).toBe(true);
    for (const list of [sameCategory, otherCategories]) {
      expect(list.every((x) => x.company.unicorn === "within_5y" || x.company.unicorn === "later")).toBe(true);
      expect(list.map((x) => x.rank)).toEqual([...list.map((x) => x.rank)].sort((a, b) => a - b));
      expect(list.every((x) => x.profile !== null && x.crowd.companies === x.rank && x.crowd.unicorns <= x.rank)).toBe(true);
    }
    expect(sameCategory.map((x) => x.crowd.unicorns)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("a unicorn's own inputs rank itself first", () => {
    const top = findNearestUnicorns(lyft, { k: 1 }).sameCategory[0]!;
    expect(top.company.name).toBe("Lyft");
    expect(top.rank).toBe(1);
    expect(top.band).toBe("Closest 1%");
  });

  it("compareTraits gives 7 plain-language rows", () => {
    const rows = compareTraits(lyft, all.find((c) => c.name === "Uber")!);
    expect(rows).toHaveLength(7);
    expect(rows[0]!.yours).toMatch(/^\$|Unknown/);
  });
});
