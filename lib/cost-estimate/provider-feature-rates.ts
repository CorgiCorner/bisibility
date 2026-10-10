import { type ResolveProviderRateInput, resolveProviderRate } from "@/lib/provider-rates/resolver";

export type ProviderFeatureRate = {
  baseCostCents?: number;
  checkedAt: string;
  costCents: number;
  feature:
    | "ai_tracking"
    | "ai_visibility"
    | "prompt_explorer"
    | "backlinks_history"
    | "backlinks_rows"
    | "backlinks_summary"
    | "domain_rank_overview"
    | "historical_rank_overview"
    | "keyword_metrics"
    | "keyword_research_ideas"
    | "keyword_research_related"
    | "keyword_research_suggestions"
    | "ranked_keywords"
    | "relevant_pages";
  providerId: string;
  sourceUrl: string;
  unitCostCents?: number;
};

export const PROVIDER_FEATURE_RATES: ProviderFeatureRate[] = [
  {
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature: "ranked_keywords",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
  },
  // provisional - finalize via scripts/backlinks-cost-profile
  {
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature: "backlinks_summary",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/backlinks/backlinks",
  },
  // provisional - finalize via scripts/backlinks-cost-profile
  {
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature: "backlinks_history",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/backlinks/backlinks",
  },
  // Backlinks: $0.024 per request + $0.000036 per row (checked 2026-10-01).
  {
    baseCostCents: 2.4,
    checkedAt: "2026-10-01",
    costCents: 2.76,
    feature: "backlinks_rows",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/backlinks/backlinks",
    unitCostCents: 0.0036,
  },
  // Flat per-request figure, raised 20% per DataForSEO's July 1, 2026 Labs price update.
  {
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature: "domain_rank_overview",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
  },
  // provisional - finalize via scripts/domain-overview-cost-profile
  {
    baseCostCents: 12,
    checkedAt: "2026-10-01",
    costCents: 12,
    feature: "historical_rank_overview",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
    unitCostCents: 0.12,
  },
  // Labs "all other endpoints": $0.012 per task + $0.00012 per item (checked 2026-10-01).
  {
    baseCostCents: 1.2,
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature: "relevant_pages",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
    unitCostCents: 0.012,
  },
  ...(
    [
      "keyword_research_related",
      "keyword_research_suggestions",
      "keyword_research_ideas",
      "keyword_metrics",
    ] as const
  ).map((feature) => ({
    baseCostCents: 1.2,
    checkedAt: "2026-10-01",
    costCents: 2.4,
    feature,
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
    unitCostCents: 0.012,
  })),
];

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
