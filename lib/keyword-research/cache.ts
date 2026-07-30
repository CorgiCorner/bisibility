import "server-only";

import { createHash } from "node:crypto";
import {
  positiveTtl,
  readProviderLookupCache,
  withProviderLookupCache,
  writeProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import type { KeywordMetrics, ResearchKeywordRow } from "@/lib/providers/types";
import type { KeywordResearchSource } from "./types";

const DEFAULT_TTL_SECONDS = 43_200;

export type KeywordResearchCacheEntry = {
  costCents: number;
  fetchedAt: string;
  rows: ResearchKeywordRow[];
};

export type KeywordMetricsCacheEntry = KeywordMetrics & {
  fetchedAt: string;
  keyword: string;
};

export function keywordResearchCacheTtlSeconds() {
  return positiveTtl(process.env.KEYWORD_RESEARCH_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
}

export function keywordResearchCachedUntil(fetchedAts: string | readonly string[]) {
  const values = (Array.isArray(fetchedAts) ? fetchedAts : [fetchedAts])
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const earliestFetchedAt = values.length > 0 ? Math.min(...values) : 0;
  return new Date(earliestFetchedAt + keywordResearchCacheTtlSeconds() * 1000).toISOString();
}

export function keywordResearchCacheKey(input: {
  connectionId: string;
  includeClickstream: boolean;
  locationKey: string;
  normalizedSeed: string;
  projectId: string;
  resultLimit: number;
  source: KeywordResearchSource;
}) {
  return `kr:v1:${input.projectId}:${input.connectionId}:${input.normalizedSeed}:${input.locationKey}:${input.source}:${input.resultLimit}:${input.includeClickstream ? 1 : 0}`;
}

export function keywordMetricsCacheKey(input: {
  connectionId: string;
  includeClickstream: boolean;
  keyword: string;
  locationKey: string;
  projectId: string;
}) {
  const hash = createHash("sha256").update(input.keyword).digest("hex");
  return `km:v1:${input.projectId}:${input.connectionId}:${input.locationKey}:${input.includeClickstream ? 1 : 0}:${hash}`;
}

export function withKeywordResearchCache(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<KeywordResearchCacheEntry>;
}) {
  return withProviderLookupCache({ ...input, ttlSeconds: keywordResearchCacheTtlSeconds() });
}

export function readKeywordResearchCache(key: string) {
  return readProviderLookupCache<KeywordResearchCacheEntry>(key);
}

export function readKeywordMetricsCache(key: string) {
  return readProviderLookupCache<KeywordMetricsCacheEntry>(key);
}

export function writeKeywordMetricsCache(key: string, entry: KeywordMetricsCacheEntry) {
  return writeProviderLookupCache(key, entry, keywordResearchCacheTtlSeconds());
}
