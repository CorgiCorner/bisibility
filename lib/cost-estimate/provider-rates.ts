import { type ResolveProviderRateInput, resolveProviderRate } from "@/lib/provider-rates/resolver";
import type { ProviderRate } from "./estimate";

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

export type ProviderFeatureRate = {
  baseCostCents?: number;
  checkedAt: string;
  costCents: number;
  feature:
    | "backlinks_history"
    | "backlinks_rows"
    | "backlinks_summary"
    | "keyword_metrics"
    | "keyword_research_ideas"
    | "keyword_research_related"
    | "keyword_research_suggestions"
    | "ranked_keywords";
  providerId: string;
  sourceUrl: string;
  unitCostCents?: number;
};

export const PROVIDER_FEATURE_RATES: ProviderFeatureRate[] = [
  {
    checkedAt: "2026-07-22",
    costCents: 2,
    feature: "ranked_keywords",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/dataforseo-labs-api/pricing",
  },
  // provisional - finalize via scripts/backlinks-cost-profile
  {
    checkedAt: "2026-07-24",
    costCents: 2,
    feature: "backlinks_summary",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/backlinks-api/pricing",
  },
  // provisional - finalize via scripts/backlinks-cost-profile
  {
    checkedAt: "2026-07-24",
    costCents: 2,
    feature: "backlinks_history",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/backlinks-api/pricing",
  },
  // provisional - finalize via scripts/backlinks-cost-profile
  {
    baseCostCents: 0,
    checkedAt: "2026-07-24",
    costCents: 1,
    feature: "backlinks_rows",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/backlinks-api/pricing",
    unitCostCents: 0.01,
  },
  ...(
    [
      "keyword_research_related",
      "keyword_research_suggestions",
      "keyword_research_ideas",
      "keyword_metrics",
    ] as const
  ).map((feature) => ({
    baseCostCents: 1,
    checkedAt: "2026-07-22",
    costCents: 2,
    feature,
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/dataforseo-labs-api/pricing",
    unitCostCents: 0.01,
  })),
];

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

export function estimatedFeatureCostCents(
  rate: ProviderFeatureRate,
  itemCount: number,
  includeClickstream: boolean,
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">,
): number;
export function estimatedFeatureCostCents(
  rate: ProviderFeatureRate | null,
  itemCount: number,
  includeClickstream: boolean,
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">,
): number | null;
export function estimatedFeatureCostCents(
  rate: ProviderFeatureRate | null,
  itemCount: number,
  includeClickstream: boolean,
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">,
) {
  const scalesByItem = rate?.unitCostCents !== undefined;
  const listAmountCents = rate ? (scalesByItem ? rate.unitCostCents : rate.costCents) : null;
  const resolved = resolveProviderRate({
    entries: context.entries.map((entry) => ({
      ...entry,
      costCents: scalesByItem ? entry.unitCostCents : entry.costCents,
    })),
    list:
      rate && listAmountCents !== null
        ? {
            amountCents: listAmountCents,
            checkedAt: new Date(`${rate.checkedAt}T00:00:00.000Z`),
          }
        : null,
    manualAmountCents: context.manualAmountCents,
  });

  if (!("amountCents" in resolved)) return null;
  const amountCents = scalesByItem
    ? (rate?.baseCostCents ?? 0) + resolved.amountCents * itemCount
    : resolved.amountCents;
  // Clickstream refinement is a keyword-volume upsell; backlinks features never carry it.
  const clickstream = includeClickstream && !rate?.feature.startsWith("backlinks_");
  return amountCents * (clickstream ? 2 : 1);
}

export const SERP_RATES_CHECKED_AT = "2026-08-10";
