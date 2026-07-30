import { getRedisClient, redisConfigured } from "@/lib/redis/redis";

const safeResetIdentifier = /^(?=.{1,200}$)[A-Za-z0-9._@-]+$/;

export type ResetBucketsResult = { backend: "memory" | "redis"; deleted: number };

type MemoryBucket = { bucketKey: string };

function matchesIdentifier(bucketKey: string, identifier: string) {
  return (
    bucketKey === identifier ||
    bucketKey.startsWith(`${identifier}:`) ||
    bucketKey.endsWith(`:${identifier}`) ||
    bucketKey.includes(`:${identifier}:`)
  );
}

export async function resetScopedBuckets(
  identifier: string,
  memoryBuckets: Map<string, MemoryBucket>,
): Promise<ResetBucketsResult> {
  if (!safeResetIdentifier.test(identifier)) {
    throw new TypeError("Rate limit reset identifier is invalid.");
  }
  if (!redisConfigured()) {
    const matches = [...memoryBuckets]
      .filter(([, bucket]) => matchesIdentifier(bucket.bucketKey, identifier))
      .map(([key]) => key);
    for (const key of matches) memoryBuckets.delete(key);
    return { backend: "memory", deleted: matches.length };
  }

  const client = await getRedisClient();
  if (!client) throw new Error("Redis rate limit reset is unavailable.");
  const keys = new Set<string>();
  for (const pattern of [`*:${identifier}`, `*:${identifier}:*`]) {
    for await (const batch of client.scanIterator({ COUNT: 100, MATCH: pattern })) {
      for (const key of batch) {
        if (matchesIdentifier(key, identifier)) keys.add(key);
      }
    }
  }
  const matches = [...keys];
  let deleted = 0;
  for (let index = 0; index < matches.length; index += 100) {
    deleted += await client.unlink(matches.slice(index, index + 100));
  }
  return { backend: "redis", deleted };
}
