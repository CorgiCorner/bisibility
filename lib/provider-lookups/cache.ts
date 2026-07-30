import "server-only";

import { randomUUID } from "node:crypto";
import { getRedisClient, redisConfigured } from "@/lib/redis/redis";

const LOCK_TTL_SECONDS = 60;
const POLL_DELAYS_MS = [500, 750, 1_000, 1_250, 1_500, 1_500, 1_750, 1_750];
const REDIS_OPERATION_TIMEOUT_MS = 1_000;

export type ProviderLookupLock = { key: string; token: string };

export function providerLookupCacheConfigured() {
  return redisConfigured();
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Provider lookup cache operation timed out.")),
          REDIS_OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function redisOperation<T>(
  operation: (redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>) => Promise<T>,
) {
  try {
    const redis = await withTimeout(getRedisClient());
    if (!redis) return undefined;
    return await withTimeout(operation(redis));
  } catch {
    return undefined;
  }
}

export function positiveTtl(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function readProviderLookupCache<T>(key: string): Promise<T | null | undefined> {
  if (!redisConfigured()) return null;
  const raw = await redisOperation((redis) => redis.get(key));
  if (raw === undefined) return undefined;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function acquireProviderLookupLock(
  key: string,
): Promise<ProviderLookupLock | null | undefined> {
  if (!redisConfigured()) return null;
  const token = randomUUID();
  const lockKey = `${key}:lock`;
  const acquired = await redisOperation((redis) =>
    redis.set(lockKey, token, { EX: LOCK_TTL_SECONDS, NX: true }),
  );
  if (acquired === undefined) return undefined;
  return acquired === "OK" ? { key: lockKey, token } : null;
}

export async function releaseProviderLookupLock(lock?: ProviderLookupLock | null) {
  if (!lock) return;
  await redisOperation((redis) =>
    redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { arguments: [lock.token], keys: [lock.key] },
    ),
  );
}

export async function writeProviderLookupCache<T>(key: string, value: T, ttlSeconds: number) {
  if (!redisConfigured()) return false;
  const result = await redisOperation((redis) =>
    redis.set(key, JSON.stringify(value), { EX: ttlSeconds }),
  );
  return result === "OK";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForProviderLookupCache<T>(key: string) {
  for (const delay of POLL_DELAYS_MS) {
    await wait(delay);
    const cached = await readProviderLookupCache<T>(key);
    if (cached === undefined) return undefined;
    if (cached) return cached;
  }
  return null;
}

export async function providerLookupContentionResetAt(key: string) {
  const remaining = await redisOperation((redis) => redis.pTTL(`${key}:lock`));
  return Date.now() + (typeof remaining === "number" && remaining > 0 ? remaining : 5_000);
}

export type ProviderLookupCacheResult<T> =
  | { cached: boolean; status: "success"; value: T }
  | { resetAt: number; status: "contended" };

export async function withProviderLookupCache<T>(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<T>;
  ttlSeconds: number;
}): Promise<ProviderLookupCacheResult<T>> {
  let cacheAvailable = redisConfigured();
  if (!input.fresh && cacheAvailable) {
    const cached = await readProviderLookupCache<T>(input.key);
    if (cached === undefined) cacheAvailable = false;
    else if (cached) return { cached: true, status: "success", value: cached };
  }
  const lock = cacheAvailable ? await acquireProviderLookupLock(input.key) : undefined;
  if (lock === undefined) cacheAvailable = false;
  if (cacheAvailable && lock === null) {
    const cached = await waitForProviderLookupCache<T>(input.key);
    if (cached === undefined) cacheAvailable = false;
    else if (!input.fresh && cached) return { cached: true, status: "success", value: cached };
    else return { resetAt: await providerLookupContentionResetAt(input.key), status: "contended" };
  }
  if (lock && !input.fresh) {
    const cached = await readProviderLookupCache<T>(input.key);
    if (cached) {
      await releaseProviderLookupLock(lock);
      return { cached: true, status: "success", value: cached };
    }
  }
  try {
    const value = await input.load();
    await Promise.resolve(
      cacheAvailable
        ? writeProviderLookupCache(input.key, value, input.ttlSeconds)
        : Promise.resolve(false),
    ).catch(() => false);
    return { cached: false, status: "success", value };
  } finally {
    await Promise.resolve(releaseProviderLookupLock(lock)).catch(() => undefined);
  }
}
