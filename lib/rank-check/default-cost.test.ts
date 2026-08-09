import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { describe, expect, it } from "vitest";
import {
  defaultCostPerBillingUnitCents,
  defaultCostPerCheckCents,
  estimatedRankCheckCostCents,
} from "./default-cost";

describe("defaultCostPerCheckCents", () => {
  it.each([
    [10, 1],
    [20, 2],
    [50, 5],
    [100, 10],
  ] as const)("returns the conservative SerpApi top-%i estimate", (depth, expected) => {
    expect(defaultCostPerCheckCents("serpapi", depth)).toBe(expected);
  });

  it.each([
    [10, 0.2],
    [20, 0.35],
    [50, 0.8],
    [100, 1.55],
  ] as const)("returns the DataForSEO Live top-%i estimate", (depth, expected) => {
    expect(defaultCostPerCheckCents("dataforseo", depth)).toBe(expected);
  });

  it("returns zero for unknown providers", () => {
    expect(defaultCostPerCheckCents("nope", 100)).toBe(0);
    expect(defaultCostPerBillingUnitCents("nope")).toBe(0);
  });

  it("uses the zero-cost self-host rate when no override is configured", () => {
    expect(defaultCostPerCheckCents("local-sequence", 100)).toBe(0);
    expect(
      estimatedRankCheckCostCents("local-sequence", 100, null, LIST_PROVIDER_RATE_CONTEXT),
    ).toBe(0);
  });

  it("derives the reference search cost from the maintained production plan", () => {
    expect(defaultCostPerBillingUnitCents("serpapi")).toBe(1);
  });

  it("uses the configured cost before the shared provider-depth model", () => {
    expect(estimatedRankCheckCostCents("dataforseo", 100, 0.75, LIST_PROVIDER_RATE_CONTEXT)).toBe(
      0.75,
    );
    expect(estimatedRankCheckCostCents("dataforseo", 100, null, LIST_PROVIDER_RATE_CONTEXT)).toBe(
      defaultCostPerCheckCents("dataforseo", 100),
    );
    expect(estimatedRankCheckCostCents("dataforseo", 100, 0, LIST_PROVIDER_RATE_CONTEXT)).toBe(0);
    expect(estimatedRankCheckCostCents("local-sequence", 100, 0, LIST_PROVIDER_RATE_CONTEXT)).toBe(
      0,
    );
  });

  it("returns unavailable for unknown providers and invalid overrides", () => {
    expect(
      estimatedRankCheckCostCents("unknown", 100, null, LIST_PROVIDER_RATE_CONTEXT),
    ).toBeNull();
    expect(
      estimatedRankCheckCostCents("dataforseo", 100, Number.NaN, LIST_PROVIDER_RATE_CONTEXT),
    ).toBeNull();
  });

  it("routes measured rank-check samples through the shared resolver", () => {
    const createdAt = new Date("2026-07-27T00:00:00.000Z");
    const entries = [1, 2, 3, 4, 100].map((costCents) => ({
      cached: false,
      costCents,
      createdAt,
      failed: false,
    }));

    expect(
      estimatedRankCheckCostCents("dataforseo", 100, null, {
        entries,
        manualAmountCents: null,
      }),
    ).toBe(3);
  });
});
