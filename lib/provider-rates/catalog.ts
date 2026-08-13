import {
  domainOverviewRates,
  estimatedFeatureCostCents,
  keywordMetricsRate,
  keywordResearchRate,
  rankedKeywordPageRate,
  rateForProvider,
} from "@/lib/cost-estimate/provider-rates";
import { serpProviderCapabilities } from "@/lib/providers/registry";
import { defaultCostPerCheckCents } from "@/lib/rank-check/default-cost";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import type { ProviderRateFeature } from "./resolver";
import { LIST_PROVIDER_RATE_CONTEXT } from "./resolver";

export const PROVIDER_RATE_LABELS = {
  keyword_metrics: "Keyword metrics",
  keyword_research: "Keyword research",
  rank_check: "Rank check",
  ranked_keywords: "Ranked keywords",
} as const satisfies Record<ProviderRateFeature, string>;

export const PROVIDER_RATE_UNITS = {
  keyword_metrics: "calls",
  keyword_research: "calls",
  rank_check: "checks",
  ranked_keywords: "calls",
} as const satisfies Record<ProviderRateFeature, string>;

function checkedAt(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function providerRateFeatures(providerId: string): ProviderRateFeature[] {
  const capabilities = serpProviderCapabilities(providerId);
  if (!capabilities) return [];

  const features: ProviderRateFeature[] = ["rank_check"];
  if (capabilities.keywordResearch) features.push("keyword_research");
  if (capabilities.keywordMetrics) features.push("keyword_metrics");
  if (capabilities.rankedKeywords) features.push("ranked_keywords");
  return features;
}

function researchListRate(providerId: string) {
  return (
    keywordResearchRate(providerId, "related") ??
    keywordResearchRate(providerId, "suggestions") ??
    keywordResearchRate(providerId, "ideas")
  );
}

export function providerListRate(
  providerId: string,
  feature: ProviderRateFeature,
  depth: SerpDepth = DEFAULT_SERP_DEPTH,
) {
  if (feature === "rank_check") {
    const rate = rateForProvider(providerId);
    return rate
      ? {
          amountCents: defaultCostPerCheckCents(providerId, depth),
          checkedAt: checkedAt(rate.checkedAt),
        }
      : null;
  }

  const featureRate =
    feature === "keyword_research"
      ? researchListRate(providerId)
      : feature === "keyword_metrics"
        ? keywordMetricsRate(providerId)
        : rankedKeywordPageRate(providerId);
  if (!featureRate) return null;
  const amountCents = featureRate.unitCostCents ?? featureRate.costCents;
  return { amountCents, checkedAt: checkedAt(featureRate.checkedAt) };
}

export function providerDomainOverviewListRates(providerId: string) {
  if (!serpProviderCapabilities(providerId)?.domainOverview) return [];
  const rates = domainOverviewRates(providerId);
  const rows = [
    {
      feature: "domain_rank_overview" as const,
      itemCount: 1,
      label: "Domain overview",
      rate: rates.overview,
      unit: "calls",
    },
    {
      feature: "historical_rank_overview" as const,
      itemCount: 1,
      label: "Organic history",
      rate: rates.history,
      unit: "calls",
    },
    {
      feature: "relevant_pages" as const,
      itemCount: 100,
      label: "Relevant pages (100)",
      rate: rates.pages,
      unit: "loads",
    },
  ];
  return rows.flatMap((row) => {
    if (!row.rate) return [];
    return [
      {
        amountCents: estimatedFeatureCostCents(
          row.rate,
          row.itemCount,
          false,
          LIST_PROVIDER_RATE_CONTEXT,
        ),
        checkedAt: checkedAt(row.rate.checkedAt),
        editable: false as const,
        feature: row.feature,
        label: row.label,
        source: "list" as const,
        unit: row.unit,
      },
    ];
  });
}
