import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readProviderLookupCache, withProviderLookupCache } from "./cache";

const mocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  redisConfigured: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: mocks.getRedisClient,
  redisConfigured: mocks.redisConfigured,
}));

describe("provider lookup cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisConfigured.mockReturnValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it("returns cache hits without loading", async () => {
    const load = vi.fn();
    mocks.getRedisClient.mockResolvedValue({
      get: vi.fn().mockResolvedValue(JSON.stringify({ rows: [] })),
    });
    await expect(withProviderLookupCache({ key: "key", load, ttlSeconds: 60 })).resolves.toEqual({
      cached: true,
      status: "success",
      value: { rows: [] },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("rechecks after acquiring a lock and avoids duplicate spend", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ rows: ["writer"] }));
    const load = vi.fn();
    mocks.getRedisClient.mockResolvedValue({
      eval: vi.fn().mockResolvedValue(1),
      get,
      set: vi.fn().mockResolvedValue("OK"),
    });
    await expect(withProviderLookupCache({ key: "key", load, ttlSeconds: 60 })).resolves.toEqual({
      cached: true,
      status: "success",
      value: { rows: ["writer"] },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("polls a contended lock and returns a concurrent empty result", async () => {
    vi.useFakeTimers();
    const get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ rows: [] }));
    mocks.getRedisClient.mockResolvedValue({ get, set: vi.fn().mockResolvedValue(null) });
    const pending = withProviderLookupCache({ key: "key", load: vi.fn(), ttlSeconds: 60 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toMatchObject({ cached: true, value: { rows: [] } });
  });

  it("fresh skips reads, loads, and writes an empty result", async () => {
    const set = vi.fn().mockResolvedValueOnce("OK").mockResolvedValueOnce("OK");
    const get = vi.fn();
    mocks.getRedisClient.mockResolvedValue({ eval: vi.fn(), get, set });
    await expect(
      withProviderLookupCache({
        fresh: true,
        key: "key",
        load: async () => ({ rows: [] }),
        ttlSeconds: 60,
      }),
    ).resolves.toMatchObject({ cached: false, value: { rows: [] } });
    expect(get).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith("key", JSON.stringify({ rows: [] }), { EX: 60 });
  });

  it("passes through when Redis is disabled or unreachable", async () => {
    const load = vi.fn().mockResolvedValue({ rows: ["provider"] });
    mocks.redisConfigured.mockReturnValue(false);
    await expect(
      withProviderLookupCache({ key: "key", load, ttlSeconds: 60 }),
    ).resolves.toMatchObject({ cached: false });

    mocks.redisConfigured.mockReturnValue(true);
    mocks.getRedisClient.mockRejectedValue(new Error("offline"));
    await expect(
      withProviderLookupCache({ key: "key", load, ttlSeconds: 60 }),
    ).resolves.toMatchObject({ cached: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("returns the remaining lock TTL after a realistic contention wait", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue(null);
    mocks.getRedisClient.mockResolvedValue({
      get,
      pTTL: vi.fn().mockResolvedValue(42_000),
      set: vi.fn().mockResolvedValue(null),
    });
    const pending = withProviderLookupCache({ key: "key", load: vi.fn(), ttlSeconds: 60 });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toMatchObject({
      resetAt: Date.now() + 42_000,
      status: "contended",
    });
    expect(get).toHaveBeenCalledTimes(9);
  });
});

it.each([
  ["kr:v2:p:c:seed:Poland:pl:related:100:0", { fetchedAt: new Date().toISOString(), rows: [] }],
  ["km:v1:p:c:PL:0:hash", { fetchedAt: new Date().toISOString(), rows: [] }],
  ["rk:v2:p:c:example.com:PL:100:0", { fetchedAt: new Date().toISOString(), rows: [] }],
  ["bl:v3:p:c:example.com:site:1:as_is:100", { fetchedAt: new Date().toISOString(), rows: [] }],
  ["do:v1:p:c:history:example.com:root:2840:en", { costCents: 1, data: [] }],
  ["do:v1:p:c:keywords:example.com:root:2840:en:100:0", { costCents: 1, data: { rows: [] } }],
  ["do:v1:p:c:pages:example.com:root:2840:en:100:0", { costCents: 1, data: { rows: [] } }],
  ["do:v1:p:c:overview:example.com:root:2840:en", { costCents: 1, data: {} }],
  ["ai:v2:p:c:ai_visibility:hash", { reportId: "agr_test", result: { rows: [] } }],
])("preserves raw result hits and authoritative legacy Redis expiry for %s", async (key, value) => {
  const { withProjectCachePolicy } = await import("./project-cache-policy");
  const get = vi.fn().mockResolvedValue(JSON.stringify(value));
  const set = vi.fn();
  mocks.redisConfigured.mockReturnValue(true);
  mocks.getRedisClient.mockResolvedValue({ get, set, ttl: vi.fn().mockResolvedValue(3600) });
  expect(await readProviderLookupCache(key)).toEqual(value);
  await withProjectCachePolicy(3600, async () => {
    const load = vi.fn();
    expect(await withProviderLookupCache({ key, load, ttlSeconds: 3600 })).toMatchObject({
      cached: true,
      value,
    });
    expect(load).not.toHaveBeenCalled();
  });
  get.mockResolvedValue(null);
  expect(await readProviderLookupCache(key)).toBeNull();
  expect(set).not.toHaveBeenCalled();
});

it("does not admit a timestamp-less project value without a finite Redis expiry", async () => {
  const key = "do:v1:p:c:history:example.com:root:2840:en";
  mocks.redisConfigured.mockReturnValue(true);
  const ttl = vi.fn().mockResolvedValue(-1);
  mocks.getRedisClient.mockResolvedValue({
    get: vi.fn().mockResolvedValue(JSON.stringify({ costCents: 1, data: [] })),
    ttl,
  });
  expect(await readProviderLookupCache(key)).toBeNull();
  ttl.mockResolvedValue(-2);
  expect(await readProviderLookupCache(key)).toBeNull();
});
