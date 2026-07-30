import { getRedisClient } from "@/lib/redis/redis";

const THROTTLE_PREFIX = "ops:throttle:";
const SUPPRESSED_COUNTERS_KEY = "ops:throttle:suppressed";
const SUPPRESSED_COUNTERS_TTL_SECONDS = 48 * 60 * 60;

function throttleKey(dedupeKey: string) {
  return `${THROTTLE_PREFIX}${dedupeKey.trim().slice(0, 200)}`;
}

export async function opsEventIsThrottled(dedupeKey: string, ttlMinutes: number) {
  const redis = await getRedisClient();
  if (!redis) return false;
  const claimed = await redis.set(throttleKey(dedupeKey), "1", {
    EX: Math.max(1, Math.round(ttlMinutes * 60)),
    NX: true,
  });
  if (claimed) return false;
  await redis.hIncrBy(SUPPRESSED_COUNTERS_KEY, dedupeKey, 1);
  await redis.expire(SUPPRESSED_COUNTERS_KEY, SUPPRESSED_COUNTERS_TTL_SECONDS);
  return true;
}

/** Best-effort drain for the daily digest. Concurrent increments may appear in the next digest. */
export async function drainOpsThrottleCounters(): Promise<Record<string, number>> {
  const redis = await getRedisClient();
  if (!redis) return {};
  const values = await redis.hGetAll(SUPPRESSED_COUNTERS_KEY);
  if (Object.keys(values).length) await redis.del(SUPPRESSED_COUNTERS_KEY);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number.parseInt(value, 10) || 0]),
  );
}
