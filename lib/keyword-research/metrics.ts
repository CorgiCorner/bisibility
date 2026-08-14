import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { keywordMetricsRate } from "@/lib/cost-estimate/provider-rates";
import {
  acquireProviderLookupLock,
  type ProviderLookupLock,
  providerLookupCacheConfigured,
  providerLookupContentionResetAt,
  readProviderLookupCache,
  releaseProviderLookupLock,
  waitForProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import type { KeywordMetrics, ResearchKeywordRow } from "@/lib/providers/types";
import { researchProviderRankLocation, supportsResearchMarket } from "@/lib/serp/market-capability";
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
import { ProviderLookupSignal, paidProviderCall, requiredEstimatedCostCents } from "./paid-call";
import type { KeywordMetricsOutcome } from "./types";

const emptyMetrics: KeywordMetrics = {
  competition: null,
  cpcCents: null,
  difficulty: null,
  intent: null,
  monthlyTrend: [],
  searchVolume: null,
};

type KeywordKey = { cacheKey: string; keyword: string; normalized: string };

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords.flatMap((keyword) => {
    const normalized = normalizeResearchKeyword(keyword);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ keyword: keyword.trim().replace(/\s+/g, " "), normalized }];
  });
}

async function releaseAll(locks: Map<string, ProviderLookupLock>) {
  await Promise.allSettled([...locks.values()].map((lock) => releaseProviderLookupLock(lock)));
}

async function prepareMisses(input: {
  fresh?: boolean;
  keys: KeywordKey[];
  values: Map<string, KeywordMetricsCacheEntry>;
}) {
  const locks = new Map<string, ProviderLookupLock>();
  let cacheAvailable = providerLookupCacheConfigured();
  if (!input.fresh && cacheAvailable) {
    const reads = await Promise.all(
      input.keys.map((item) => readProviderLookupCache<KeywordMetricsCacheEntry>(item.cacheKey)),
    );
    if (reads.some((entry) => entry === undefined)) cacheAvailable = false;
    reads.forEach((entry, index) => {
      if (entry) input.values.set(input.keys[index].normalized, entry);
    });
  }
  let misses = input.keys.filter((item) => !input.values.has(item.normalized));
  if (!cacheAvailable) return { contended: false, locks, misses, resetAt: undefined };
  for (const item of misses) {
    const lock = await acquireProviderLookupLock(item.cacheKey);
    if (lock === undefined) {
      cacheAvailable = false;
      await releaseAll(locks);
      locks.clear();
      break;
    }
    if (lock) {
      locks.set(item.normalized, lock);
      continue;
    }
    const concurrent = await waitForProviderLookupCache<KeywordMetricsCacheEntry>(item.cacheKey);
    if (concurrent === undefined) {
      cacheAvailable = false;
      await releaseAll(locks);
      locks.clear();
      break;
    }
    if (!input.fresh && concurrent) input.values.set(item.normalized, concurrent);
    else {
      return {
        contended: true,
        locks,
        misses: [] as KeywordKey[],
        resetAt: await providerLookupContentionResetAt(item.cacheKey),
      };
    }
  }
  misses = input.keys.filter((item) => !input.values.has(item.normalized));
  if (cacheAvailable && !input.fresh) {
    for (const item of misses) {
      if (!locks.has(item.normalized)) continue;
      const cached = await readProviderLookupCache<KeywordMetricsCacheEntry>(item.cacheKey);
      if (cached) input.values.set(item.normalized, cached);
    }
    misses = input.keys.filter((item) => !input.values.has(item.normalized));
  }
  return { contended: false, locks, misses, resetAt: undefined };
}

export async function fetchKeywordMetrics(input: {
  actorId?: string | null;
  connectionId?: string;
  estimateOnly?: boolean;
  fresh?: boolean;
  includeClickstream: boolean;
  keywords: string[];
  maxCostCents?: number;
  projectId: string;
}): Promise<KeywordMetricsOutcome> {
  const project = await keywordResearchProject(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  const eligible = eligibleResearchConnections(project, "metrics");
  const requestedConnectionId = input.connectionId
    ? requireApiPublicId(input.connectionId, "conn")
    : undefined;
  const selected = requestedConnectionId
    ? eligible.find(({ connection }) => connection.publicId === requestedConnectionId)
    : eligible[0];
  if (!selected?.provider.fetchKeywordMetrics) return { ok: false, reason: "no_source" };
  const location = await researchLocation(project);
  if (!supportsResearchMarket(location.value.gl, location.value.hl)) {
    return { ok: false, reason: "unsupported_location" };
  }
  const rateContext = await loadProviderRateContext(selected.connection.id, "keyword_metrics");
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
      ? requiredEstimatedCostCents({
          context: rateContext,
          includeClickstream: input.includeClickstream,
          itemCount: fetchedCountEstimate,
          providerId: selected.provider.id,
          rate: keywordMetricsRate(selected.provider.id),
        })
      : 0;
    return {
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
  const fetchedAt = new Date().toISOString();
  try {
    if (prepared.misses.length) {
      const chunk = prepared.misses;
      const estimatedCostCents = requiredEstimatedCostCents({
        context: rateContext,
        includeClickstream: input.includeClickstream,
        itemCount: chunk.length,
        providerId: selected.provider.id,
        rate: keywordMetricsRate(selected.provider.id),
      });
      if (input.maxCostCents !== undefined && estimatedCostCents > input.maxCostCents) {
        throw new ProviderLookupSignal({ ok: false, reason: "cost_limit_exceeded" });
      }
      const page = await paidProviderCall({
        budgetCapCents: project.budgetCapCents,
        call: (credentials) =>
          selected.provider.fetchKeywordMetrics?.(credentials, {
            includeClickstream: input.includeClickstream,
            keywords: chunk.map((item) => item.keyword),
            location: researchProviderRankLocation(location.value),
          }) ?? Promise.resolve({ costCents: 0, rows: [] }),
        connection: selected.connection,
        feature: "keyword_metrics",
        includeClickstream: input.includeClickstream,
        itemCount: chunk.length,
        projectId: project.id,
        provider: selected.provider,
        rateContext,
        rate: keywordMetricsRate(selected.provider.id),
      });
      costCents += page.costCents;
      const returned = new Map(
        page.rows.map((row: ResearchKeywordRow) => [normalizeResearchKeyword(row.keyword), row]),
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
    if (error instanceof ProviderLookupSignal) return error.outcome;
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
    cachedCount,
    connections: connectionResources(eligible),
    costCents,
    fetchedAt: prepared.misses.length ? fetchedAt : (cachedTimes.at(-1) ?? fetchedAt),
    fetchedCount: prepared.misses.length,
    ok: true,
    provider: selected.provider.label,
    rows,
  };
}
