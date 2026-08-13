import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireRankedKeywordsLock,
  rankedKeywordsCacheKey,
  rankedKeywordsCacheTtlSeconds,
  readRankedKeywordsCache,
  releaseRankedKeywordsLock,
  writeRankedKeywordsCache,
} from "./cache";

const mocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  redisConfigured: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: mocks.getRedisClient,
  redisConfigured: mocks.redisConfigured,
}));

const entry = {
  costCents: 2,
  fetchedAt: "2026-07-22T10:00:00.000Z",
  rows: [],
  totalCount: 0,
};

describe("ranked-keyword cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisConfigured.mockReturnValue(true);
    vi.stubEnv("RANKED_KEYWORDS_CACHE_TTL_SECONDS", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("builds the versioned key and validates the configured TTL", () => {
    expect(
      rankedKeywordsCacheKey({
        connectionId: "conn_1",
        limit: 100,
        locationKey: "US/US-TX/Austin",
        normalizedDomain: "example.com",
        offset: 200,
        projectId: "project_1",
      }),
    ).toBe("rk:v2:project_1:conn_1:example.com:US/US-TX/Austin:100:200");
    expect(rankedKeywordsCacheTtlSeconds()).toBe(43_200);
    vi.stubEnv("RANKED_KEYWORDS_CACHE_TTL_SECONDS", "60");
    expect(rankedKeywordsCacheTtlSeconds()).toBe(60);
  });

  it("distinguishes lock contention from Redis unavailability", async () => {
    mocks.getRedisClient.mockResolvedValue({ set: vi.fn().mockResolvedValue(null) });
    await expect(acquireRankedKeywordsLock("rk:key")).resolves.toBeNull();

    mocks.getRedisClient.mockRejectedValue(new Error("offline"));
    await expect(acquireRankedKeywordsLock("rk:key")).resolves.toBeUndefined();
  });

  it("times out an unreachable Redis client and degrades to unavailable", async () => {
    vi.useFakeTimers();
    mocks.getRedisClient.mockReturnValue(new Promise(() => undefined));

    const pending = readRankedKeywordsCache("rk:key");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBeUndefined();
  });

  it("reads and writes empty pages without surfacing Redis failures", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(entry)),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mocks.getRedisClient.mockResolvedValue(redis);

    await expect(readRankedKeywordsCache("rk:key")).resolves.toEqual(entry);
    await expect(writeRankedKeywordsCache("rk:key", entry)).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith("rk:key", JSON.stringify(entry), { EX: 43_200 });

    redis.get.mockRejectedValue(new Error("offline"));
    redis.set.mockRejectedValue(new Error("offline"));
    await expect(readRankedKeywordsCache("rk:key")).resolves.toBeUndefined();
    await expect(writeRankedKeywordsCache("rk:key", entry)).resolves.toBe(false);
  });

  it("releases locks best-effort", async () => {
    mocks.getRedisClient.mockResolvedValue({
      eval: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await expect(
      releaseRankedKeywordsLock({ key: "rk:key:lock", token: "token" }),
    ).resolves.toBeUndefined();
  });
});
