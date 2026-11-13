import { describe, expect, it } from "vitest";
import { honestyLine, multipleSentence, pinRadius, stageSentence, headline } from "./atlas";
import { findNearestUnicorns, getHistoricalCompanies } from "./comparables";

describe("atlas copy", () => {
  it("stage forecast is said as 'out of 10'", () => {
    expect(stageSentence(0.41)).toBe("About 4 in 10 companies like yours raised a Series B within 3 years");
  });
  it("unicorn multiple is said as times the typical odds", () => {
    expect(multipleSentence(2.04)).toBe("2× the typical odds of becoming a unicorn");
  });
  it("headline uses the first 3 same-category names and the honesty line uses the first match's crowd", () => {
    const lyft = getHistoricalCompanies().find((c) => c.name === "Lyft")!;
    const { sameCategory } = findNearestUnicorns(lyft, { k: 6, excludeId: lyft.id });
    const names = sameCategory.slice(0, 3).map((m) => m.company.name);
    expect(headline(sameCategory)).toContain(names[0]!);
    expect(honestyLine(sameCategory[0], "B2C software")).toContain(`${sameCategory[0]!.crowd.companies.toLocaleString()} consumer software`);
  });
});

describe("pin distance", () => {
  it("lands each band inside its ring and grows with rank", () => {
    expect(pinRadius(10, 1000)).toBeLessThanOrEqual(90);
    expect(pinRadius(50, 1000)).toBeLessThanOrEqual(170);
    expect(pinRadius(51, 1000)).toBeGreaterThan(170);
    expect(pinRadius(20, 1000)).toBeGreaterThan(pinRadius(10, 1000));
  });
});
