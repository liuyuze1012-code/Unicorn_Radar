import { describe, expect, it } from "vitest";
import { parseCompanySearch, toCompanyInput } from "./companyParams";

describe("company search params", () => {
  it("blank fields become unknown (null), never 0", () => {
    const s = parseCompanySearch({ cat: "Hardware", a: "", inv: "4" });
    expect(toCompanyInput({ ...s, cat: "Hardware" })).toMatchObject({ seriesAAmountUsd: null, seriesAInvestorCount: 4, priorRounds: null });
  });
  it("rejects an unknown category", () => {
    expect(parseCompanySearch({ cat: "Crypto" }).cat).toBeUndefined();
  });
});
