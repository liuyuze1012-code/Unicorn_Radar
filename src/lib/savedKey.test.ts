import { describe, expect, it } from "vitest";
import { savedKey } from "./savedKey";

describe("savedKey", () => {
  it("same inputs in any order give the same saved entry", () => {
    expect(savedKey({ name: "Acme", cat: "web", a: 5 })).toBe(savedKey({ a: 5, cat: "web", name: "Acme", st: undefined }));
  });
  it("different inputs give different entries", () => {
    expect(savedKey({ name: "Acme", a: 5 })).not.toBe(savedKey({ name: "Acme", a: 6 }));
  });
});
