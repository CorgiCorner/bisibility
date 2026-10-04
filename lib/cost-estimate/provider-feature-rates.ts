import { type ResolveProviderRateInput, resolveProviderRate } from "@/lib/provider-rates/resolver";

export type ProviderFeatureRate = {
  baseCostCents?: number;
  checkedAt: string;
  costCents: number;
  feature:
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
  // backlinks/live bills a per-request base plus a per-row component; a 100-row page
  // returned task.cost 0.03 (lib/providers/serp/fixtures/backlinks/backlinks-success.json).
  {
    baseCostCents: 2,
    checkedAt: "2026-09-21",
    costCents: 3,
    feature: "backlinks_rows",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/apis/backlinks-api/pricing",
    unitCostCents: 0.01,
  },
  // domain_rank_overview/live is a flat per-request charge; measured task.cost 0.02
  // (lib/providers/serp/fixtures/domain-overview/overview-success.json).
  {
    checkedAt: "2026-09-21",
    costCents: 2,
    feature: "domain_rank_overview",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
  },
  // provisional - finalize via scripts/domain-overview-cost-profile
  {
    baseCostCents: 12,
    checkedAt: "2026-08-11",
    costCents: 12,
    feature: "historical_rank_overview",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
    unitCostCents: 0.12,
  },
  // relevant_pages/live bills a per-request base plus a per-row component; a 100-row page
  // returned task.cost 0.02 (lib/providers/serp/fixtures/domain-overview/pages-success.json).
  {
    baseCostCents: 1,
    checkedAt: "2026-09-21",
    costCents: 2,
    feature: "relevant_pages",
    providerId: "dataforseo",
    sourceUrl: "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api",
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
