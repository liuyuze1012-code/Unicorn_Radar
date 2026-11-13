import { describe, expect, it } from "vitest";
import fixtures from "@/model/fixtures.json";
import { scoreCompany, type CompanyInput } from "./scoring";

interface Fixture {
  name: string;
  input: CompanyInput;
  expected: { stage3y: { reachB: number; reachC: number }; stage5y: { reachB: number; reachC: number }; unicorn: number };
}

// Model weights are stored rounded to 6 decimals, so allow a tiny tolerance.
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-4);

describe("scoring matches the Python model", () => {
  for (const f of fixtures as unknown as Fixture[]) {
    it(f.name, () => {
      const s = scoreCompany(f.input);
      close(s.stage3y.reachBOrLater, f.expected.stage3y.reachB);
      close(s.stage3y.reachC, f.expected.stage3y.reachC);
      close(s.stage5y.reachBOrLater, f.expected.stage5y.reachB);
      close(s.stage5y.reachC, f.expected.stage5y.reachC);
      close(s.unicorn.probability, f.expected.unicorn);
    });
  }
});

describe("scoring behaviour", () => {
  const base: CompanyInput = {
    category: "B2B software",
    seriesAAmountUsd: 10_000_000,
    priorEquityUsd: 2_000_000,
    priorRounds: 1,
    monthsFirstFundingToA: 14,
    ageMonthsAtA: 24,
    seriesAInvestorCount: 4,
    hqState: "CA",
  };

  it("stage probabilities sum to 1 and unicorn range brackets the estimate", () => {
    const s = scoreCompany(base);
    for (const st of [s.stage3y, s.stage5y]) close(st.stayA + st.reachB + st.reachC, 1);
    expect(s.unicorn.range.low).toBeLessThanOrEqual(s.unicorn.range.high);
    expect(s.inputsProvided).toBe(8);
  });

  it("is deterministic (batch == single)", () => {
    expect(scoreCompany({ ...base })).toEqual(scoreCompany({ ...base }));
  });

  it("reports unknown inputs", () => {
    const s = scoreCompany({ ...base, ageMonthsAtA: null, seriesAInvestorCount: null });
    expect(s.missingInputs).toEqual(["Founding date", "Series A investor count"]);
    expect(s.inputsProvided).toBe(6);
  });
});
