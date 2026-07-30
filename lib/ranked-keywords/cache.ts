import "server-only";

import {
  acquireProviderLookupLock,
  type ProviderLookupLock,
  positiveTtl,
  readProviderLookupCache,
  releaseProviderLookupLock,
  waitForProviderLookupCache,
  withProviderLookupCache,
  writeProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import type { RankedKeywordRow } from "@/lib/providers/types";

const DEFAULT_TTL_SECONDS = 43_200;

export type RankedKeywordsCacheEntry = {
  costCents: number;
  fetchedAt: string;
  rows: RankedKeywordRow[];
  totalCount: number | null;
};

export type RankedKeywordsLock = ProviderLookupLock;

export function rankedKeywordsCacheTtlSeconds() {
  return positiveTtl(process.env.RANKED_KEYWORDS_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
}

export function rankedKeywordsCacheKey(input: {
  connectionId: string;
  limit: number;
  locationKey: string;
  normalizedDomain: string;
  offset: number;
  projectId: string;
}) {
  return `rk:v1:${input.projectId}:${input.connectionId}:${input.normalizedDomain}:${input.locationKey}:${input.limit}:${input.offset}`;
}

export function readRankedKeywordsCache(key: string) {
  return readProviderLookupCache<RankedKeywordsCacheEntry>(key);
}

export function acquireRankedKeywordsLock(key: string) {
  return acquireProviderLookupLock(key);
}

export function releaseRankedKeywordsLock(lock?: RankedKeywordsLock | null) {
  return releaseProviderLookupLock(lock);
}

export function writeRankedKeywordsCache(key: string, entry: RankedKeywordsCacheEntry) {
  return writeProviderLookupCache(key, entry, rankedKeywordsCacheTtlSeconds());
}

export function waitForRankedKeywordsCache(key: string) {
  return waitForProviderLookupCache<RankedKeywordsCacheEntry>(key);
}

export function withRankedKeywordsCache(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<RankedKeywordsCacheEntry>;
}) {
  return withProviderLookupCache({ ...input, ttlSeconds: rankedKeywordsCacheTtlSeconds() });
}
