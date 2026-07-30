import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type NotificationRealtimeEvent,
  notificationChannel,
  notificationRealtimeRedisConfigured,
  publishNotificationCreated,
  resetNotificationRealtimeForTests,
  subscribeToNotificationEvents,
} from "./realtime";

const redis = vi.hoisted(() => {
  const publish = vi.fn();
  const subscribe = vi.fn();
  const subscriber = {
    destroy: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    subscribe,
    unsubscribe: vi.fn(),
  };

  return {
    createRedisSubscriber: vi.fn(),
    getRedisClient: vi.fn(),
    redisConfigured: vi.fn(),
    publish,
    subscriber,
  };
});

vi.mock("@/lib/redis/redis", () => ({
  createRedisSubscriber: redis.createRedisSubscriber,
  getRedisClient: redis.getRedisClient,
  redisConfigured: redis.redisConfigured,
  resetRedisClientForTests: vi.fn(),
}));

const event: NotificationRealtimeEvent = {
  createdAt: "2026-06-28T10:00:00.000Z",
  id: "notification_1",
  kind: "created",
  projectId: "project_1",
  userId: "user 1",
};

describe("notification realtime publisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationRealtimeForTests();
    redis.redisConfigured.mockReturnValue(false);
    redis.getRedisClient.mockResolvedValue({ publish: redis.publish });
    redis.createRedisSubscriber.mockResolvedValue(redis.subscriber);
    redis.publish.mockResolvedValue(2);
    redis.subscriber.subscribe.mockResolvedValue(undefined);
    redis.subscriber.unsubscribe.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it("falls back to polling mode when Redis env is absent", async () => {
    await expect(publishNotificationCreated(event)).resolves.toEqual({
      mode: "polling",
      ok: true,
    });

    expect(notificationRealtimeRedisConfigured()).toBe(false);
    expect(redis.getRedisClient).not.toHaveBeenCalled();
  });

  it("publishes created notifications to the user channel when Redis is configured", async () => {
    redis.redisConfigured.mockReturnValue(true);

    await expect(publishNotificationCreated(event)).resolves.toEqual({
      mode: "redis",
      ok: true,
      subscribers: 2,
    });

    expect(notificationRealtimeRedisConfigured()).toBe(true);
    expect(redis.publish).toHaveBeenCalledWith(
      notificationChannel("user 1"),
      JSON.stringify(event),
    );
  });

  it("keeps notification creation non-fatal when Redis publish fails", async () => {
    redis.redisConfigured.mockReturnValue(true);
    const error = new Error("publish failed");
    redis.publish.mockRejectedValue(error);

    await expect(publishNotificationCreated(event)).resolves.toEqual({
      error,
      mode: "redis",
      ok: false,
    });
  });

  it("subscribes to the user channel and cleans up the subscriber", async () => {
    redis.redisConfigured.mockReturnValue(true);
    const onError = vi.fn();
    const onEvent = vi.fn();
    let messageHandler: ((message: string) => void) | undefined;
    redis.subscriber.subscribe.mockImplementation(async (_channel, handler) => {
      messageHandler = handler;
    });

    const subscriber = subscribeToNotificationEvents("user 1", { onError, onEvent });
    await vi.waitFor(() => {
      expect(redis.subscriber.subscribe).toHaveBeenCalledWith(
        notificationChannel("user 1"),
        expect.any(Function),
      );
    });

    messageHandler?.(JSON.stringify(event));
    messageHandler?.(JSON.stringify({ ...event, kind: "other" }));
    subscriber?.close();
    await vi.waitFor(() => expect(redis.subscriber.destroy).toHaveBeenCalled());

    expect(redis.subscriber.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(event);
    expect(redis.subscriber.removeAllListeners).toHaveBeenCalledWith("error");
    expect(redis.subscriber.unsubscribe).toHaveBeenCalledWith(notificationChannel("user 1"));
  });

  it("aborts a never-settling subscriber connection when the stream closes", () => {
    vi.useFakeTimers();
    redis.redisConfigured.mockReturnValue(true);
    const destroy = vi.fn();
    redis.createRedisSubscriber.mockImplementation((signal: AbortSignal) => {
      const retryTimer = setTimeout(() => undefined, 1_000);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(retryTimer);
          destroy();
        },
        { once: true },
      );
      return new Promise(() => {});
    });

    const result = subscribeToNotificationEvents("user 1", {
      onError: vi.fn(),
      onEvent: vi.fn(),
    });
    expect(vi.getTimerCount()).toBe(1);

    result?.close();

    expect(destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exposes late subscriber setup rejection without leaking handler failures", async () => {
    redis.redisConfigured.mockReturnValue(true);
    redis.createRedisSubscriber.mockRejectedValue("subscriber unavailable");
    const onError = vi.fn(() => {
      throw new Error("consumer already closed");
    });
    const result = subscribeToNotificationEvents("user 1", {
      onError,
      onEvent: vi.fn(),
    }) as unknown as { ready: Promise<void> };

    await expect(result.ready).rejects.toBe("subscriber unavailable");
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith("subscriber unavailable");
  });

  it("contains exceptions thrown by a late Redis error handler", async () => {
    redis.redisConfigured.mockReturnValue(true);
    const onError = vi.fn(() => {
      throw new Error("stream already closed");
    });
    subscribeToNotificationEvents("user 1", { onError, onEvent: vi.fn() });
    await vi.waitFor(() => expect(redis.subscriber.on).toHaveBeenCalled());
    const redisErrorHandler = redis.subscriber.on.mock.calls.find(
      ([eventName]) => eventName === "error",
    )?.[1] as ((error: Error) => void) | undefined;

    expect(() => redisErrorHandler?.(new Error("socket failed"))).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "socket failed" }));
  });
});
