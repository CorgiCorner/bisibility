import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishWorkerIntent,
  WORKER_INTENT_CHANNEL,
  WORKER_INTENT_PUBLISH_TIMEOUT_MS,
  workerIntentPollIntervalMs,
} from "./realtime";

const redis = vi.hoisted(() => ({
  createRedisSubscriber: vi.fn(),
  getRedisClient: vi.fn(),
  publish: vi.fn(),
  redisConfigured: vi.fn(),
}));

vi.mock("@/lib/redis/redis", () => ({
  createRedisSubscriber: redis.createRedisSubscriber,
  getRedisClient: redis.getRedisClient,
  redisConfigured: redis.redisConfigured,
}));

describe("worker intent realtime publisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.getRedisClient.mockResolvedValue({ publish: redis.publish });
    redis.publish.mockResolvedValue(1);
  });

  afterEach(() => vi.useRealTimers());

  it("settles a never-settling Redis connect at the publish deadline", async () => {
    vi.useFakeTimers();
    redis.getRedisClient.mockImplementation(() => new Promise(() => undefined));

    const pending = publishWorkerIntent("welcome_followup");
    await vi.advanceTimersByTimeAsync(WORKER_INTENT_PUBLISH_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ mode: "redis", ok: false, reason: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("contains a rejected Redis publish", async () => {
    redis.publish.mockRejectedValue(new Error("publish failed"));

    await expect(publishWorkerIntent("welcome_followup")).resolves.toEqual({
      mode: "redis",
      ok: false,
    });
  });

  it("reports a successful Redis publish", async () => {
    await expect(publishWorkerIntent("welcome_followup")).resolves.toEqual({
      mode: "redis",
      ok: true,
    });
    expect(redis.publish).toHaveBeenCalledWith(
      WORKER_INTENT_CHANNEL,
      JSON.stringify({ kind: "welcome_followup" }),
    );
  });

  it("uses a bounded two-second polling fallback by default", () => {
    expect(workerIntentPollIntervalMs(undefined)).toBe(2_000);
    expect(workerIntentPollIntervalMs("2500")).toBe(2_500);
    expect(workerIntentPollIntervalMs("99")).toBe(2_000);
  });
});
