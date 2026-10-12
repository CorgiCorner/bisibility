import { dataforseo, serpapi } from "@usagekit/providers";
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

function serpPrice(priority?: string) {
  const operation = priority
    ? "serp.google.organic.task_post"
    : "serp.google.organic.live.advanced";
  const row = dataforseo.descriptor.prices.find(
    (price) => price.operation === operation && (!priority || price.option?.priority === priority),
  );
  if (row?.unit !== "cents" || row.calculation?.kind !== "additional_pages")
    throw new Error("Provider list price is unavailable");
  return row;
}
const livePrice = serpPrice();
function queueOption(key: string, label: string, turnaround: string, priority?: string) {
  const price = serpPrice(priority);
  if (price.calculation?.kind !== "additional_pages") throw new Error("Missing page formula");
  const base = Number(price.perUnit);
  return {
    key,
    label,
    shortLabel: key === "standard" ? "Standard" : key === "priority" ? "Priority" : "Live",
    turnaround,
    unitCostCents: base,
    additionalPageCostCents: Number(
      (base * Number(price.calculation.additionalPageFactor)).toFixed(6),
    ),
  };
}

export const DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS = Number(livePrice.perUnit);

export const PROVIDER_RATES: ProviderRate[] = [
  {
    providerId: dataforseo.descriptor.id,
    label: dataforseo.descriptor.label,
    pricingModel: "flat",
    sourceUrl: dataforseo.descriptor.docs.pricing,
    checkedAt: livePrice.checkedAt,
    notes:
      "Reserve the full base rate for each requested SERP page. Actual provider receipts determine the final cost.",
    options: [
      queueOption("standard", "Standard queue", "~5 min", "normal"),
      queueOption("priority", "Priority queue", "~1 min", "high"),
      queueOption("live", "Live", "~6 s"),
    ],
  },
  {
    providerId: serpapi.descriptor.id,
    label: serpapi.descriptor.label,
    pricingModel: "plan",
    sourceUrl: serpapi.descriptor.docs.pricing,
    checkedAt: serpapi.descriptor.prices[0]?.checkedAt ?? "",
    notes:
      "Subscription plans; only successful searches count; unused searches do not roll over. Enterprise tier not modeled.",
    plans: (serpapi.descriptor.plans ?? []).flatMap((plan) => {
      if (!plan.subscription || !plan.allowance) return [];
      return [
        {
          planKey: plan.id,
          label: plan.label,
          monthlyPriceCents: Number(plan.subscription.fee.units) / 10000,
          includedChecks: Number(plan.allowance.value),
        },
      ];
    }),
  },
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

export const SERP_RATES_CHECKED_AT = livePrice.checkedAt;
