import "server-only";

import {
  type BisibilityRedisClient,
  createRedisSubscriber,
  getRedisClient,
  redisConfigured,
} from "@/lib/redis/redis";

export const WORKER_INTENT_CHANNEL = "bisibility:worker-intents:v1";
export const DEFAULT_WORKER_INTENT_POLL_INTERVAL_MS = 2_000;
// The row is the truth; this wake only reduces latency before the poll fallback.
export const WORKER_INTENT_PUBLISH_TIMEOUT_MS = 2_000;

export const WORKER_INTENT_KINDS = [
  "search_insights_sync",
  "traffic_first_sync",
  "welcome_followup",
  // Published by lib/rank-check/runs/launch.ts once a queued run row is committed.
  "rank_run",
] as const;

export type WorkerIntentKind = (typeof WORKER_INTENT_KINDS)[number];
export type WorkerIntent = { kind: WorkerIntentKind };
type RedisPublisher = Pick<BisibilityRedisClient, "publish">;

export type WorkerIntentPublishResult =
  | { mode: "polling"; ok: true }
  | { mode: "redis"; ok: true }
  | { mode: "redis"; ok: false; reason?: "timeout" };

export type WorkerIntentSubscription = {
  close: () => void;
  ready: Promise<void>;
};

export function workerIntentPollIntervalMs(value = process.env.WORKER_INTENT_POLL_INTERVAL_MS) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 60_000
    ? parsed
    : DEFAULT_WORKER_INTENT_POLL_INTERVAL_MS;
}

function isWorkerIntentKind(value: unknown): value is WorkerIntentKind {
  return typeof value === "string" && WORKER_INTENT_KINDS.includes(value as WorkerIntentKind);
}

export async function publishWorkerIntent(
  kind: WorkerIntentKind,
  client?: RedisPublisher | null,
): Promise<WorkerIntentPublishResult> {
  let timedOut = false;
  const publish = (async (): Promise<WorkerIntentPublishResult> => {
    try {
      const publisher = client === undefined ? await getRedisClient() : client;
      if (!publisher) return { mode: "polling", ok: true };
      if (timedOut) return { mode: "redis", ok: false, reason: "timeout" };
      const intent: WorkerIntent = { kind };
      await publisher.publish(WORKER_INTENT_CHANNEL, JSON.stringify(intent));
      return { mode: "redis", ok: true };
    } catch {
      return { mode: "redis", ok: false };
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      publish,
      new Promise<WorkerIntentPublishResult>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve({ mode: "redis", ok: false, reason: "timeout" });
        }, WORKER_INTENT_PUBLISH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    // Redis owns its process-shared client; a timed-out wake must not disconnect other callers.
  }
}

export function subscribeToWorkerIntents(
  onIntent: (kind: WorkerIntentKind) => void,
): WorkerIntentSubscription | null {
  if (!redisConfigured()) return null;

  let closed = false;
  let subscriber: Awaited<ReturnType<typeof createRedisSubscriber>> = null;
  const connectAbort = new AbortController();
  const ready = createRedisSubscriber(connectAbort.signal).then(async (client) => {
    if (!client || closed) {
      client?.destroy();
      return;
    }
    subscriber = client;
    await client.subscribe(WORKER_INTENT_CHANNEL, (message) => {
      try {
        const event = JSON.parse(message) as { kind?: unknown };
        if (isWorkerIntentKind(event.kind)) onIntent(event.kind);
      } catch {
        // Polling repairs missed or malformed wake events.
      }
    });
  });
  void ready.catch(() => undefined);

  return {
    close() {
      closed = true;
      connectAbort.abort();
      void ready
        .catch(() => undefined)
        .then(() => {
          if (!subscriber) return;
          void subscriber.unsubscribe(WORKER_INTENT_CHANNEL).finally(() => subscriber?.destroy());
        });
    },
    ready,
  };
}
