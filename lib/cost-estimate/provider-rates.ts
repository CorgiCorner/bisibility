import type { ProviderRate } from "./estimate";
import {
  estimatedFeatureCostCents,
  PROVIDER_FEATURE_RATES,
  type ProviderFeatureRate,
} from "./provider-feature-rates";

export {
  estimatedFeatureCostCents,
  PROVIDER_FEATURE_RATES,
  type ProviderFeatureRate,
} from "./provider-feature-rates";

export const DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS = 0.2;

export const PROVIDER_RATES: ProviderRate[] = [
  {
    providerId: "dataforseo",
    label: "DataForSEO",
    pricingModel: "flat",
    sourceUrl: "https://dataforseo.com/apis/serp-api/pricing",
    checkedAt: "2026-08-10",
    notes:
      "Pay-as-you-go; the first SERP page (top 10) is billed at the base rate and each additional page at 75% of it. The app records the provider-reported actual cost per check. $50 minimum account top-up.",
    options: [
      {
        additionalPageCostCents: 0.045,
        key: "standard",
        label: "Standard queue",
        shortLabel: "Standard",
        turnaround: "~5 min",
        unitCostCents: 0.06,
      },
      {
        additionalPageCostCents: 0.09,
        key: "priority",
        label: "Priority queue",
        shortLabel: "Priority",
        turnaround: "~1 min",
        unitCostCents: 0.12,
      },
      {
        additionalPageCostCents: 0.15,
        key: "live",
        label: "Live",
        shortLabel: "Live",
        turnaround: "~6 s",
        unitCostCents: DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS,
      },
    ],
  },
  {
    providerId: "serpapi",
    label: "SerpApi",
    pricingModel: "plan",
    sourceUrl: "https://serpapi.com/pricing",
    checkedAt: "2026-08-10",
    notes:
      "Subscription plans; only successful searches count; unused searches do not roll over. Enterprise tier not modeled.",
    plans: [
      { planKey: "free", label: "Free", monthlyPriceCents: 0, includedChecks: 250 },
      { planKey: "starter", label: "Starter", monthlyPriceCents: 2500, includedChecks: 1000 },
      { planKey: "developer", label: "Developer", monthlyPriceCents: 7500, includedChecks: 5000 },
      {
        planKey: "production",
        label: "Production",
        monthlyPriceCents: 15000,
        includedChecks: 15000,
      },
      { planKey: "bigdata", label: "Big Data", monthlyPriceCents: 27500, includedChecks: 30000 },
    ],
  },
  // Kept last so that a `rates[0]` fallback never lands on the self-hosted provider.
  {
    providerId: "local-sequence",
    label: "Local sequence",
    pricingModel: "flat",
    selfHosted: true,
    sourceUrl: "https://github.com/CorgiCorner/bisibility",
    checkedAt: "2026-07-26",
    notes: "Self-hosted deterministic provider with no external usage charge.",
    options: [
      {
        additionalPageCostCents: 0,
        key: "live",
        label: "Local",
        shortLabel: "Local",
        turnaround: "Immediate",
        unitCostCents: 0,
      },
    ],
  },
];

// Rates a visitor can actually subscribe to. The public cost calculator offers these; the
// self-hosted provider still resolves through rateForProvider() for in-app estimates.
export const SELECTABLE_PROVIDER_RATES: ProviderRate[] = PROVIDER_RATES.filter(
  (rate) => !rate.selfHosted,
);

export function rateForProvider(id: string): ProviderRate | null {
  return PROVIDER_RATES.find((rate) => rate.providerId === id) ?? null;
}

export function rankedKeywordPageRate(providerId: string): ProviderFeatureRate | null {
  return (
    PROVIDER_FEATURE_RATES.find(
      (rate) => rate.providerId === providerId && rate.feature === "ranked_keywords",
    ) ?? null
  );
}

export type KeywordResearchSource = "ideas" | "related" | "suggestions";

export function keywordResearchRate(
  providerId: string,
  source: KeywordResearchSource,
): ProviderFeatureRate | null {
  return (
    PROVIDER_FEATURE_RATES.find(
      (rate) => rate.providerId === providerId && rate.feature === `keyword_research_${source}`,
    ) ?? null
  );
}

export function keywordMetricsRate(providerId: string): ProviderFeatureRate | null {
  return (
    PROVIDER_FEATURE_RATES.find(
      (rate) => rate.providerId === providerId && rate.feature === "keyword_metrics",
    ) ?? null
  );
}

export function backlinksRates(providerId: string) {
  const rate = (feature: "backlinks_history" | "backlinks_rows" | "backlinks_summary") =>
    PROVIDER_FEATURE_RATES.find(
      (candidate) => candidate.providerId === providerId && candidate.feature === feature,
    ) ?? null;

  return {
    history: rate("backlinks_history"),
    rows: rate("backlinks_rows"),
    summary: rate("backlinks_summary"),
  };
}

export function domainOverviewRates(providerId: string) {
  const rate = (feature: "domain_rank_overview" | "historical_rank_overview" | "relevant_pages") =>
    PROVIDER_FEATURE_RATES.find(
      (candidate) => candidate.providerId === providerId && candidate.feature === feature,
    ) ?? null;

  return {
    history: rate("historical_rank_overview"),
    overview: rate("domain_rank_overview"),
    pages: rate("relevant_pages"),
  };
}

export function domainOverviewListEstimate(
  providerId: string,
  options: { keywordLimit?: number; pageLimit?: number } = {},
) {
  const context = { entries: [], manualAmountCents: null } as const;
  const rates = domainOverviewRates(providerId);
  const overview = estimatedFeatureCostCents(rates.overview, 1, false, context);
  const history = estimatedFeatureCostCents(rates.history, 1, false, context);
  const keywords = estimatedFeatureCostCents(
    rankedKeywordPageRate(providerId),
    options.keywordLimit ?? 100,
    false,
    context,
  );
  const pages = estimatedFeatureCostCents(rates.pages, options.pageLimit ?? 100, false, context);
  return {
    core:
      overview == null || keywords == null || pages == null ? null : overview + keywords + pages,
    history,
  };
}

export const SERP_RATES_CHECKED_AT = "2026-08-10";
