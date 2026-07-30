import { centsToDollars } from "@/lib/format/currency";
import { describe, expect, it } from "vitest";
import {
  type CheckVolumeInput,
  checksPerRun,
  estimateCost,
  estimateCostAtUnitRate,
  flatPerCheckCostCents,
  frequencyFromRankCheckFrequency,
  monthlyChecks,
  type ProviderPlan,
  pagesPerCheck,
  selectPlan,
} from "./estimate";
import { PROVIDER_RATES } from "./provider-rates";

const serpPlans: ProviderPlan[] = [
  { planKey: "free", label: "Free", monthlyPriceCents: 0, includedChecks: 250 },
  { planKey: "starter", label: "Starter", monthlyPriceCents: 2500, includedChecks: 1000 },
  { planKey: "developer", label: "Developer", monthlyPriceCents: 7500, includedChecks: 5000 },
  { planKey: "production", label: "Production", monthlyPriceCents: 15000, includedChecks: 15000 },
  { planKey: "bigdata", label: "Big Data", monthlyPriceCents: 27500, includedChecks: 30000 },
];

describe("cost estimate volume math", () => {
  it("matches the settings fixture golden value", () => {
    const estimate = estimateCostAtUnitRate(
      { depth: 100, keywordCount: 248, locationCount: 1, deviceCount: 1, frequency: "daily" },
      0.06,
    );

    expect(estimate.checksPerRun).toBe(248);
    expect(estimate.monthlyChecks).toBe(7440);
    expect(estimate.billingUnitsPerCheck).toBe(1);
    expect(estimate.monthlyBillingUnits).toBe(7440);
    expect(estimate.monthlyCostCents).toBeCloseTo(446.4);
    expect(centsToDollars(estimate.monthlyCostCents).toFixed(2)).toBe("4.46");
  });

  it("accounts for devices and frequency run counts", () => {
    const base: CheckVolumeInput = {
      depth: 100,
      keywordCount: 10,
      locationCount: 1,
      deviceCount: 1,
      frequency: "weekly",
    };

    expect(checksPerRun({ ...base, deviceCount: 2 })).toBe(20);
    expect(monthlyChecks({ ...base, deviceCount: 2 })).toBe(80);
    expect(monthlyChecks({ ...base, deviceCount: 2, frequency: "monthly" })).toBe(20);
  });

  it("clamps zero and negative keyword counts to zero checks", () => {
    const estimate = estimateCostAtUnitRate(
      {
        depth: 100,
        keywordCount: -3,
        locationCount: 0,
        deviceCount: -2,
        frequency: "daily",
      },
      0.06,
    );

    expect(estimate.checksPerRun).toBe(0);
    expect(estimate.monthlyChecks).toBe(0);
    expect(estimate.effectiveCostPerCheckCents).toBe(0);
    expect(Number.isFinite(estimate.effectiveCostPerCheckCents)).toBe(true);
  });

  it("normalizes non-finite and fractional dimensions", () => {
    expect(
      checksPerRun({
        depth: 100,
        keywordCount: Number.NaN,
        locationCount: Number.POSITIVE_INFINITY,
        deviceCount: 2.9,
        frequency: "daily",
      }),
    ).toBe(0);
    expect(
      checksPerRun({
        depth: 100,
        keywordCount: 3.9,
        locationCount: 2.8,
        deviceCount: 1.9,
        frequency: "daily",
      }),
    ).toBe(6);
  });
});

describe("provider plan selection", () => {
  it("selects the smallest covering plan and reports overages", () => {
    expect(selectPlan(serpPlans, 250)).toEqual({ plan: serpPlans[0], exceeds: false });
    expect(selectPlan(serpPlans, 251)).toEqual({ plan: serpPlans[1], exceeds: false });
    expect(selectPlan(serpPlans, 1001)).toEqual({ plan: serpPlans[2], exceeds: false });
    expect(selectPlan(serpPlans, 30_001)).toEqual({ plan: serpPlans[4], exceeds: true });
  });

  it("rejects an empty plan list", () => {
    expect(() => selectPlan([], 10)).toThrow("Provider plans must not be empty");
  });

  it("breaks equal-price ties in favor of the smaller covering plan", () => {
    const plans = [
      { planKey: "large", label: "Large", monthlyPriceCents: 1000, includedChecks: 500 },
      { planKey: "small", label: "Small", monthlyPriceCents: 1000, includedChecks: 100 },
      { planKey: "expensive", label: "Expensive", monthlyPriceCents: 2000, includedChecks: 1000 },
    ];
    expect(selectPlan(plans, 50)).toEqual({ plan: plans[1], exceeds: false });
  });

  it("selects the largest capacity rather than the last plan on overflow", () => {
    const plans = [serpPlans[4], serpPlans[0], serpPlans[2]];
    expect(selectPlan(plans, 100_000)).toEqual({ plan: serpPlans[4], exceeds: true });
  });

  it("supports flat rates, explicit options, and empty-option validation", () => {
    const rate = {
      providerId: "flat",
      label: "Flat",
      sourceUrl: "https://example.com",
      checkedAt: "2026-07-11",
      pricingModel: "flat" as const,
      options: [
        {
          additionalPageCostCents: 0,
          key: "slow",
          label: "Slow",
          shortLabel: "S",
          turnaround: "day",
          unitCostCents: 2,
        },
        {
          additionalPageCostCents: 0,
          key: "fast",
          label: "Fast",
          shortLabel: "F",
          turnaround: "hour",
          unitCostCents: 4,
        },
      ],
    };
    const estimate = estimateCost(
      { depth: 10, keywordCount: 2, locationCount: 1, deviceCount: 1, frequency: "monthly" },
      rate,
      { optionKey: "fast" },
    );
    expect(estimate).toMatchObject({ monthlyCostCents: 8, selectedOption: rate.options[1] });
    expect(() =>
      estimateCost(
        { depth: 10, keywordCount: 1, locationCount: 1, deviceCount: 1, frequency: "monthly" },
        { ...rate, options: [] },
      ),
    ).toThrow("Flat provider rates must include at least one option");
  });

  it("uses plan pricing for plan-model estimates", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 100, locationCount: 1, deviceCount: 1, frequency: "daily" },
      {
        providerId: "serpapi",
        label: "SerpAPI",
        sourceUrl: "https://serpapi.com/pricing",
        checkedAt: "2026-07-03",
        pricingModel: "plan",
        plans: serpPlans,
      },
    );

    expect(estimate.monthlyChecks).toBe(3000);
    expect(estimate.monthlyBillingUnits).toBe(30_000);
    expect(estimate.monthlyCostCents).toBe(27_500);
    expect(estimate.effectiveCostPerCheckCents).toBeCloseTo(9.1667, 4);
    expect(estimate.selectedPlan).toBe(serpPlans[4]);
    expect(estimate.selectedOption).toBeNull();
    expect(estimate.exceedsSelectedPlan).toBe(false);
  });

  it("uses a pinned plan and flags volume above that plan", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 50, locationCount: 1, deviceCount: 1, frequency: "daily" },
      {
        providerId: "serpapi",
        label: "SerpAPI",
        sourceUrl: "https://serpapi.com/pricing",
        checkedAt: "2026-07-04",
        pricingModel: "plan",
        plans: serpPlans,
      },
      { planKey: "starter" },
    );

    expect(estimate.monthlyChecks).toBe(1500);
    expect(estimate.monthlyCostCents).toBe(2500);
    expect(estimate.selectedPlan).toBe(serpPlans[1]);
    expect(estimate.exceedsLargestPlan).toBe(false);
    expect(estimate.exceedsSelectedPlan).toBe(true);
  });

  it("uses a pinned plan larger than volume without overflow", () => {
    const estimate = estimateCost(
      { depth: 10, keywordCount: 50, locationCount: 1, deviceCount: 1, frequency: "daily" },
      {
        providerId: "serpapi",
        label: "SerpAPI",
        sourceUrl: "https://serpapi.com/pricing",
        checkedAt: "2026-07-04",
        pricingModel: "plan",
        plans: serpPlans,
      },
      { planKey: "production" },
    );

    expect(estimate.monthlyChecks).toBe(1500);
    expect(estimate.selectedPlan).toBe(serpPlans[3]);
    expect(estimate.exceedsSelectedPlan).toBe(false);
    expect(estimate.effectiveCostPerCheckCents).toBeCloseTo(10);
  });

  it("falls back to auto selection for unknown pinned plans", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 50, locationCount: 1, deviceCount: 1, frequency: "daily" },
      {
        providerId: "serpapi",
        label: "SerpAPI",
        sourceUrl: "https://serpapi.com/pricing",
        checkedAt: "2026-07-04",
        pricingModel: "plan",
        plans: serpPlans,
      },
      { planKey: "missing" },
    );

    expect(estimate.monthlyChecks).toBe(1500);
    expect(estimate.selectedPlan).toBe(serpPlans[3]);
    expect(estimate.exceedsSelectedPlan).toBe(false);
  });
});

describe("rank-check frequency mapping", () => {
  it.each([
    ["daily", "daily"],
    ["weekly", "weekly"],
    ["monthly", "monthly"],
    ["manual", "monthly"],
    ["paused", "monthly"],
    ["custom_cron", "monthly"],
  ] as const)("maps %s to %s", (frequency, expected) => {
    expect(frequencyFromRankCheckFrequency(frequency)).toBe(expected);
  });
});

describe("depth-aware flat pricing", () => {
  const dataforseo = PROVIDER_RATES.find((rate) => rate.providerId === "dataforseo");
  if (dataforseo?.pricingModel !== "flat") {
    throw new Error("DataForSEO flat rates are required for cost estimate tests");
  }
  const options = dataforseo.options;

  it("derives pages per check from the runtime depth", () => {
    expect(pagesPerCheck(10)).toBe(1);
    expect(pagesPerCheck(20)).toBe(2);
    expect(pagesPerCheck(50)).toBe(5);
    expect(pagesPerCheck(100)).toBe(10);
  });

  it("prices a top-100 check at base plus nine discounted pages", () => {
    const live = options.find((option) => option.key === "live");
    const standard = options.find((option) => option.key === "standard");
    const priority = options.find((option) => option.key === "priority");
    if (!(live && standard && priority)) {
      throw new Error("All DataForSEO rate options are required for cost estimate tests");
    }

    expect(flatPerCheckCostCents(live, 100)).toBeCloseTo(1.55, 6);
    expect(flatPerCheckCostCents(standard, 100)).toBeCloseTo(0.465, 6);
    expect(flatPerCheckCostCents(priority, 100)).toBeCloseTo(0.93, 6);
    expect(centsToDollars(flatPerCheckCostCents(standard, 100))).toBeCloseTo(0.00465, 6);
  });

  it("estimates 30,000 monthly Live top-100 checks at $465", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 1000, locationCount: 1, deviceCount: 1, frequency: "daily" },
      dataforseo,
      { optionKey: "live" },
    );

    expect(estimate.monthlyChecks).toBe(30_000);
    expect(estimate.monthlyCostCents).toBeCloseTo(46_500, 3);
    expect(estimate.billingUnitsPerCheck).toBe(10);
  });

  it("estimates 30,000 monthly Live top-10 checks at $60", () => {
    const estimate = estimateCost(
      { depth: 10, keywordCount: 1000, locationCount: 1, deviceCount: 1, frequency: "daily" },
      dataforseo,
      { optionKey: "live" },
    );

    expect(estimate.monthlyChecks).toBe(30_000);
    expect(estimate.monthlyCostCents).toBeCloseTo(6_000, 3);
    expect(estimate.billingUnitsPerCheck).toBe(1);
    expect(estimate.monthlyBillingUnits).toBe(30_000);
  });
});

describe("plan selection by searches", () => {
  const serpapi = PROVIDER_RATES.find((rate) => rate.providerId === "serpapi");
  if (serpapi?.pricingModel !== "plan") {
    throw new Error("SerpAPI plans are required for cost estimate tests");
  }

  it("selects the plan covering checks times searches per check", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 250, locationCount: 1, deviceCount: 1, frequency: "weekly" },
      serpapi,
    );

    expect(estimate.monthlyChecks).toBe(1000);
    expect(estimate.monthlyBillingUnits).toBe(10_000);
    expect(estimate.selectedPlan?.planKey).toBe("production");
    expect(estimate.exceedsLargestPlan).toBe(false);
  });

  it("selects Developer for 3,000 top-10 checks", () => {
    const estimate = estimateCost(
      { depth: 10, keywordCount: 100, locationCount: 1, deviceCount: 1, frequency: "daily" },
      serpapi,
    );

    expect(estimate.monthlyChecks).toBe(3_000);
    expect(estimate.billingUnitsPerCheck).toBe(1);
    expect(estimate.monthlyBillingUnits).toBe(3_000);
    expect(estimate.selectedPlan?.planKey).toBe("developer");
  });

  it("flags volumes beyond Big Data as exceeding all plans", () => {
    const estimate = estimateCost(
      { depth: 100, keywordCount: 1000, locationCount: 1, deviceCount: 1, frequency: "daily" },
      serpapi,
    );

    expect(estimate.monthlyBillingUnits).toBe(300_000);
    expect(estimate.exceedsLargestPlan).toBe(true);
  });

  it("uses one billing unit per top-10 check regardless of flat-rate options", () => {
    const estimate = estimateCost(
      { depth: 10, keywordCount: 100, locationCount: 1, deviceCount: 1, frequency: "daily" },
      serpapi,
      { optionKey: "live" },
    );

    expect(estimate.monthlyChecks).toBe(3_000);
    expect(estimate.monthlyBillingUnits).toBe(3_000);
    expect(estimate.selectedPlan?.planKey).toBe("developer");
  });
});
