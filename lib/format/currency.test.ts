import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents } from "./currency";

describe("currency precision helpers", () => {
  it.each([
    { cents: 29, dollars: 0.29, label: "normal cents" },
    { cents: 0.06, dollars: 0.0006, label: "fractional provider cents" },
    { cents: 30, dollars: 0.1 + 0.2, label: "floating-point sum" },
    { cents: 10_000, dollars: 100, label: "provider schema maximum" },
    { cents: -29, dollars: -0.29, label: "negative values" },
    { cents: 0, dollars: 0, label: "zero" },
  ])("round-trips $label", ({ cents, dollars }) => {
    expect(dollarsToCents(dollars)).toBe(cents);
    expect(centsToDollars(cents)).toBe(Number(dollars.toFixed(6)));
  });

  it("rounds converted cents to four decimal places", () => {
    expect(dollarsToCents(0.123456789)).toBe(12.3457);
    expect(dollarsToCents(-0.123456789)).toBe(-12.3457);
  });

  it("rounds converted dollars to six decimal places", () => {
    expect(centsToDollars(12.3456789)).toBe(0.123457);
    expect(centsToDollars(-12.3456789)).toBe(-0.123457);
  });
});
