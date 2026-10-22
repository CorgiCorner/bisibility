import "server-only";
import { resolveProviderPayment } from "@/lib/action-payment/provider-descriptor";
import { type ActionPaymentInput, prepareActionPayment } from "@/lib/action-payment/session";
import { rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import { requiredConnectionEstimate } from "@/lib/provider-lookups/connection-estimate";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { type RankedKeywordsCacheEntry, rankedKeywordsCacheTtlSeconds } from "./cache";
import type { eligibleConnections, projectState } from "./context";

export async function prepareRankedKeywordPayment(
  input: ActionPaymentInput & {
    actorId?: string | null;
    limit: number;
    offset: number;
    origin: ProviderRequestOrigin;
    maxCostCents?: number;
  },
  project: NonNullable<Awaited<ReturnType<typeof projectState>>>,
  selected: ReturnType<typeof eligibleConnections>[number],
  locationKey: string,
  cached?: RankedKeywordsCacheEntry,
) {
  if (
    !resolveProviderPayment(selected.provider, "ranked_keywords") &&
    !input.requirePayment &&
    !input.acceptedPayment
  )
    return null;
  const context =
    selected.provider.id === "dataforseo"
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(selected.connection.id, "ranked_keywords");
  const costCents = cached
    ? 0
    : await requiredConnectionEstimate({
        connection: selected.connection,
        feature: "ranked_keywords",
        context,
        itemCount: input.limit,
        providerId: selected.provider.id,
        rate: rankedKeywordPageRate(selected.provider.id),
      });
  return prepareActionPayment({
    ...input,
    projectId: project.id,
    ownerId: project.ownerId,
    source: input.origin.source,
    feature: "ranked_keywords",
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds,
    request: { domain: project.domain, locationKey, limit: input.limit, offset: input.offset },
    connection: selected.connection,
    provider: selected.provider,
    children: [
      {
        key: "ranked-page",
        cached: Boolean(cached),
        costCents,
        quantity: input.limit,
        ...(cached
          ? {
              freeUntil: new Date(
                Date.parse(cached.fetchedAt) + rankedKeywordsCacheTtlSeconds() * 1000,
              ).toISOString(),
            }
          : {}),
      },
    ],
  });
}
