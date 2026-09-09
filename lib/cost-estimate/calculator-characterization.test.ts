import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ANONYMOUS_CALCULATOR_DEFAULTS, defaultsFromPrefill } from "./calculator-defaults";
import {
  buildCostCalculatorHref,
  calculatorInputOverridesFromSearchParams,
} from "./calculator-query";
import {
  type CheckVolumeInput,
  type CostEstimate,
  type EstimateFrequency,
  type EstimateSelection,
  estimateCost,
  estimateCostAtUnitRate,
} from "./estimate";
import {
  frequencyDeltaCents,
  monthlyChecksFor,
  monthlyCostCentsFor,
  runCostCents,
} from "./project-estimate";
import { PROVIDER_RATES } from "./provider-rates";

// Characterization of the calculator maths captured on the tree before the cost-estimate
// modules stopped importing the legacy market catalog. The inputs are literal on purpose:
// the depth ladder must not be read from the module whose import these tests guard.
const depths = [10, 20, 50, 100] as const;
const deviceModes = [
  ["desktop", 1],
  ["mobile", 1],
  ["both", 2],
] as const;
const frequencies: readonly EstimateFrequency[] = ["daily", "weekly", "monthly"];
const volumes = [
  [1, 1],
  [100, 1],
  [250, 3],
  [1000, 20],
] as const;
const selections: readonly (readonly [string, EstimateSelection])[] = [
  ["dataforseo", { optionKey: "standard" }],
  ["dataforseo", { optionKey: "priority" }],
  ["dataforseo", { optionKey: "live" }],
  ["serpapi", {}],
  ["serpapi", { planKey: "free" }],
  ["serpapi", { planKey: "starter" }],
  ["serpapi", { planKey: "developer" }],
  ["serpapi", { planKey: "production" }],
  ["serpapi", { planKey: "bigdata" }],
  ["local-sequence", { optionKey: "live" }],
];
const dataForSeo = { overrideCents: null, providerId: "dataforseo" };
const hundredKeywords = { deviceCount: 1, keywordCount: 100, locationCount: 1 } as const;

function rateFor(providerId: string) {
  const rate = PROVIDER_RATES.find((candidate) => candidate.providerId === providerId);
  if (!rate) throw new Error(`Unknown provider rate: ${providerId}`);
  return rate;
}

function flatten(estimate: CostEstimate) {
  return {
    ...estimate,
    selectedOption: estimate.selectedOption?.key ?? null,
    selectedPlan: estimate.selectedPlan?.planKey ?? null,
  };
}

function estimate(providerId: string, selection: EstimateSelection, volume: CheckVolumeInput) {
  return flatten(estimateCost(volume, rateFor(providerId), selection));
}

function fullGrid() {
  const rows: unknown[] = [];
  for (const [providerId, selection] of selections) {
    for (const depth of depths) {
      for (const [devices, deviceCount] of deviceModes) {
        for (const frequency of frequencies) {
          for (const [keywordCount, locationCount] of volumes) {
            const volume = { depth, deviceCount, frequency, keywordCount, locationCount };
            rows.push([
              providerId,
              selection,
              depth,
              devices,
              frequency,
              keywordCount,
              locationCount,
              estimate(providerId, selection, volume),
            ]);
          }
        }
      }
    }
  }
  return rows;
}

describe("cost calculator characterization", () => {
  it("keeps the anonymous defaults", () => {
    expect(ANONYMOUS_CALCULATOR_DEFAULTS).toEqual({
      inputs: {
        depth: 20,
        devices: "desktop",
        flatOptionKey: "live",
        frequency: "daily",
        keywordCount: 100,
        locationCount: 1,
        planKey: "auto",
        providerId: "dataforseo",
      },
    });
  });

  it("prices the anonymous defaults on DataForSEO live", () => {
    expect(
      estimate(
        "dataforseo",
        { optionKey: "live" },
        { ...hundredKeywords, depth: 20, frequency: "daily" },
      ),
    ).toEqual({
      billingUnitsPerCheck: 2,
      checksPerRun: 100,
      effectiveCostPerCheckCents: 0.35,
      exceedsLargestPlan: false,
      exceedsSelectedPlan: false,
      monthlyBillingUnits: 6000,
      monthlyChecks: 3000,
      monthlyCostCents: 1050,
      selectedOption: "live",
      selectedPlan: null,
    });
  });

  it.each([
    [
      "standard queue, top 100, both devices, weekly, 250 x 3",
      "dataforseo",
      { optionKey: "standard" },
      { depth: 100, deviceCount: 2, frequency: "weekly", keywordCount: 250, locationCount: 3 },
      {
        monthlyBillingUnits: 60000,
        monthlyChecks: 6000,
        monthlyCostCents: 2790,
        selectedOption: "standard",
      },
    ],
    [
      "priority queue, top 10, mobile, monthly, 1 x 1",
      "dataforseo",
      { optionKey: "priority" },
      { depth: 10, deviceCount: 1, frequency: "monthly", keywordCount: 1, locationCount: 1 },
      {
        monthlyBillingUnits: 1,
        monthlyChecks: 1,
        monthlyCostCents: 0.12,
        selectedOption: "priority",
      },
    ],
    [
      "self-hosted sequence, top 50, daily, 100 x 1",
      "local-sequence",
      { optionKey: "live" },
      { ...hundredKeywords, depth: 50, frequency: "daily" },
      {
        monthlyBillingUnits: 15000,
        monthlyChecks: 3000,
        monthlyCostCents: 0,
        selectedOption: "live",
      },
    ],
  ] as const)("prices flat rates: %s", (_label, providerId, selection, volume, expected) => {
    expect(estimate(providerId, selection, volume)).toMatchObject(expected);
  });

  it.each([
    [
      "auto plan, top 20, daily, 100 x 1",
      {},
      { ...hundredKeywords, depth: 20, frequency: "daily" },
      {
        exceedsLargestPlan: false,
        exceedsSelectedPlan: false,
        monthlyCostCents: 15000,
        selectedPlan: "production",
      },
    ],
    [
      "auto plan beyond the ladder, top 100, both devices, daily, 1000 x 20",
      {},
      { depth: 100, deviceCount: 2, frequency: "daily", keywordCount: 1000, locationCount: 20 },
      {
        exceedsLargestPlan: true,
        exceedsSelectedPlan: true,
        monthlyBillingUnits: 12000000,
        monthlyCostCents: 27500,
        selectedPlan: "bigdata",
      },
    ],
    [
      "pinned free plan over its allowance, top 50, weekly, 100 x 1",
      { planKey: "free" },
      { ...hundredKeywords, depth: 50, frequency: "weekly" },
      {
        exceedsLargestPlan: false,
        exceedsSelectedPlan: true,
        monthlyBillingUnits: 2000,
        monthlyCostCents: 0,
        selectedPlan: "free",
      },
    ],
    [
      "pinned big data plan on a single check",
      { planKey: "bigdata" },
      { depth: 10, deviceCount: 1, frequency: "monthly", keywordCount: 1, locationCount: 1 },
      {
        effectiveCostPerCheckCents: 27500,
        exceedsSelectedPlan: false,
        monthlyCostCents: 27500,
        selectedPlan: "bigdata",
      },
    ],
  ] as const)("prices SerpApi plans: %s", (_label, selection, volume, expected) => {
    expect(estimate("serpapi", selection, volume)).toMatchObject(expected);
  });

  it("prices the configured-rate comparison at a unit rate", () => {
    expect(
      flatten(estimateCostAtUnitRate({ ...hundredKeywords, depth: 20, frequency: "daily" }, 0.5)),
    ).toMatchObject({ billingUnitsPerCheck: 1, monthlyChecks: 3000, monthlyCostCents: 1500 });
  });

  it("keeps the full pricing grid byte-identical", () => {
    const rows = fullGrid();
    expect(rows).toHaveLength(1440);
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe(
      "f33e6c468cf2ee008c929a3378c454a4b436d31d6114dd350f7e2c8e96c753d1",
    );
  });

  it.each([
    [10, { cron: 320, daily: 600, monthly: 20, weekly: 80 }],
    [20, { cron: 560, daily: 1050, monthly: 35, weekly: 140 }],
    [50, { cron: 1280, daily: 2400, monthly: 80, weekly: 320 }],
    [100, { cron: 2480, daily: 4650, monthly: 155, weekly: 620 }],
  ] as const)("prices project schedules at top %s", (depth, expected) => {
    const monthly = (frequency: "daily" | "weekly" | "monthly") =>
      monthlyCostCentsFor({ ...hundredKeywords, depth, frequency }, dataForSeo);
    expect({
      cron: monthlyCostCentsFor(
        {
          ...hundredKeywords,
          cronExpression: "0 6 * * 1,4",
          depth,
          deviceCount: 2,
          frequency: "custom_cron",
        },
        dataForSeo,
      ),
      daily: monthly("daily"),
      monthly: monthly("monthly"),
      weekly: monthly("weekly"),
    }).toEqual(expected);
  });

  it("keeps run, volume and delta helpers", () => {
    const volume = { depth: 100, deviceCount: 2, keywordCount: 250, locationCount: 3 } as const;
    expect(runCostCents([10, 20, 50, 100], dataForSeo)).toBe(2.9000000000000004);
    expect(runCostCents([10, 20, 50, 100], { overrideCents: null, providerId: "serpapi" })).toBe(
      18,
    );
    expect(monthlyChecksFor({ ...volume, frequency: "daily" })).toBe(45000);
    expect(
      monthlyChecksFor({ ...volume, cronExpression: "0 6 * * 1,4", frequency: "custom_cron" }),
    ).toBe(12000);
    expect(
      frequencyDeltaCents({ ...hundredKeywords, depth: 50 }, "weekly", "daily", dataForSeo),
    ).toBe(2080);
  });

  it("round-trips every depth through the calculator link", () => {
    for (const depth of depths) {
      const href = buildCostCalculatorHref({
        depth,
        devices: ["desktop", "mobile"],
        flatOptionKey: "live",
        frequency: "daily",
        keywordCount: 100,
        locationCount: 2,
        providerId: "dataforseo",
      });
      expect(href).toBe(
        `/rank-tracking-cost-calculator?keywords=100&locations=2&devices=both&frequency=daily&depth=${depth}&provider=dataforseo&option=live`,
      );
      expect(calculatorInputOverridesFromSearchParams({ depth: String(depth) })).toEqual({ depth });
    }
    for (const depth of ["30", "0", "abc"]) {
      expect(calculatorInputOverridesFromSearchParams({ depth })).toBeUndefined();
    }
  });

  it("derives personalized defaults from a project prefill", () => {
    expect(
      defaultsFromPrefill({
        costPerCheckCents: 0.06,
        depth: 50,
        deviceCount: 2,
        devices: ["desktop", "mobile"],
        frequency: "weekly",
        keywordCount: 0,
        locationCount: 2,
        projectName: "Example",
        providerId: "dataforseo",
      }),
    ).toEqual({
      customCostPerCheckCents: 0.06,
      inputs: {
        depth: 50,
        devices: "both",
        flatOptionKey: "live",
        frequency: "weekly",
        keywordCount: 1,
        locationCount: 2,
        providerId: "dataforseo",
      },
      personalizedFrom: "Example",
    });
    expect(
      defaultsFromPrefill({
        costPerCheckCents: null,
        depth: 10,
        deviceCount: 1,
        devices: ["mobile"],
        frequency: "monthly",
        keywordCount: 12,
        locationCount: 1,
        projectName: "Example",
        providerId: "unknown",
      }),
    ).toEqual({
      inputs: {
        depth: 10,
        devices: "mobile",
        flatOptionKey: "live",
        frequency: "monthly",
        keywordCount: 12,
        locationCount: 1,
        providerId: "dataforseo",
      },
      personalizedFrom: "Example",
    });
  });
});
