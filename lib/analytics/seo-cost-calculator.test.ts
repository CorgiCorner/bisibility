import { SEO_MIX_DEFAULTS } from "@/lib/cost-estimate/seo-mix-contract";
import { describe, expect, it } from "vitest";
import { analyticsEventSchemas } from "./event-schemas";
import { seoCostCalculatorProperties } from "./seo-cost-calculator";

describe("calculator analytics privacy", () => {
  it.each([
    [1, "1-50"],
    [50, "1-50"],
    [51, "51-100"],
    [100, "51-100"],
    [101, "101-500"],
    [500, "101-500"],
    [501, "501-1000"],
    [1000, "501-1000"],
  ] as const)("buckets keyword boundary %s", (keywordCount, bucket) => {
    const props = seoCostCalculatorProperties(
      { ...SEO_MIX_DEFAULTS, keywordCount, researchCount: 0 },
      "home",
      null,
    );
    expect(props.rank_volume).toBe(bucket);
    expect(props.research_volume).toBe("0");
    expect(analyticsEventSchemas.seo_cost_calculator_changed.safeParse(props).success).toBe(true);
  });
  it("rejects exact counts and arbitrary data rather than silently accepting them", () => {
    const props = seoCostCalculatorProperties(SEO_MIX_DEFAULTS, "pricing", "light");
    for (const patch of [
      { rank_volume: 100 },
      { keyword_count: 100 },
      { domain: "example.org" },
      { selection: "unknown" },
      { surface: "account" },
    ])
      expect(
        analyticsEventSchemas.seo_cost_calculator_changed.safeParse({ ...props, ...patch }).success,
      ).toBe(false);
  });
});
