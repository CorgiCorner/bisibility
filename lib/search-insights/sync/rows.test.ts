import { chunk, numberValue } from "@/lib/search-insights/sync/rows";
import { describe, expect, it } from "vitest";

describe("numberValue", () => {
  it("reads a numeric string as the number the provider meant", () => {
    expect(numberValue("12.5")).toBe(12.5);
    expect(numberValue(4)).toBe(4);
  });

  it("falls back to zero for anything that is not a finite number", () => {
    expect(numberValue(undefined)).toBe(0);
    expect(numberValue("not a number")).toBe(0);
    expect(numberValue(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("chunk", () => {
  it("splits a partition into bounded writes and keeps the provider order", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("has nothing to write for an empty partition", () => {
    expect(chunk([], 10)).toEqual([]);
  });
});
