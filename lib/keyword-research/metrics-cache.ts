import "server-only";
import {
  acquireProviderLookupLock,
  type ProviderLookupLock,
  providerLookupCacheConfigured,
  providerLookupContentionResetAt,
  readProviderLookupCache,
  releaseProviderLookupLock,
  waitForProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import type { KeywordMetricsCacheEntry } from "./cache";
import { normalizeResearchKeyword } from "./context";

export type KeywordKey = { cacheKey: string; keyword: string; normalized: string };

export function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords.flatMap((keyword) => {
    const normalized = normalizeResearchKeyword(keyword);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ keyword: keyword.trim().replace(/\s+/g, " "), normalized }];
  });
}

export async function releaseAll(locks: Map<string, ProviderLookupLock>) {
  await Promise.allSettled([...locks.values()].map((lock) => releaseProviderLookupLock(lock)));
}

export async function prepareMisses(input: {
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
