import { afterEach, beforeEach, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ configured: true, available: true, eval: vi.fn() }));
vi.mock("@/lib/redis/redis", () => ({
  redisConfigured: () => redis.configured,
  getRedisClient: async () => (redis.available ? { eval: redis.eval } : null),
  resetRedisClientForTests: vi.fn(),
}));

import { REDIS_CONSUME_SCRIPT } from "@/lib/api/ratelimit-scripts";
import { ProviderCallError } from "./call-error";
import { assertLiveResponseCapacity, reserveLiveResponseCapacity } from "./live-capacity";

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  redis.configured = true;
  redis.available = true;
  const buckets = new Map<string, number[]>();
  redis.eval.mockImplementation(async (script, input) => {
    expect(script).toBe(REDIS_CONSUME_SCRIPT);
    const [now, window, limit] = input.arguments.map(Number);
    const key = input.keys[0];
    // A Redis eval executes this complete operation atomically for all clients.
    const retained = (buckets.get(key) ?? []).filter((start) => start > now - window);
    const accepted = retained.length < limit;
    if (accepted) retained.push(now);
    buckets.set(key, retained);
    return [accepted ? 1 : 0, limit, limit - retained.length, retained[0] + window];
  });
});
it("admits exactly 30 concurrent callers through the existing atomic Redis limiter", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 60 }, (_, index) =>
      reserveLiveResponseCapacity(
        { login: index % 2 ? "FIXTURE@EXAMPLE.INVALID" : "fixture@example.invalid" },
        `replica-project-${index}`,
      ),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(30);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(30);
  expect(new Set(redis.eval.mock.calls.map(([, input]) => input.keys[0])).size).toBe(1);
  expect(redis.eval.mock.calls[0][1].keys[0]).not.toContain("fixture@example.invalid");
  expect(redis.eval.mock.calls[0][1].arguments[1]).toBe("245000");
});
it.each(["unconfigured", "missing client", "Redis failure"])(
  "fails closed with proven zero spend when shared capacity is %s",
  async (state) => {
    if (state === "unconfigured") redis.configured = false;
    if (state === "missing client") redis.available = false;
    if (state === "Redis failure") redis.eval.mockRejectedValueOnce(new Error("Redis unavailable"));
    try {
      await reserveLiveResponseCapacity({ login: "fixture" });
      throw new Error("Capacity unexpectedly used a memory fallback.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderCallError);
      expect(error).toMatchObject({ costCents: 0 });
    }
  },
);
it("isolates distinct provider accounts while sharing capacity across all Responses engines", async () => {
  for (const login of ["account-a", "account-b"])
    await Promise.all(Array.from({ length: 30 }, () => reserveLiveResponseCapacity({ login })));
  expect(new Set(redis.eval.mock.calls.map(([, input]) => input.keys[0])).size).toBe(2);
});
it("retains capacity through the provider maximum duration and releases the conservative window", async () => {
  vi.useFakeTimers();
  await Promise.all(
    Array.from({ length: 30 }, () => reserveLiveResponseCapacity({ login: "window" })),
  );
  vi.advanceTimersByTime(244_000);
  await expect(reserveLiveResponseCapacity({ login: "window" })).rejects.toMatchObject({
    costCents: 0,
  });
  vi.advanceTimersByTime(1001);
  await expect(reserveLiveResponseCapacity({ login: "window" })).resolves.toHaveProperty(
    "dispatchExpiresAt",
  );
});
it("rejects a reservation delayed five seconds before dispatch with proven zero I/O", async () => {
  vi.useFakeTimers();
  const reservation = await reserveLiveResponseCapacity({ login: "delayed" });
  vi.advanceTimersByTime(4999);
  expect(() => assertLiveResponseCapacity(reservation)).not.toThrow();
  vi.advanceTimersByTime(1);
  expect(() => assertLiveResponseCapacity(reservation)).toThrow(ProviderCallError);
});
