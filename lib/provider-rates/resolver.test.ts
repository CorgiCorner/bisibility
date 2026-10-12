import { describe, expect, it } from "vitest";
import { exactMedianText, resolveProviderRate } from "./resolver";

const checkedAt = new Date("2026-07-27T00:00:00.000Z");

function entry(
  costCents: number,
  overrides: Partial<{
    cached: boolean;
    createdAt: Date;
    failed: boolean;
  }> = {},
) {
  return {
    cached: false,
    costCents,
    createdAt: checkedAt,
    failed: false,
    ...overrides,
  };
}

describe("resolveProviderRate", () => {
  it("returns unknown without inventing a zero", () => {
    const resolved = resolveProviderRate({
      entries: [entry(1), entry(2), entry(3), entry(4)],
      list: null,
      manualAmountCents: null,
    });

    expect(resolved).toEqual({ source: "unknown" });
    expect(resolved).not.toHaveProperty("amountCents");
  });

  it("preserves a genuine zero from the price list", () => {
    const resolved = resolveProviderRate({
      entries: [],
      list: { amountCents: 0, checkedAt },
      manualAmountCents: null,
    });

    expect(resolved).toEqual({ amountCents: 0, checkedAt, source: "list" });
    expect(resolved.source).not.toBe("unknown");
  });

  it("uses the median and excludes cached and failed calls", () => {
    const resolved = resolveProviderRate({
      entries: [
        entry(1),
        entry(2),
        entry(3),
        entry(4),
        entry(100),
        entry(1_000, { cached: true }),
        entry(2_000, { failed: true }),
      ],
      list: { amountCents: 9, checkedAt },
      manualAmountCents: null,
    });

    expect(resolved).toEqual({
      amountCents: 3,
      amountText: "3",
      checkedAt,
      sampleSize: 5,
      source: "measured",
    });
  });

  it("averages an even median exactly", () => {
    const decimals = ["0.0500", "0.0700", "0.1000", "0.2000", "0.3000", "0.4000"];
    const resolved = resolveProviderRate({
      entries: decimals.map((costCents) => ({ ...entry(0), costCents })),
      list: null,
      manualAmountCents: null,
    });

    // Floating point would give 0.15000000000000002.
    expect(resolved).toMatchObject({ amountCents: 0.15, amountText: "0.15", sampleSize: 6 });
    expect(exactMedianText(["0.0001", "0.0002"])).toBe("0.00015");
    expect(exactMedianText(["1.5", "0.25", "2"])).toBe("1.5");
  });

  it("falls through with four samples and resolves measured with five", () => {
    const four = [entry(1), entry(2), entry(3), entry(4)];
    const list = { amountCents: 8, checkedAt };

    expect(resolveProviderRate({ entries: four, list, manualAmountCents: null })).toMatchObject({
      amountCents: 8,
      source: "list",
    });
    expect(
      resolveProviderRate({ entries: [...four, entry(5)], list, manualAmountCents: null }),
    ).toMatchObject({
      amountCents: 3,
      sampleSize: 5,
      source: "measured",
    });
  });

  it("excludes non-positive reported samples from measured rates", () => {
    const list = { amountCents: 1, checkedAt };
    const entries = Array.from({ length: 5 }, () => entry(0));

    expect(resolveProviderRate({ entries, list, manualAmountCents: null })).toEqual({
      amountCents: 1,
      checkedAt,
      source: "list",
    });
  });

  it("gives a manual zero precedence over measured and list rates", () => {
    const resolved = resolveProviderRate({
      entries: [entry(1), entry(2), entry(3), entry(4), entry(5)],
      list: { amountCents: 8, checkedAt },
      manualAmountCents: 0,
    });

    expect(resolved).toEqual({ amountCents: 0, source: "manual" });
  });
});
