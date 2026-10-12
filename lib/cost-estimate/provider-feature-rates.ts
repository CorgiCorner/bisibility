import { type ResolveProviderRateInput, resolveProviderRate } from "@/lib/provider-rates/resolver";
import { formatQuantity } from "@usagekit/core";
import { dataforseo } from "@usagekit/providers";

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

const featureOperations = {
  ranked_keywords: "dataforseo_labs.google.ranked_keywords.live",
  backlinks_summary: "backlinks.summary.live",
  backlinks_history: "backlinks.history.live",
  backlinks_rows: "backlinks.backlinks.live",
  domain_rank_overview: "dataforseo_labs.google.domain_rank_overview.live",
  historical_rank_overview: "dataforseo_labs.google.historical_rank_overview.live",
  relevant_pages: "dataforseo_labs.google.relevant_pages.live",
  keyword_research_related: "dataforseo_labs.google.related_keywords.live",
  keyword_research_suggestions: "dataforseo_labs.google.keyword_suggestions.live",
  keyword_research_ideas: "dataforseo_labs.google.keyword_ideas.live",
  keyword_metrics: "dataforseo_labs.google.keyword_overview.live",
} as const;
type CatalogFeature = keyof typeof featureOperations;
const isCatalogFeature = (feature: string): feature is CatalogFeature =>
  Object.hasOwn(featureOperations, feature);

export function providerFeatureOperation(rate: ProviderFeatureRate | null) {
  return rate?.providerId === "dataforseo" && isCatalogFeature(rate.feature)
    ? featureOperations[rate.feature]
    : null;
}

/** Keep the meaning of existing editor values independent of the catalog's list formula. */
export function providerFeatureOverrideBasis(feature: string): "call" | "item" {
  return [
    "ranked_keywords",
    "backlinks_summary",
    "backlinks_history",
    "domain_rank_overview",
  ].includes(feature)
    ? "call"
    : "item";
}

function featurePrice(feature: CatalogFeature) {
  const operation = featureOperations[feature];
  const price = dataforseo.descriptor.prices.find((row) => row.operation === operation);
  if (price?.unit !== "cents" || price.calculation?.kind !== "base_plus_items")
    throw new Error("Feature catalog price is unavailable");
  return price;
}

/** Display reference prices use the installed descriptor and its own shared formula.
 * Live admission additionally checks the request and effective-date policy. */
function catalogFeatureAmount(
  feature: CatalogFeature,
  count: number,
  clickstream: boolean,
  itemPrice?: number,
) {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  const operation = dataforseo.descriptor.operations.find(
    (entry) => entry.id === featureOperations[feature],
  );
  if (!operation) return null;
  const price = featurePrice(feature);
  const calculation = price.calculation;
  if (calculation?.kind !== "base_plus_items") return null;
  const quantities = dataforseo.extractors.estimate({
    operation,
    options: { itemCount: String(count), clickstream: String(clickstream) },
    prices: [
      {
        ...price,
        calculation: {
          ...calculation,
          ...(itemPrice === undefined ? {} : { perItem: String(itemPrice) }),
        },
      },
    ],
  });
  const amount = quantities.find((quantity) => quantity.unit === "cents");
  return amount ? Number(formatQuantity(amount)) : null;
}

export const PROVIDER_FEATURE_RATES: ProviderFeatureRate[] = (
  Object.keys(featureOperations) as CatalogFeature[]
).map((feature) => {
  const row = featurePrice(feature);
  const calculation = row.calculation;
  if (calculation?.kind !== "base_plus_items") throw new Error("Missing item formula");
  const referenceCount =
    feature === "historical_rank_overview"
      ? 0
      : ["backlinks_summary", "backlinks_history", "domain_rank_overview"].includes(feature)
        ? 1
        : 100;
  const costCents = catalogFeatureAmount(feature, referenceCount, false);
  if (costCents === null) throw new Error("Feature reference quote is unavailable");
  return {
    baseCostCents: Number(row.perUnit),
    checkedAt: row.checkedAt,
    costCents,
    feature,
    providerId: dataforseo.descriptor.id,
    sourceUrl: row.source,
    unitCostCents: Number(calculation.perItem),
  };
});

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
  const nativeFeature =
    rate?.providerId === "dataforseo" && isCatalogFeature(rate.feature) ? rate.feature : null;
  const scalesByItem = nativeFeature
    ? providerFeatureOverrideBasis(nativeFeature) === "item"
    : rate?.unitCostCents !== undefined;
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
  if (nativeFeature) {
    if (resolved.source === "list")
      return catalogFeatureAmount(nativeFeature, itemCount, includeClickstream);
    if (!scalesByItem) return resolved.amountCents;
    return catalogFeatureAmount(nativeFeature, itemCount, includeClickstream, resolved.amountCents);
  }
  const amountCents = scalesByItem
    ? (rate?.baseCostCents ?? 0) + resolved.amountCents * itemCount
    : resolved.amountCents;
  // Clickstream refinement is a keyword-volume upsell; backlinks features never carry it.
  const clickstream = includeClickstream && !rate?.feature.startsWith("backlinks_");
  return amountCents * (clickstream ? 2 : 1);
}
