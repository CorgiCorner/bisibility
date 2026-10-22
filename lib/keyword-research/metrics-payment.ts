import "server-only";
import { type ActionPaymentInput, prepareActionPayment } from "@/lib/action-payment/session";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { type KeywordMetricsCacheEntry, keywordResearchCachedUntil } from "./cache";
import type { KeywordResearchProject } from "./context";
import type { KeywordKey } from "./metrics-cache";
import type { ResearchSelection } from "./source-call";

export function metricsPaymentKey(keys: KeywordKey[]) {
  return `metrics:${keys
    .map((row) => row.normalized)
    .sort()
    .join("|")}`;
}
export function prepareMetricsPayment(
  input: ActionPaymentInput & {
    actorId?: string | null;
    includeClickstream: boolean;
    fresh?: boolean;
    origin: ProviderRequestOrigin;
  },
  project: KeywordResearchProject,
  selected: ResearchSelection,
  plan: {
    locationKey: string;
    keys: KeywordKey[];
    values: Map<string, KeywordMetricsCacheEntry>;
    misses: KeywordKey[];
    costCents: number;
  },
) {
  return prepareActionPayment({
    ...input,
    projectId: project.id,
    ownerId: project.ownerId,
    source: input.origin.source,
    feature: "keyword_metrics",
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds,
    connection: selected.connection,
    provider: selected.provider,
    request: [
      plan.keys.map((item) => item.normalized).sort(),
      plan.locationKey,
      input.includeClickstream,
      input.fresh ?? false,
    ],
    children: [
      {
        key: metricsPaymentKey(plan.keys),
        payableItems: plan.keys
          .map((row) => row.normalized)
          .sort()
          .flatMap((key, index) =>
            plan.misses.some((row) => row.normalized === key) ? [String(index)] : [],
          ),
        costCents: plan.costCents,
        quantity: plan.misses.length,
        cached: plan.misses.length === 0,
        freeUntil: plan.misses.length
          ? undefined
          : keywordResearchCachedUntil([...plan.values.values()].map((row) => row.fetchedAt)),
      },
    ],
  });
}
