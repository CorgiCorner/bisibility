import { keywordMetricsRate } from "@/lib/cost-estimate/provider-rates";
import { describe, expect, it } from "vitest";
import { normalizedProviderUnitCostCents } from "./unit-cost";

describe("normalizedProviderUnitCostCents", () => {
  it("keeps samples from differently sized calls comparable", () => {
    const rate = keywordMetricsRate("dataforseo");

    expect(
      normalizedProviderUnitCostCents({ costCents: 1.2 + 10 * 0.012, itemCount: 10, rate }),
    ).toBeCloseTo(0.012);
    expect(
      normalizedProviderUnitCostCents({ costCents: 1.2 + 1_000 * 0.012, itemCount: 1_000, rate }),
    ).toBeCloseTo(0.012);
  });

  it("removes the clickstream multiplier before normalizing", () => {
    expect(
      normalizedProviderUnitCostCents({
        costCents: (1.2 + 100 * 0.012) * 2,
        includeClickstream: true,
        itemCount: 100,
        rate: keywordMetricsRate("dataforseo"),
      }),
    ).toBeCloseTo(0.012);
  });
});
