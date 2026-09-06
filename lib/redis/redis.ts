import "@/lib/deployment/runtime-env.generated";

import { createClient, type RedisClientOptions, type RedisClientType } from "redis";

export type BisibilityRedisClient = RedisClientType;

const DEFAULT_CONNECT_TIMEOUT_MS = 1_000;
const DEFAULT_CONNECT_MAX_RETRIES = 3;

type RedisEnvironment = Partial<
  Record<"REDIS_CONNECT_MAX_RETRIES" | "REDIS_CONNECT_TIMEOUT_MS", string | undefined>
>;

let client: BisibilityRedisClient | null = null;
let connectPromise: Promise<BisibilityRedisClient> | null = null;

function integerSetting(
  name: keyof RedisEnvironment,
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number },
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be an integer`);

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${name} must be between ${range.min} and ${range.max}`);
  }
  return parsed;
}

function redisConnectionSettings(
  env: RedisEnvironment = {
    REDIS_CONNECT_MAX_RETRIES: process.env.REDIS_CONNECT_MAX_RETRIES,
    REDIS_CONNECT_TIMEOUT_MS: process.env.REDIS_CONNECT_TIMEOUT_MS,
  },
) {
  return {
    connectTimeout: integerSetting(
      "REDIS_CONNECT_TIMEOUT_MS",
      env.REDIS_CONNECT_TIMEOUT_MS,
      DEFAULT_CONNECT_TIMEOUT_MS,
      { min: 1, max: 60_000 },
    ),
    maxRetries: integerSetting(
      "REDIS_CONNECT_MAX_RETRIES",
      env.REDIS_CONNECT_MAX_RETRIES,
      DEFAULT_CONNECT_MAX_RETRIES,
      { min: 0, max: 20 },
    ),
  };
}

function redisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

export function redisConfigured() {
  return redisUrl().length > 0;
}

function redisSocketOptions(url: string): RedisClientOptions["socket"] {
  const { connectTimeout, maxRetries } = redisConnectionSettings();
  const reconnectStrategy = (retries: number) =>
    retries >= maxRetries ? false : Math.min(retries * 50, 1000);
  const parsed = new URL(url);
  if (parsed.protocol !== "rediss:") {
    return { connectTimeout, reconnectStrategy };
  }

  const ca = process.env.REDIS_TLS_CA_B64?.trim();
  return {
    ca: ca ? Buffer.from(ca, "base64").toString("utf8") : undefined,
    connectTimeout,
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

  const nextClient = createRedisClient();
  if (!nextClient) {
    return null;
  }
  client = nextClient;

  let pendingConnect: Promise<BisibilityRedisClient>;
  pendingConnect = nextClient
    .connect()
    .then(() => nextClient)
    .catch((error) => {
      if (client === nextClient) client = null;
      throw error;
    })
    .finally(() => {
      if (connectPromise === pendingConnect) connectPromise = null;
    });
  connectPromise = pendingConnect;

  return pendingConnect;
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
