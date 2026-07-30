import "@/lib/deployment/runtime-env.generated";

import { createClient, type RedisClientOptions, type RedisClientType } from "redis";

export type BisibilityRedisClient = RedisClientType;

let client: BisibilityRedisClient | null = null;
let connectPromise: Promise<BisibilityRedisClient> | null = null;

function redisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

export function redisConfigured() {
  return redisUrl().length > 0;
}

function redisSocketOptions(url: string): RedisClientOptions["socket"] {
  const reconnectStrategy = (retries: number) => Math.min(retries * 50, 1000);
  const parsed = new URL(url);
  if (parsed.protocol !== "rediss:") {
    return { reconnectStrategy };
  }

  const ca = process.env.REDIS_TLS_CA_B64?.trim();
  return {
    ca: ca ? Buffer.from(ca, "base64").toString("utf8") : undefined,
    reconnectStrategy,
    servername: parsed.hostname,
    tls: true,
  };
}

function createRedisClient() {
  const url = redisUrl();
  if (!url) {
    return null;
  }

  const redis = createClient({
    socket: redisSocketOptions(url),
    url,
  });
  redis.on("error", () => {
    // Keep node-redis from emitting unhandled error events; callers decide
    // whether a Redis failure is fatal for their workflow.
  });

  return redis;
}

export async function getRedisClient() {
  if (!redisConfigured()) {
    return null;
  }
  if (client?.isReady) {
    return client;
  }
  if (connectPromise) {
    return connectPromise;
  }

  client = createRedisClient();
  if (!client) {
    return null;
  }

  connectPromise = client
    .connect()
    .then(() => client as BisibilityRedisClient)
    .catch((error) => {
      client = null;
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

export async function closeRedisClient(): Promise<void> {
  const activeClient = client;
  const pendingConnect = connectPromise;
  client = null;
  connectPromise = null;

  const redis = pendingConnect ? await pendingConnect.catch(() => activeClient) : activeClient;
  if (!redis?.isOpen) return;
  try {
    await redis.quit();
  } catch {
    redis.destroy();
  }
}

export async function createRedisSubscriber(signal?: AbortSignal) {
  const baseClient = await getRedisClient();
  if (!baseClient || signal?.aborted) {
    return null;
  }

  const subscriber = baseClient.duplicate();
  subscriber.on("error", () => {
    // The subscriber owner receives command rejections; this listener prevents
    // process-level unhandled error events during reconnects.
  });
  const abortConnect = () => {
    if (subscriber.isOpen) {
      subscriber.destroy();
    }
  };
  signal?.addEventListener("abort", abortConnect, { once: true });
  try {
    await subscriber.connect();
  } finally {
    signal?.removeEventListener("abort", abortConnect);
  }

  if (signal?.aborted) {
    abortConnect();
    return null;
  }

  return subscriber;
}

export function resetRedisClientForTests() {
  const previous = client;
  client = null;
  connectPromise = null;

  if (previous?.isOpen) {
    previous.quit().catch(() => previous.destroy());
  }
}
