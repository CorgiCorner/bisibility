import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ttlOptions } from "@/lib/project-data-cache/schema";

const scope = new AsyncLocalStorage<number | null>();
export const projectCacheTtlOptions = ttlOptions;

export function withProjectCachePolicy<T>(ttl: number | null | undefined, run: () => T): T {
  return scope.run(ttl ?? null, run);
}
export function projectCacheTtl(fallback: number) {
  return scope.getStore() ?? fallback;
}
export function isProjectResultKey(key: string) {
  return /^(kr:v2|km:v1|rk:v2|bl:v3|do:v1|ai:v[12](?:-provider-domain-v1)?):/.test(key);
}
export function projectCacheEntryCurrent(key: string, value: unknown, now = Date.now()) {
  if (!isProjectResultKey(key)) return true;
  const ttl = scope.getStore() ?? instanceLookupTtl(key);
  const fetchedAt = cachedValueTime(value);
  // Legacy values keep their original Redis expiry when no source timestamp exists.
  return !Number.isFinite(fetchedAt) || fetchedAt + ttl * 1000 > now;
}

export function projectCacheFreshness(now: Date, fallback = 43_200, storedExpiry?: "cachedUntil") {
  return {
    OR: [
      {
        project: { lookupCacheTtlSeconds: null },
        fetchedAt: { gt: new Date(now.getTime() - fallback * 1000) },
      },
      ...projectCacheTtlOptions.map((ttl) => ({
        ...(storedExpiry ? { cachedUntil: { gt: now } } : {}),
        project: { lookupCacheTtlSeconds: ttl },
        fetchedAt: { gt: new Date(now.getTime() - ttl * 1000) },
      })),
    ],
  };
}

export function cachedValueTime(value: unknown): number {
  if (!value || typeof value !== "object") return NaN;
  const item = value as Record<string, unknown>;
  if (typeof item.fetchedAt === "string") return Date.parse(item.fetchedAt);
  if (item.result && typeof item.result === "object") return cachedValueTime(item.result);
  if (item.data && typeof item.data === "object") return cachedValueTime(item.data);
  return NaN;
}
export function unpackProjectCache(value: unknown) {
  return { value, storedAt: cachedValueTime(value) };
}

export function instanceLookupTtl(key: string) {
  if (
    key.startsWith("do:") &&
    (process.env.READ_ONLY_DEMO === "1" || process.env.DEMO_MODE === "editable")
  )
    return 30 * 86400;
  const [env, fallback] = key.startsWith("bl:")
    ? ([process.env.BACKLINKS_CACHE_TTL_SECONDS, 86400] as const)
    : key.startsWith("do:")
      ? ([process.env.DOMAIN_OVERVIEW_CACHE_TTL_SECONDS, 43200] as const)
      : key.startsWith("rk:")
        ? ([process.env.RANKED_KEYWORDS_CACHE_TTL_SECONDS, 43200] as const)
        : ([
            key.startsWith("ai:") ? undefined : process.env.KEYWORD_RESEARCH_CACHE_TTL_SECONDS,
            43200,
          ] as const);
  const value = Number(env);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
