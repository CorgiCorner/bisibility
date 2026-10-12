import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import { formatQuantity } from "@usagekit/core";
import { dataforseo } from "@usagekit/providers";
import { beforeEach, expect, test, vi } from "vitest";
import { estimatedFeatureCostCents, PROVIDER_FEATURE_RATES } from "./provider-rates";

beforeEach(() => vi.setSystemTime(new Date("2026-10-11T12:00:00Z")));
const operations = [
  ["ranked_keywords", "dataforseo_labs.google.ranked_keywords.live"],
  ["domain_rank_overview", "dataforseo_labs.google.domain_rank_overview.live"],
  ["historical_rank_overview", "dataforseo_labs.google.historical_rank_overview.live"],
  ["relevant_pages", "dataforseo_labs.google.relevant_pages.live"],
  ["keyword_metrics", "dataforseo_labs.google.keyword_overview.live"],
  ["keyword_research_ideas", "dataforseo_labs.google.keyword_ideas.live"],
  ["keyword_research_related", "dataforseo_labs.google.related_keywords.live"],
  ["keyword_research_suggestions", "dataforseo_labs.google.keyword_suggestions.live"],
  ["backlinks_summary", "backlinks.summary.live"],
  ["backlinks_history", "backlinks.history.live"],
  ["backlinks_rows", "backlinks.backlinks.live"],
] as const;

test.each(operations)("%s estimates use the shared catalog formula", (feature, operation) => {
  const rate = PROVIDER_FEATURE_RATES.find((entry) => entry.feature === feature);
  if (!rate) throw new Error("Missing feature rate");
  for (const itemCount of [1, 100, 1000]) {
    for (const clickstream of [false, true]) {
      const quote = nativeProviderCatalog.estimate(
        { id: "fixture", provider: "dataforseo", fundingSource: "byok" },
        operation,
        {
          itemCount: String(itemCount),
          ...(feature.startsWith("backlinks_") ? {} : { clickstream: String(clickstream) }),
        },
      );
      const amount = quote.quantities.find((quantity) => quantity.unit === "cents");
      if (!amount) throw new Error("Missing quote amount");
      expect(
        estimatedFeatureCostCents(rate, itemCount, clickstream, {
          entries: [],
          manualAmountCents: null,
        }),
      ).toBe(Number(formatQuantity(amount)));
    }
  }
});

test.each([0, 1.55])(
  "ranked-keyword manual %s stays per call under every count",
  (manualAmountCents) => {
    const rate = PROVIDER_FEATURE_RATES.find((entry) => entry.feature === "ranked_keywords");
    if (!rate) throw new Error("Missing feature rate");
    for (const count of [1, 100, 1000]) {
      expect(estimatedFeatureCostCents(rate, count, true, { entries: [], manualAmountCents })).toBe(
        manualAmountCents,
      );
    }
  },
);

test.each(operations)("%s keeps descriptor source and verification date", (feature, operation) => {
  const row = dataforseo.descriptor.prices.find((price) => price.operation === operation);
  const rate = PROVIDER_FEATURE_RATES.find((entry) => entry.feature === feature);
  expect(row).toBeDefined();
  expect(rate).toMatchObject({ checkedAt: row?.checkedAt, sourceUrl: row?.source });
});
