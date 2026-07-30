import { keywordMetricsRate } from "@/lib/cost-estimate/provider-rates";
import { describe, expect, it } from "vitest";
import { normalizedProviderUnitCostCents } from "./unit-cost";

describe("normalizedProviderUnitCostCents", () => {
  it("keeps samples from differently sized calls comparable", () => {
    const rate = keywordMetricsRate("dataforseo");

    expect(normalizedProviderUnitCostCents({ costCents: 1.1, itemCount: 10, rate })).toBeCloseTo(
      0.01,
    );
    expect(normalizedProviderUnitCostCents({ costCents: 11, itemCount: 1_000, rate })).toBeCloseTo(
      0.01,
    );
  });

  it("removes the clickstream multiplier before normalizing", () => {
    expect(
      normalizedProviderUnitCostCents({
        costCents: 4,
        includeClickstream: true,
        itemCount: 100,
        rate: keywordMetricsRate("dataforseo"),
      }),
    ).toBeCloseTo(0.01);
  });
});
