import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import type { Quantity, ReserveInput } from "@usagekit/core";

/** Inject the provider catalog so the host does not require an unpublished runtime package. */
export interface ProviderCatalogPort {
  operationsOf(provider: string): readonly { id: string; billable: boolean }[];
  plansOf(provider: string): readonly { id: string }[];
}
export type CatalogFeature =
  | "rank_check"
  | "keyword_metrics"
  | "keyword_research"
  | "ranked_keywords"
  | "domain_rank_overview"
  | "historical_rank_overview"
  | "relevant_pages"
  | "backlinks_summary"
  | "backlinks_history"
  | "backlinks_rows";
export type CatalogSelection = {
  feature: CatalogFeature;
  mode?: "live" | "standard" | "priority";
  researchSource?: "ideas" | "related" | "suggestions";
};
const research = {
  ideas: "keyword_ideas",
  related: "related_keywords",
  suggestions: "keyword_suggestions",
} as const;
const labs = {
  keyword_metrics: "keyword_overview",
  ranked_keywords: "ranked_keywords",
  domain_rank_overview: "domain_rank_overview",
  historical_rank_overview: "historical_rank_overview",
  relevant_pages: "relevant_pages",
} as const;
const backlinks = {
  backlinks_summary: "summary",
  backlinks_history: "history",
  backlinks_rows: "backlinks",
} as const;
/** Composite host features need an explicit request variant. Never guess one operation for a cascade. */
export function catalogOperation(
  catalog: ProviderCatalogPort,
  provider: string,
  selection: CatalogSelection,
) {
  let operation: string | undefined;
  const options: Record<string, string> = {};
  if (provider === "serpapi" && selection.feature === "rank_check") operation = "search";
  if (provider === "dataforseo") {
    if (selection.feature === "rank_check" && selection.mode) {
      operation =
        selection.mode === "live"
          ? "serp.google.organic.live.advanced"
          : "serp.google.organic.task_post";
      if (selection.mode !== "live")
        options.priority = selection.mode === "priority" ? "high" : "normal";
    } else if (selection.feature === "keyword_research" && selection.researchSource) {
      operation = `dataforseo_labs.google.${research[selection.researchSource]}.live`;
    } else if (selection.feature in labs) {
      operation = `dataforseo_labs.google.${labs[selection.feature as keyof typeof labs]}.live`;
    } else if (selection.feature in backlinks) {
      operation = `backlinks.${backlinks[selection.feature as keyof typeof backlinks]}.live`;
    }
  }
  const descriptor = catalog
    .operationsOf(provider)
    .find((row) => row.id === operation && row.billable);
  return descriptor ? { operation: descriptor.id, options } : null;
}
/** Project host plans onto descriptor IDs while retaining host prices and allowance values. */
export function catalogPlans(catalog: ProviderCatalogPort, provider: string) {
  const enabled = new Set(catalog.plansOf(provider).map((plan) => plan.id));
  const host = rateForProvider(provider);
  return (host?.pricingModel === "plan" ? host.plans : []).map((plan) => ({
    ...plan,
    catalogPlan: enabled.has(plan.planKey) ? plan.planKey : null,
  }));
}
/** Add descriptor identity to a host-priced reservation. The host remains the pricing authority:
 * depth, per-result fees, custom prices, measured rates and funding are copied unchanged. */
export function catalogReservation(
  catalog: ProviderCatalogPort,
  reservation: ReserveInput,
  selection: CatalogSelection,
): (ReserveInput & { options: Record<string, string> }) | null {
  const mapped = catalogOperation(catalog, reservation.provider, selection);
  if (!mapped) return null;
  const estimate: readonly Quantity[] = reservation.estimate;
  return { ...reservation, ...mapped, estimate };
}
