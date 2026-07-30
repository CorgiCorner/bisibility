import "server-only";

import {
  type BisibilityRedisClient,
  createRedisSubscriber,
  getRedisClient,
  redisConfigured,
  resetRedisClientForTests,
} from "@/lib/redis/redis";

const CHANNEL_PREFIX = "bisibility:notifications:v1";

type RedisClient = Pick<BisibilityRedisClient, "publish">;

export type NotificationRealtimeEvent = {
  createdAt: string;
  id: string;
  kind: "created";
  projectId: string | null;
  userId: string;
};

export type PublishNotificationResult =
  | { mode: "redis"; ok: true; subscribers: number }
  | { mode: "polling"; ok: true }
  | { error: unknown; mode: "redis"; ok: false };

export type NotificationEventSubscriber = {
  close: () => void;
  ready: Promise<void>;
};

let redisClient: RedisClient | null = null;

async function redis() {
  if (!redisConfigured()) {
    return null;
  }

  redisClient ??= await getRedisClient();
  return redisClient;
}

export function notificationRealtimeRedisConfigured() {
  return redisConfigured();
}

export function notificationChannel(userId: string) {
  return `${CHANNEL_PREFIX}:user:${encodeURIComponent(userId)}`;
}

export async function publishNotificationCreated(
  event: NotificationRealtimeEvent,
): Promise<PublishNotificationResult> {
  try {
    const client = await redis();
    if (!client) {
      return { mode: "polling", ok: true };
    }

    const subscribers = await client.publish(
      notificationChannel(event.userId),
      JSON.stringify(event),
    );
    return { mode: "redis", ok: true, subscribers };
  } catch (error) {
    return { error, mode: "redis", ok: false };
  }
}

export function subscribeToNotificationEvents(
  userId: string,
  handlers: {
    onError: (error: unknown) => void;
    onEvent: (event: NotificationRealtimeEvent) => void;
  },
): NotificationEventSubscriber | null {
  if (!redisConfigured()) {
    return null;
  }

  const channel = notificationChannel(userId);
  let closed = false;
  let subscriber: Awaited<ReturnType<typeof createRedisSubscriber>> = null;
  const subscriberConnect = new AbortController();

  function reportError(error: unknown) {
    try {
      handlers.onError(error);
    } catch {
      // Stream lifecycle callbacks must never turn a Redis failure into an unhandled error.
    }
  }

  const ready = createRedisSubscriber(subscriberConnect.signal).then(async (client) => {
    if (!client) {
      return;
    }
    if (closed) {
      client.destroy();
      return;
    }

    subscriber = client;
    client.on("error", reportError);
    await client.subscribe(channel, (message) => {
      try {
        const event = JSON.parse(message) as NotificationRealtimeEvent;
        if (event.kind === "created") {
          handlers.onEvent(event);
        }
      } catch {
        // Ignore malformed pub/sub payloads; the polling fallback repairs state.
      }
    });
  });
  void ready.catch(reportError);

  return {
    close: () => {
      closed = true;
      subscriberConnect.abort();
      void ready
        .catch(() => undefined)
        .then(() => {
          const activeSubscriber = subscriber;
          if (!activeSubscriber) {
            return;
          }
          activeSubscriber.removeAllListeners("error");
          activeSubscriber
            .unsubscribe(channel)
            .finally(() => activeSubscriber.destroy())
            .catch(() => undefined);
        })
        .catch(() => undefined);
    },
    ready,
  };
}

export function resetNotificationRealtimeForTests() {
  redisClient = null;
  resetRedisClientForTests();
}
