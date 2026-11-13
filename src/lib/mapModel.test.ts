import { describe, expect, it } from "vitest";
import { outcomeOf, PRESETS, similarity } from "./mapModel";
import { getHistoricalCompanies } from "./comparables";

describe("map outcome colors", () => {
  it("unicorn within 5 years is gold regardless of stage", () => {
    expect(outcomeOf({ unicorn: "within_5y", stage3y: 0, stage5y: 0 })).toBe("unicorn");
  });
  it("uses stage5y when available, otherwise stage3y", () => {
    expect(outcomeOf({ unicorn: "no", stage3y: 1, stage5y: 2 })).toBe("reachC");
    expect(outcomeOf({ unicorn: "no", stage3y: 1, stage5y: null })).toBe("reachB");
  });
  it("no observed window is 'not yet observable'", () => {
    expect(outcomeOf({ unicorn: "unknown", stage3y: null, stage5y: null })).toBe("unobserved");
  });
});

describe("axis presets", () => {
  it("has the 4 presets with model scores first", () => {
    expect(PRESETS).toHaveLength(4);
    expect(PRESETS[0]!.name).toBe("Model scores");
  });
  it("missing inputs are null (unknown strip), never 0", () => {
    const c = getHistoricalCompanies().find((x) => x.seriesAAmountUsd === null)!;
    expect(PRESETS[1]!.x.value(c)).toBeNull();
  });
});

describe("similarity bar", () => {
  it("25th neighbour is 0, identical inputs are 1", () => {
    expect(similarity(2, 2)).toBe(0);
    expect(similarity(0, 2)).toBe(1);
  });
});
