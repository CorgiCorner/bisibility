import "server-only";
import { instanceLookupTtl, unpackProjectCache } from "@/lib/provider-lookups/project-cache-policy";
import { getRedisClient } from "@/lib/redis/redis";
import { identifyProjectCacheKey } from "./key";
import type { DataCacheEntry, DataCachePage } from "./schema";

const identify = identifyProjectCacheKey;
function patterns(projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error("Invalid project cache scope.");
  return [
    "kr:v2:",
    "km:v1:",
    "rk:v2:",
    "bl:v3:",
    "do:v1:",
    "ai:v1:",
    "ai:v2:",
    "ai:v3-engines:",
    "ai:v1-provider-domain-v1:",
    "ai:v2-provider-domain-v1:",
  ].map((prefix) => `${prefix}${projectId}:`);
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Research cache unavailable.")), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function listRedisDataCache(
  projectId: string,
  cursor: string,
  ttlSeconds: number | null,
  providers: Record<string, string> = {},
): Promise<DataCachePage> {
  const prefixes = patterns(projectId);
  try {
    const redis = await bounded(getRedisClient());
    if (!redis) return { entries: [], cursor: "0", available: false };
    // One bounded SCAN per page; empty intermediate pages retain their cursor.
    const page = await bounded(redis.scan(cursor, { MATCH: `*:${projectId}:*`, COUNT: 100 }));
    const keys = [...new Set(page.keys)].filter(
      (key) => prefixes.some((prefix) => key.startsWith(prefix)) && identify(key, projectId),
    );
    const entries = await Promise.all(
      keys.map(async (key): Promise<DataCacheEntry | null> => {
        const info = identify(key, projectId);
        if (!info || info.module === "backlinks" || info.module === "domain_overview") return null;
        const [raw, remaining] = await bounded(Promise.all([redis.get(key), redis.ttl(key)]));
        if (!raw || remaining <= 0) return null;
        let value: Record<string, unknown>;
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return null;
          value = parsed;
        } catch {
          return null;
        }
        const unpacked = unpackProjectCache(value);
        const fetchedAt = unpacked.storedAt;
        value =
          unpacked.value && typeof unpacked.value === "object"
            ? (unpacked.value as Record<string, unknown>)
            : {};
        const expiresAt = Math.min(
          Date.now() + remaining * 1000,
          Number.isFinite(fetchedAt)
            ? fetchedAt + (ttlSeconds ?? instanceLookupTtl(key)) * 1000
            : Infinity,
        );
        if (expiresAt <= Date.now()) return null;
        return {
          module: info.module,
          ...(typeof value.reportId === "string" && /^agr_[a-zA-Z0-9]+$/.test(value.reportId)
            ? { reportRef: value.reportId }
            : {}),
          provider:
            providers[info.providerRef] ??
            providers[decodeURIComponent(info.providerRef)] ??
            undefined,
          source: info.source as DataCacheEntry["source"],
          country: info.country,
          language: info.language,
          keyword: info.keyword ?? (typeof value.keyword === "string" ? value.keyword : null),
          token: Buffer.from(key).toString("base64url"),
          expiresAt: new Date(expiresAt).toISOString(),
        };
      }),
    );
    return {
      available: true,
      cursor: String(page.cursor),
      entries: entries.filter((entry): entry is DataCacheEntry => entry !== null),
    };
  } catch {
    return { entries: [], cursor, available: false };
  }
}
export async function removeRedisDataCache(projectId: string, token: string) {
  const key = Buffer.from(token, "base64url").toString("utf8");
  const prefixes = patterns(projectId);
  if (!prefixes.some((prefix) => key.startsWith(prefix)) || !identify(key, projectId))
    return "invalid" as const;
  try {
    const redis = await bounded(getRedisClient());
    if (!redis) return "unavailable" as const;
    // Never remove an active lock or allow its in-flight paid result to be silently discarded.
    const result = await bounded(
      redis.eval(
        "if redis.call('exists', KEYS[2]) == 1 then return -1 end return redis.call('del', KEYS[1])",
        { keys: [key, `${key}:lock`], arguments: [] },
      ),
    );
    return Number(result) === -1 ? ("busy" as const) : ("removed" as const);
  } catch {
    return "unavailable" as const;
  }
}

export type StoredRedisIdentity = {
  target: string;
  provider: string;
  scope: string;
} & (
  | { module: "backlinks"; includeSubdomains: boolean; mode: string }
  | { module: "domain_overview"; locationCode: number; languageCode: string }
);

export async function removeStoredRedisCopies(projectId: string, identity: StoredRedisIdentity) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) return "invalid" as const;
  try {
    const redis = await bounded(getRedisClient());
    if (!redis) return "removed" as const;
    const keys = new Set<string>();
    let cursor = "0";
    for (let page = 0; page < 32; page += 1) {
      const result = await bounded(
        redis.scan(cursor, {
          MATCH: `${identity.module === "backlinks" ? "bl:v3" : "do:v1"}:${projectId}:*`,
          COUNT: 1000,
        }),
      );
      for (const candidate of result.keys) {
        const key = candidate.endsWith(":lock") ? candidate.slice(0, -5) : candidate;
        const info = identify(key, projectId);
        if (
          !info ||
          info.module !== identity.module ||
          info.keyword !== identity.target ||
          info.providerRef !== identity.provider ||
          !("scope" in info) ||
          info.scope !== identity.scope
        )
          continue;
        if (identity.module === "backlinks") {
          if (
            info.module !== "backlinks" ||
            info.includeSubdomains !== identity.includeSubdomains ||
            info.mode !== identity.mode
          )
            continue;
        } else if (
          info.country !== String(identity.locationCode) ||
          info.language.toLowerCase() !== identity.languageCode.toLowerCase()
        )
          continue;
        keys.add(key);
        if (keys.size > 1000) return "unavailable" as const;
      }
      cursor = String(result.cursor);
      if (cursor === "0") {
        if (!keys.size) return "removed" as const;
        const results = [...keys];
        // Validate every matching lock before deleting any copy, in the same Redis operation.
        const removed = await bounded(
          redis.eval(
            "local n = #KEYS / 2; for i = n + 1, #KEYS do if redis.call('exists', KEYS[i]) == 1 then return -1 end end; local removed = 0; for i = 1, n do removed = removed + redis.call('del', KEYS[i]) end; return removed",
            { keys: [...results, ...results.map((key) => `${key}:lock`)], arguments: [] },
          ),
        );
        return Number(removed) === -1 ? ("busy" as const) : ("removed" as const);
      }
    }
    return "unavailable" as const;
  } catch {
    return "unavailable" as const;
  }
}
