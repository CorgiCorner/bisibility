import { describe, expect, it } from "vitest";
import { aggregateObservedUsage, aggregateObservedUsageForProvider } from "./observed-usage";

describe("aggregateObservedUsage", () => {
  it("preserves recorded fractional-cent costs for totals and averages", () => {
    expect(aggregateObservedUsage([{ costCents: 0.8 }, { costCents: 1.55 }])).toEqual({
      averageCostCents: 1.175,
      checkCount: 2,
      totalCostCents: 2.35,
    });
  });

  it("isolates observed costs by provider", () => {
    expect(
      aggregateObservedUsageForProvider(
        [
          { costCents: 0.8, provider: "dataforseo" },
          { costCents: 1.55, provider: "dataforseo" },
          { costCents: 4, provider: "serpapi" },
        ],
        "dataforseo",
      ),
    ).toEqual({ averageCostCents: 1.175, checkCount: 2, totalCostCents: 2.35 });
  });
});
