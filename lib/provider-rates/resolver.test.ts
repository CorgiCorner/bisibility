import { describe, expect, it } from "vitest";
import { resolveProviderRate } from "./resolver";

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
      checkedAt,
      sampleSize: 5,
      source: "measured",
    });
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
