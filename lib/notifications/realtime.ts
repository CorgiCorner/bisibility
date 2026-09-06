import "server-only";

import {
  type BisibilityRedisClient,
  createRedisSubscriber,
  getRedisClient,
  redisConfigured,
  resetRedisClientForTests,
} from "@/lib/redis/redis";

const NOTIFICATION_CHANNEL_PREFIX = "bisibility:notifications:v1";
const OPERATION_CHANNEL_PREFIX = "bisibility:operations:v1";

type RedisClient = Pick<BisibilityRedisClient, "publish">;

export type NotificationRealtimeEvent = {
  createdAt: string;
  id: string;
  kind: "created";
  projectId: string | null;
  userId: string;
};

type OperationRealtimeEvent = {
  at: string;
  kind: "changed";
  projectId: string;
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
  return `${NOTIFICATION_CHANNEL_PREFIX}:user:${encodeURIComponent(userId)}`;
}

function operationChannel(projectId: string) {
  return `${OPERATION_CHANNEL_PREFIX}:project:${encodeURIComponent(projectId)}`;
}

async function publishRealtimeEvent(channel: string, event: unknown) {
  try {
    const client = await redis();
    if (!client) {
      return { mode: "polling", ok: true } as const;
    }

    const subscribers = await client.publish(channel, JSON.stringify(event));
    return { mode: "redis", ok: true, subscribers } as const;
  } catch (error) {
    return { error, mode: "redis", ok: false } as const;
  }
}

export async function publishNotificationCreated(
  event: NotificationRealtimeEvent,
): Promise<PublishNotificationResult> {
  return publishRealtimeEvent(notificationChannel(event.userId), event);
}

export async function publishOperationChanged(input: {
  projectId: string;
}): Promise<PublishNotificationResult> {
  const event: OperationRealtimeEvent = {
    at: new Date().toISOString(),
    kind: "changed",
    projectId: input.projectId,
  };
  return publishRealtimeEvent(operationChannel(input.projectId), event);
}

function subscribeToRealtimeEvents<T>(
  channel: string,
  handlers: {
    onError: (error: unknown) => void;
    onEvent: (event: T) => void;
  },
  parseEvent: (value: unknown) => T | null,
): NotificationEventSubscriber | null {
  if (!redisConfigured()) {
    return null;
  }

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
        const event = parseEvent(JSON.parse(message));
        if (event) handlers.onEvent(event);
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

export function subscribeToNotificationEvents(
  userId: string,
  handlers: {
    onError: (error: unknown) => void;
    onEvent: (event: NotificationRealtimeEvent) => void;
  },
): NotificationEventSubscriber | null {
  return subscribeToRealtimeEvents(notificationChannel(userId), handlers, (value) => {
    const event = value as Partial<NotificationRealtimeEvent>;
    return event.kind === "created" ? (event as NotificationRealtimeEvent) : null;
  });
}

export function subscribeToOperationEvents(
  projectId: string,
  handlers: {
    onError: (error: unknown) => void;
    onEvent: (event: OperationRealtimeEvent) => void;
  },
): NotificationEventSubscriber | null {
  return subscribeToRealtimeEvents(operationChannel(projectId), handlers, (value) => {
    const event = value as Partial<OperationRealtimeEvent>;
    return event.kind === "changed" && event.projectId === projectId
      ? (event as OperationRealtimeEvent)
      : null;
  });
}

export function resetNotificationRealtimeForTests() {
  redisClient = null;
  resetRedisClientForTests();
}
