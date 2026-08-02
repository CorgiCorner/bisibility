import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  backlinksRates,
  estimatedFeatureCostCents,
  keywordMetricsRate,
  keywordResearchRate,
  PROVIDER_FEATURE_RATES,
  PROVIDER_RATES,
  rankedKeywordPageRate,
  rateForProvider,
  SELECTABLE_PROVIDER_RATES,
  SERP_RATES_CHECKED_AT,
} from "./provider-rates";

const checkedAtSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const baseProviderRateSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1),
  sourceUrl: z.string().regex(/^https:\/\//),
  checkedAt: checkedAtSchema,
  notes: z.string().optional(),
});
const flatOptionSchema = z.object({
  additionalPageCostCents: z.number().min(0),
  key: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().min(1).max(12),
  turnaround: z.string().min(1),
  unitCostCents: z.number().min(0),
});
const providerPlanSchema = z.object({
  planKey: z.string().min(1),
  label: z.string().min(1),
  monthlyPriceCents: z.number().min(0),
  includedChecks: z.number().int().positive(),
});
const providerRateSchema = z.discriminatedUnion("pricingModel", [
  baseProviderRateSchema.extend({
    pricingModel: z.literal("flat"),
    options: z.array(flatOptionSchema).min(1),
  }),
  baseProviderRateSchema.extend({
    pricingModel: z.literal("plan"),
    plans: z.array(providerPlanSchema).min(1),
  }),
]);

function uniqueValues(values: string[]) {
  return new Set(values).size === values.length;
}

function backlinksCostCents(
  rate: ReturnType<typeof backlinksRates>["rows"],
  itemCount: number,
  includeClickstream = false,
) {
  const amountCents = estimatedFeatureCostCents(
    rate,
    itemCount,
    includeClickstream,
    LIST_PROVIDER_RATE_CONTEXT,
  );
  expect(amountCents).not.toBeNull();
  return amountCents ?? 0;
}

describe("provider rates", () => {
  it("matches the verified rate schema and internal ordering rules", () => {
    expect(() => z.array(providerRateSchema).parse(PROVIDER_RATES)).not.toThrow();

    for (const rate of PROVIDER_RATES) {
      if (rate.pricingModel === "flat") {
        expect(uniqueValues(rate.options.map((option) => option.key))).toBe(true);
        continue;
      }

      expect(uniqueValues(rate.plans.map((plan) => plan.planKey))).toBe(true);
      expect(rate.plans.map((plan) => plan.includedChecks)).toEqual(
        [...rate.plans]
          .sort((a, b) => a.includedChecks - b.includedChecks)
          .map((plan) => plan.includedChecks),
      );
    }
  });

  it("covers the SERP providers exposed by the provider catalog", () => {
    const providerIds = PROVIDER_RATES.map((rate) => rate.providerId);
    const catalogIds = PROVIDER_CATALOG.filter((provider) => provider.kind === "serp").map(
      (provider) => provider.id,
    );

    // Self-hosted rates are the ones the catalog gates out of a hosted deployment, so they
    // are the expected difference between the rate table and the catalog.
    const selfHostedIds = PROVIDER_RATES.filter((rate) => rate.selfHosted).map(
      (rate) => rate.providerId,
    );

    expect(new Set(providerIds)).toEqual(new Set([...catalogIds, ...selfHostedIds]));
    expect(rateForProvider("dataforseo")?.label).toBe("DataForSEO");
    expect(rateForProvider("missing")).toBeNull();
  });

  it("keeps self-hosted providers out of the rates offered in the public calculator", () => {
    const selfHosted = PROVIDER_RATES.filter((rate) => rate.selfHosted);

    // Without this the exclusion would be vacuously true.
    expect(selfHosted.length).toBeGreaterThan(0);
    expect(SELECTABLE_PROVIDER_RATES.some((rate) => rate.selfHosted)).toBe(false);
    expect(SELECTABLE_PROVIDER_RATES).toHaveLength(PROVIDER_RATES.length - selfHosted.length);
    // A self-hosted rate must still resolve for in-app estimates, and must never be the
    // entry a `rates[0]` fallback lands on.
    for (const rate of selfHosted) {
      expect(rateForProvider(rate.providerId)?.selfHosted).toBe(true);
      expect(PROVIDER_RATES.indexOf(rate)).toBeGreaterThan(0);
    }
  });

  it("includes the verified SerpAPI public plan ladder", () => {
    const serpapi = rateForProvider("serpapi");

    expect(serpapi?.pricingModel).toBe("plan");
    expect(serpapi && "plans" in serpapi ? serpapi.plans.map((plan) => plan.planKey) : []).toEqual([
      "free",
      "starter",
      "developer",
      "production",
      "bigdata",
    ]);
    expect(serpapi?.checkedAt).toBe("2026-07-15");
  });

  it("pins the verified DataForSEO base and additional-page rates", () => {
    const dataforseo = rateForProvider("dataforseo");

    expect(dataforseo?.pricingModel).toBe("flat");
    expect(dataforseo && "options" in dataforseo ? dataforseo.options : []).toMatchObject([
      { key: "standard", unitCostCents: 0.06, additionalPageCostCents: 0.045 },
      { key: "priority", unitCostCents: 0.12, additionalPageCostCents: 0.09 },
      { key: "live", unitCostCents: 0.2, additionalPageCostCents: 0.15 },
    ]);
    expect(dataforseo?.notes).toContain("each additional page at 75%");
    expect(dataforseo?.checkedAt).toBe("2026-07-15");
    expect(SERP_RATES_CHECKED_AT).toBe("2026-07-15");
  });

  it("keeps ranked-keyword page pricing in the provider rate table", () => {
    expect(rankedKeywordPageRate("dataforseo")).toMatchObject({
      checkedAt: "2026-07-22",
      costCents: 2,
      feature: "ranked_keywords",
      providerId: "dataforseo",
    });
    expect(rankedKeywordPageRate("serpapi")).toBeNull();
    expect(PROVIDER_FEATURE_RATES).toHaveLength(8);
  });

  it("prices research sources and metrics by task plus returned item", () => {
    expect(keywordResearchRate("dataforseo", "related")).toMatchObject({
      baseCostCents: 1,
      unitCostCents: 0.01,
    });
    expect(keywordResearchRate("dataforseo", "suggestions")?.feature).toBe(
      "keyword_research_suggestions",
    );
    expect(keywordResearchRate("dataforseo", "ideas")?.feature).toBe("keyword_research_ideas");
    expect(keywordMetricsRate("dataforseo")?.feature).toBe("keyword_metrics");
    expect(
      estimatedFeatureCostCents(
        keywordMetricsRate("dataforseo"),
        100,
        false,
        LIST_PROVIDER_RATE_CONTEXT,
      ),
    ).toBe(2);
    expect(
      estimatedFeatureCostCents(
        keywordMetricsRate("dataforseo"),
        100,
        true,
        LIST_PROVIDER_RATE_CONTEXT,
      ),
    ).toBe(4);
  });

  it("routes feature overrides through the shared resolver", () => {
    expect(
      estimatedFeatureCostCents(keywordMetricsRate("dataforseo"), 100, false, {
        entries: [],
        manualAmountCents: 0,
      }),
    ).toBe(1);
  });

  it.each([
    ["manual", { entries: [], manualAmountCents: 0.01 }],
    [
      "measured",
      {
        entries: Array.from({ length: 5 }, () => ({
          cached: false,
          costCents: 1.1,
          createdAt: new Date("2026-07-27T00:00:00.000Z"),
          failed: false,
          unitCostCents: 0.01,
        })),
        manualAmountCents: null,
      },
    ],
    ["list", { entries: [], manualAmountCents: null }],
  ] as const)("applies item scaling uniformly to %s rates", (_source, context) => {
    expect(estimatedFeatureCostCents(keywordMetricsRate("dataforseo"), 1_000, false, context)).toBe(
      11,
    );
  });

  it("does not reuse a 10-item measured total for a 1000-item call", () => {
    const context = {
      entries: Array.from({ length: 5 }, () => ({
        cached: false,
        costCents: 1.1,
        createdAt: new Date("2026-07-27T00:00:00.000Z"),
        failed: false,
        unitCostCents: 0.01,
      })),
      manualAmountCents: null,
    };

    expect(estimatedFeatureCostCents(keywordMetricsRate("dataforseo"), 10, false, context)).toBe(
      1.1,
    );
    expect(estimatedFeatureCostCents(keywordMetricsRate("dataforseo"), 1_000, false, context)).toBe(
      11,
    );
  });

  it.each([
    { expectedCostCents: 5, resultLimit: 100 },
    { expectedCostCents: 7, resultLimit: 300 },
    { expectedCostCents: 9, resultLimit: 500 },
    { expectedCostCents: 14, resultLimit: 1_000 },
  ])(
    "estimates a domain backlinks analysis with $resultLimit rows at $expectedCostCents cents",
    ({ expectedCostCents, resultLimit }) => {
      const rates = backlinksRates("dataforseo");
      const costCents =
        backlinksCostCents(rates.summary, 0) +
        backlinksCostCents(rates.history, 0) +
        backlinksCostCents(rates.rows, resultLimit);

      expect(costCents).toBe(expectedCostCents);
    },
  );

  it.each([
    { expectedCostCents: 1, resultLimit: 100 },
    { expectedCostCents: 3, resultLimit: 300 },
  ])(
    "estimates loading $resultLimit more backlink rows at $expectedCostCents cents",
    ({ expectedCostCents, resultLimit }) => {
      expect(backlinksCostCents(backlinksRates("dataforseo").rows, resultLimit)).toBe(
        expectedCostCents,
      );
    },
  );

  it("does not apply the clickstream multiplier to backlinks features", () => {
    const rates = backlinksRates("dataforseo");

    expect(backlinksCostCents(rates.summary, 0, true)).toBe(2);
    expect(backlinksCostCents(rates.history, 0, true)).toBe(2);
    expect(backlinksCostCents(rates.rows, 100, true)).toBe(1);
  });

  it("skips backlink history pricing for page scope", () => {
    const rates = backlinksRates("dataforseo");
    const costCents = backlinksCostCents(rates.summary, 0) + backlinksCostCents(rates.rows, 100);

    expect(costCents).toBe(3);
  });

  it("keeps provider-rate verification fresh", () => {
    // Intentional CI staleness alarm: rate cards must be re-verified at least every 180 days.
    const maxAgeMs = 180 * 24 * 60 * 60 * 1000;
    const now = vi.getRealSystemTime();

    for (const rate of [...PROVIDER_RATES, ...PROVIDER_FEATURE_RATES]) {
      const checkedAt = new Date(`${rate.checkedAt}T00:00:00.000Z`);
      const ageMs = now - checkedAt.getTime();

      expect(ageMs).toBeGreaterThanOrEqual(0);
      expect(ageMs).toBeLessThanOrEqual(maxAgeMs);
    }
  });
});
