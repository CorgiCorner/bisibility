import { describe, expect, it } from "vitest";
import { combineUsageEstimates, estimateRankUsage } from "./native-usage";

describe("operational provider usage estimates", () => {
  it("counts native operations for each effective target depth without using a plan price", () => {
    expect(
      estimateRankUsage([10, 20, 100], { providerId: "serpapi", overrideCents: 999 }),
    ).toMatchObject({ quantity: 13, unit: "units", unknownTargets: 0 });
  });
  it("preserves fractional metered cents", () => {
    expect(
      estimateRankUsage([10, 20], { providerId: "dataforseo", overrideCents: null }),
    ).toMatchObject({ quantity: 0.55, unit: "cents", unknownTargets: 0 });
  });
  it("keeps unknown provider estimates unknown instead of free", () => {
    expect(
      estimateRankUsage([20], { providerId: "unrecognized", overrideCents: null }),
    ).toMatchObject({ quantity: null, unit: null, unknownTargets: 1 });
  });
  it("never combines currencies and operations or treats partial knowledge as a complete total", () => {
    const operations = estimateRankUsage([20], { providerId: "serpapi", overrideCents: null });
    const money = estimateRankUsage([10], { providerId: "dataforseo", overrideCents: null });
    const unknown = estimateRankUsage([20], { providerId: "unknown", overrideCents: null });
    expect(combineUsageEstimates([operations, money]).quantity).toBeNull();
    expect(combineUsageEstimates([operations, unknown]).quantity).toBeNull();
  });
});
