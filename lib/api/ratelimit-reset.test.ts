import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  configured: vi.fn(),
  getClient: vi.fn(),
  reset: vi.fn(),
  scanIterator: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: redis.getClient,
  redisConfigured: redis.configured,
  resetRedisClientForTests: redis.reset,
}));

import { consume, peek, resetBucketsFor, resetRateLimitStateForTests } from "./ratelimit";

const limiter = (bucketKey: string) => ({
  bucketKey,
  limit: 5,
  prefix: "bisibility:test",
  windowSeconds: 60,
});

describe("resetBucketsFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.configured.mockReturnValue(false);
    redis.getClient.mockResolvedValue(null);
    resetRateLimitStateForTests();
  });

  it("clears exact and action-scoped memory buckets without clearing similar identifiers", async () => {
    await consume(limiter("user_1"));
    await consume(limiter("user_1:lookup"));
    await consume(limiter("api-key:user_1"));
    await consume(limiter("personal-token:user_1:action"));
    await consume(limiter("user_10"));
    await consume(limiter("prefix_user_1"));

    await expect(resetBucketsFor("user_1")).resolves.toEqual({
      backend: "memory",
      deleted: 4,
    });
    await expect(peek(limiter("user_1"))).resolves.toMatchObject({ remaining: 5 });
    await expect(peek(limiter("user_1:lookup"))).resolves.toMatchObject({ remaining: 5 });
    await expect(peek(limiter("api-key:user_1"))).resolves.toMatchObject({ remaining: 5 });
    await expect(peek(limiter("personal-token:user_1:action"))).resolves.toMatchObject({
      remaining: 5,
    });
    await expect(peek(limiter("user_10"))).resolves.toMatchObject({ remaining: 4 });
    await expect(peek(limiter("prefix_user_1"))).resolves.toMatchObject({ remaining: 4 });
  });

  it("scans exact Redis patterns, deduplicates replies, and unlinks only matching keys", async () => {
    redis.configured.mockReturnValue(true);
    redis.getClient.mockResolvedValue({ scanIterator: redis.scanIterator, unlink: redis.unlink });
    redis.scanIterator.mockImplementation(async function* (options: { MATCH: string }) {
      if (options.MATCH === "*:user_1") {
        yield ["one:user_1", "one:user_10"];
        yield ["one:user_1"];
        return;
      }
      yield ["one:user_1:lookup", "two:user_1:ops", "two:user_10:ops"];
    });
    redis.unlink.mockImplementation(async (keys: string[]) => keys.length);

    await expect(resetBucketsFor("user_1")).resolves.toEqual({
      backend: "redis",
      deleted: 3,
    });

    expect(redis.scanIterator).toHaveBeenCalledWith({ COUNT: 100, MATCH: "*:user_1" });
    expect(redis.scanIterator).toHaveBeenCalledWith({ COUNT: 100, MATCH: "*:user_1:*" });
    expect(redis.unlink).toHaveBeenCalledOnce();
    expect(redis.unlink).toHaveBeenCalledWith([
      "one:user_1",
      "one:user_1:lookup",
      "two:user_1:ops",
    ]);
  });

  it.each(["", " user_1", "user_1 ", "user:1", "user*", "user?", "user[1]"])(
    "rejects an unsafe identifier %j before touching storage",
    async (identifier) => {
      await expect(resetBucketsFor(identifier)).rejects.toThrow(
        "Rate limit reset identifier is invalid.",
      );
      expect(redis.getClient).not.toHaveBeenCalled();
    },
  );

  it("fails closed when Redis is configured but no client is available", async () => {
    redis.configured.mockReturnValue(true);

    await expect(resetBucketsFor("user_1")).rejects.toThrow(
      "Redis rate limit reset is unavailable.",
    );
  });
});
