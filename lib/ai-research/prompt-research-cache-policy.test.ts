import { indexPromptResearchCache } from "@/lib/project-data-cache/prompt-research-index";
import { removeRedisDataCache } from "@/lib/project-data-cache/redis-store";
import { readProviderLookupCache, withProviderLookupCache } from "@/lib/provider-lookups/cache";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { researchCacheIdentity } from "./cache-identity";
import { promptResearchSchema } from "./prompt-research-schema";

const store = vi.hoisted(() => new Map<string, { value: string; expires: number }>());
vi.mock("@/lib/redis/redis", () => {
  const get = (key: string) => {
    const entry = store.get(key);
    return entry && entry.expires > Date.now() ? entry.value : null;
  };
  return {
    redisConfigured: () => true,
    getRedisClient: async () => ({
      get: async (key: string) => get(key),
      exists: async (key: string) => Number(get(key) !== null),
      ttl: async (key: string) => {
        const entry = store.get(key);
        return get(key) === null || !entry ? -2 : Math.floor((entry.expires - Date.now()) / 1000);
      },
      set: async (key: string, value: string, options: { EX: number; NX?: boolean }) => {
        if (options.NX && get(key) !== null) return null;
        store.set(key, { value, expires: Date.now() + options.EX * 1000 });
        return "OK";
      },
      eval: async (
        _sql: string,
        { keys, arguments: args }: { keys: string[]; arguments: string[] },
      ) => {
        if (keys.length === 1) return get(keys[0]) === args[0] ? Number(store.delete(keys[0])) : 0;
        if (get(keys[0]) === null) return -2;
        if (get(keys[2]) !== null) return -1;
        store.delete(keys[0]);
        store.delete(keys[1]);
        return 1;
      },
    }),
  };
});

const start = Date.parse("2026-10-24T00:00:00Z");
const hour = 3600;
const week = 604800;
const input = promptResearchSchema.parse({ keyword: "tools", max_cost_cents: 100 });
const key = (project: string, ttl: number, owner = "owner", payer = "payer") =>
  researchCacheIdentity(project, "connection", "prompt_research", input, owner, payer, ttl).key;
function lookup(
  cacheKey: string,
  ttl: number,
  load: () => Promise<{ result: { fetchedAt: string } }>,
  fresh = false,
) {
  return withProjectCachePolicy(ttl, () =>
    withProviderLookupCache({ key: cacheKey, ttlSeconds: ttl, load, fresh }),
  );
}
beforeEach(() => {
  store.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
});
afterEach(() => vi.useRealTimers());

it("shares equal-policy account requests but isolates policy and funding changes", () => {
  expect(key("A", week)).toBe(key("B", week));
  expect(key("A", hour)).not.toBe(key("B", week));
  expect(key("A", week, "other-owner")).not.toBe(key("A", week));
  expect(key("A", week, "owner", "other-payer")).not.toBe(key("A", week));
  for (const invalid of [0, -1, Number.NaN, Infinity, 1.5])
    expect(() => key("A", invalid)).toThrow();
});

it("retains the original long window when a shorter policy refreshes, without sliding expiry", async () => {
  const long = key("long", week),
    short = key("short", hour);
  const load = vi.fn(async () => ({ result: { fetchedAt: new Date().toISOString() } }));
  await lookup(long, week, load);
  const entry = store.get(long);
  if (!entry) throw new Error("Missing long cache entry");
  const originalExpiry = entry.expires;
  vi.setSystemTime(start + 2 * hour * 1000);
  await lookup(short, hour, load);
  await lookup(short, hour, load, true);
  expect(load).toHaveBeenCalledTimes(3);
  expect(await lookup(long, week, load)).toMatchObject({
    cached: true,
    value: { result: { fetchedAt: new Date(start).toISOString() } },
  });
  expect(store.get(long)?.expires).toBe(originalExpiry);
  expect(load).toHaveBeenCalledTimes(3);
  expect(await withProjectCachePolicy(hour, () => readProviderLookupCache(long))).toBeNull();
  vi.setSystemTime(originalExpiry + 1);
  await expect(
    lookup(long, week, async () => {
      throw new Error("No automatic paid lookup");
    }),
  ).rejects.toThrow("No automatic paid lookup");
});

it("keeps a later long-policy load independent of an earlier short result", async () => {
  const short = key("short", hour),
    long = key("long", week);
  const load = vi.fn(async () => ({ result: { fetchedAt: new Date().toISOString() } }));
  await lookup(short, hour, load);
  vi.setSystemTime(start + hour * 500);
  await lookup(long, week, load);
  vi.setSystemTime(start + hour * 1500);
  expect(await lookup(long, week, load)).toMatchObject({ cached: true });
  expect(load).toHaveBeenCalledTimes(2);
  expect(await withProjectCachePolicy(hour, () => readProviderLookupCache(short))).toBeNull();
});

it("clears only the selected policy's authorized shared result and pointer", async () => {
  const long = key("long", week),
    short = key("short", hour);
  const load = async () => ({ result: { fetchedAt: new Date().toISOString() } });
  await lookup(long, week, load);
  await lookup(short, hour, load);
  await indexPromptResearchCache(
    "long",
    long,
    { fetchedAt: new Date(start).toISOString(), keyword: "tools", reportId: "agr_local" },
    week,
  );
  const pointer = [...store.keys()].find(
    (k) => k.includes("research-project-") && k.includes(":long:"),
  );
  if (!pointer) throw new Error("Missing cache pointer");
  expect(await removeRedisDataCache("long", Buffer.from(pointer).toString("base64url"))).toBe(
    "removed",
  );
  expect(await withProjectCachePolicy(week, () => readProviderLookupCache(long))).toBeNull();
  expect(await withProjectCachePolicy(hour, () => readProviderLookupCache(short))).not.toBeNull();
});
