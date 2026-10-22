import "server-only";
import { paymentAdmissionFailure } from "@/lib/action-payment/admission-failure";
import {
  enumerateActionPaymentOptions,
  selectActionPaymentCandidate,
} from "@/lib/action-payment/options";
import { type ActionPaymentInput, paymentFailure } from "@/lib/action-payment/session";
import { requireApiPublicId } from "@/lib/api/public-id";
import { keywordMetricsRate } from "@/lib/cost-estimate/provider-rates";
import {
  providerLookupCacheConfigured,
  readProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { requiredConnectionEstimate } from "@/lib/provider-lookups/connection-estimate";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { KeywordMetrics, ResearchKeywordRow } from "@/lib/providers/types";
import {
  researchProviderRankLocation,
  researchScopeForLocation,
  supportsResearchScope,
} from "@/lib/serp/research-capability";
import {
  type KeywordMetricsCacheEntry,
  keywordMetricsCacheKey,
  writeKeywordMetricsCache,
} from "./cache";
import {
  connectionResources,
  eligibleResearchConnections,
  keywordResearchProject,
  normalizeResearchKeyword,
  researchLocation,
} from "./context";
import { prepareMisses, releaseAll, uniqueKeywords } from "./metrics-cache";
import { metricsPaymentKey, prepareMetricsPayment } from "./metrics-payment";
import { ProviderLookupSignal, paidProviderCall } from "./paid-call";
import type { KeywordMetricsOutcome } from "./types";

const emptyMetrics: KeywordMetrics = {
  competition: null,
  cpcCents: null,
  difficulty: null,
  intent: null,
  monthlyTrend: [],
  searchVolume: null,
};

export async function fetchKeywordMetrics(
  input: ActionPaymentInput & {
    actorId?: string | null;
    connectionId?: string;
    estimateOnly?: boolean;
    fresh?: boolean;
    includeClickstream: boolean;
    keywords: string[];
    maxCostCents?: number;
    origin: ProviderRequestOrigin;
    projectId: string;
  },
): Promise<KeywordMetricsOutcome> {
  const project = await keywordResearchProject(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  return withProjectCachePolicy(
    project.lookupCacheTtlSeconds,
    async (): Promise<KeywordMetricsOutcome> => {
      const eligible = eligibleResearchConnections(project, "metrics");
      const requestedConnectionId = input.connectionId
        ? requireApiPublicId(input.connectionId, "conn")
        : undefined;
      const selected = selectActionPaymentCandidate(
        eligible,
        requestedConnectionId,
        input.paymentOptionId,
        "keyword_metrics",
      );
      if (!selected?.provider.fetchKeywordMetrics) return { ok: false, reason: "no_source" };
      const location = await researchLocation(project);
      if (!supportsResearchScope(location.value.gl, location.value.hl)) {
        return { ok: false, reason: "unsupported_location" };
      }
      const rateContext =
        selected.provider.id === "dataforseo"
          ? LIST_PROVIDER_RATE_CONTEXT
          : await loadProviderRateContext(selected.connection.id, "keyword_metrics");
      const keys = uniqueKeywords(input.keywords).map((item) => ({
        ...item,
        cacheKey: keywordMetricsCacheKey({
          connectionId: selected.connection.id,
          includeClickstream: input.includeClickstream,
          keyword: item.normalized,
          locationKey: location.key,
          projectId: project.id,
        }),
      }));
      const values = new Map<string, KeywordMetricsCacheEntry>();
      if (input.estimateOnly) {
        if (!input.fresh && providerLookupCacheConfigured()) {
          const reads = await Promise.all(
            keys.map((item) => readProviderLookupCache<KeywordMetricsCacheEntry>(item.cacheKey)),
          );
          reads.forEach((entry, index) => {
            if (entry) values.set(keys[index].normalized, entry);
          });
        }
        const fetchedCountEstimate = keys.length - values.size;
        const estimatedCostCents = fetchedCountEstimate
          ? await requiredConnectionEstimate({
              connection: selected.connection,
              feature: "keyword_metrics",
              context: rateContext,
              includeClickstream: input.includeClickstream,
              itemCount: fetchedCountEstimate,
              providerId: selected.provider.id,
              rate: keywordMetricsRate(selected.provider.id),
            })
          : 0;
        return {
          ...(await (async () => {
            const payment = await prepareMetricsPayment(input, project, selected, {
              locationKey: location.key,
              keys,
              values,
              misses: keys.filter((item) => !values.has(item.normalized)),
              costCents: estimatedCostCents,
            });
            return payment
              ? {
                  payment: payment.quote,
                  paymentOptions: enumerateActionPaymentOptions(eligible, "keyword_metrics"),
                }
              : {};
          })()),
          cachedCount: values.size,
          connections: connectionResources(eligible),
          costCents: 0,
          estimate: true,
          estimatedCostCents,
          fetchedAt: new Date().toISOString(),
          fetchedCount: 0,
          fetchedCountEstimate,
          ok: true,
          provider: selected.provider.label,
          rows: [],
        };
      }
      const prepared = await prepareMisses({ fresh: input.fresh, keys, values });
      if (prepared.contended) {
        await releaseAll(prepared.locks);
        return { ok: false, reason: "in_progress", resetAt: prepared.resetAt };
      }
      let costCents = 0;
      let payment: Awaited<ReturnType<typeof prepareMetricsPayment>> = null;
      const fetchedAt = new Date().toISOString();
      try {
        const estimatedCostCents = prepared.misses.length
          ? await requiredConnectionEstimate({
              connection: selected.connection,
              feature: "keyword_metrics",
              context: rateContext,
              includeClickstream: input.includeClickstream,
              itemCount: prepared.misses.length,
              providerId: selected.provider.id,
              rate: keywordMetricsRate(selected.provider.id),
            })
          : 0;
        payment = await prepareMetricsPayment(input, project, selected, {
          locationKey: location.key,
          keys,
          values,
          misses: prepared.misses,
          costCents: estimatedCostCents,
        });
        if (prepared.misses.length) {
          const chunk = prepared.misses;
          if (
            input.maxCostCents === 0 ||
            (input.maxCostCents !== undefined && estimatedCostCents > input.maxCostCents)
          ) {
            throw new ProviderLookupSignal({
              estimatedCostCents,
              ok: false,
              reason: "cost_limit_exceeded",
            });
          }
          const page = await paidProviderCall({
            payment: payment?.child(metricsPaymentKey(keys)),
            call: (credentials, usage) =>
              selected.provider.fetchKeywordMetrics?.(credentials, {
                includeClickstream: input.includeClickstream,
                keywords: chunk.map((item) => item.keyword),
                location: researchProviderRankLocation(researchScopeForLocation(location.value)),
                attribution: usage,
                tag: usage?.tag,
              }) ?? Promise.resolve({ costCents: 0, rows: [] }),
            connection: selected.connection,
            credential: input.origin.credential,
            feature: "keyword_metrics",
            includeClickstream: input.includeClickstream,
            itemCount: chunk.length,
            projectId: project.id,
            maxCostCents: input.maxCostCents,
            provider: selected.provider,
            rateContext,
            rate: keywordMetricsRate(selected.provider.id),
            source: input.origin.source,
            trigger: "manual",
          });
          costCents += page.costCents;
          const returned = new Map(
            page.rows.map((row: ResearchKeywordRow) => [
              normalizeResearchKeyword(row.keyword),
              row,
            ]),
          );
          const writes: Promise<unknown>[] = [];
          for (const item of chunk) {
            const row = returned.get(item.normalized);
            const entry: KeywordMetricsCacheEntry = {
              ...(row ?? emptyMetrics),
              fetchedAt,
              keyword: row?.keyword ?? item.keyword,
            };
            values.set(item.normalized, entry);
            writes.push(Promise.resolve(writeKeywordMetricsCache(item.cacheKey, entry)));
          }
          await Promise.allSettled(writes);
        }
      } catch (error) {
        const failure = paymentFailure(error);
        if (failure)
          return { ...failure, ...(payment?.hasAttempted ? { payment: payment.receipt() } : {}) };
        const admission = payment?.hasAttempted
          ? paymentAdmissionFailure(error, payment.receipt())
          : null;
        if (admission) return admission;
        if (error instanceof ProviderLookupSignal)
          return {
            ...error.outcome,
            ...(payment?.hasAttempted ? { payment: payment.receipt() } : {}),
          };
        if (payment?.hasAttempted)
          return { ok: false, reason: "provider_error", payment: payment.receipt() };
        throw error;
      } finally {
        await releaseAll(prepared.locks);
      }
      const cachedCount = keys.length - prepared.misses.length;
      const rows = keys.map((item) => {
        const { fetchedAt: _fetchedAt, ...row } = values.get(item.normalized) ?? {
          ...emptyMetrics,
          fetchedAt,
          keyword: item.keyword,
        };
        return row;
      });
      const cachedTimes = [...values.values()].map((row) => row.fetchedAt).sort();
      return {
        ...(payment ? { payment: payment.receipt() } : {}),
        cachedCount,
        connections: connectionResources(eligible),
        costCents,
        fetchedAt: prepared.misses.length ? fetchedAt : (cachedTimes.at(-1) ?? fetchedAt),
        fetchedCount: prepared.misses.length,
        ok: true,
        provider: selected.provider.label,
        rows,
      };
    },
  ).catch((error: unknown) => {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  });
}
