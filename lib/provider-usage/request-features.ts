import type { ProviderCostFeature } from "@/lib/generated/prisma/client";

/**
 * Every provider-billed request is attributed to one of these features (see `tag.ts`). Kept free
 * of server imports so the OpenAPI operation spend registry can be checked against it.
 */
export const PROVIDER_REQUEST_FEATURES = [
  "ai_visibility",
  "ai_tracking",
  "prompt_explorer",
  "backlinks",
  "domain_overview",
  "keyword_metrics",
  "keyword_research",
  "local_scan",
  "rank_check",
  "ranked_keywords",
] as const satisfies readonly ProviderCostFeature[];
export type ProviderRequestFeature = (typeof PROVIDER_REQUEST_FEATURES)[number];
