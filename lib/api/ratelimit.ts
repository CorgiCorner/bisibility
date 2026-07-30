import { randomUUID } from "node:crypto";
import { resolveClientIp } from "@/lib/http/client-ip";
import { getRedisClient, redisConfigured, resetRedisClientForTests } from "@/lib/redis/redis";
import { type ResetBucketsResult, resetScopedBuckets } from "./ratelimit-reset";
import { errorResponse } from "./responses";

const HTTP_WINDOW_SECONDS = 60;
const DEFAULT_KEY_LIMIT = 600;
// Personal tokens serve humans/agents rather than high-volume ingestion, so
// their ceiling is deliberately lower than project keys'.
const DEFAULT_PAT_LIMIT = 120;
const DEFAULT_ANON_LIMIT = 60;

type Identity =
  | {
      id: string;
      kind: "api-key";
    }
  | {
      id: string;
      kind: "personal-token";
    }
  | {
      kind: "anonymous";
    };

type LimitResult = {
  headers: Headers;
  success: boolean;
};

// Shared limiter core: `consume` increments the bucket, while scheduler pre-gates
// use `peek` to read capacity without consuming it.
export type LimiterInput = {
  prefix: string;
  bucketKey: string;
  limit: number;
  windowSeconds: number;
};

export type ConsumeResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type PeekResult = {
  limit: number;
  remaining: number;
  resetAt: number;
};

type MemoryBucket = {
  bucketKey: string;
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

const REDIS_CONSUME_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local success = 0

if count < limit then
  redis.call("ZADD", key, now, member)
  count = count + 1
  success = 1
end

redis.call("PEXPIRE", key, window)
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local reset_at = now + window
if oldest[2] then
  reset_at = tonumber(oldest[2]) + window
end

return { success, limit, math.max(0, limit - count), reset_at }
`;

const REDIS_PEEK_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local reset_at = now + window

if count > 0 then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  if oldest[2] then
    reset_at = tonumber(oldest[2]) + window
  end
  redis.call("PEXPIRE", key, window)
end

return { limit, math.max(0, limit - count), reset_at }
`;

export function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limitFor(kind: Identity["kind"]) {
  if (kind === "api-key") {
    return envInt("BISIBILITY_API_KEY_RATE_LIMIT_PER_MINUTE", DEFAULT_KEY_LIMIT);
  }
  if (kind === "personal-token") {
    return envInt("BISIBILITY_PAT_RATE_LIMIT_PER_MINUTE", DEFAULT_PAT_LIMIT);
  }

  return envInt("BISIBILITY_API_ANON_RATE_LIMIT_PER_MINUTE", DEFAULT_ANON_LIMIT);
}

// Null means no proxy header is trusted or the value was unusable; callers must
// not invent a key from it, because that key would be attacker-controlled.
export function clientIpForRequest(req: Request) {
  return resolveClientIp(req.headers);
}

function identityKey(req: Request, identity: Identity) {
  if (identity.kind === "api-key") {
    return `api-key:${identity.id}`;
  }
  if (identity.kind === "personal-token") {
    return `personal-token:${identity.id}`;
  }

  const ip = clientIpForRequest(req);
  return ip ? `anonymous:ip:${ip}` : "anonymous:unidentified";
}

function rateHeaders(limit: number, remaining: number, resetAt: number, success: boolean) {
  const headers = new Headers();
  const resetSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  headers.set("RateLimit-Limit", String(limit));
  headers.set("RateLimit-Remaining", String(Math.max(0, remaining)));
  headers.set("RateLimit-Reset", String(resetSeconds));
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  headers.set("X-RateLimit-Reset", String(resetSeconds));
  if (!success) {
    headers.set("Retry-After", String(resetSeconds));
  }

  return headers;
}

function memoryConsume(key: string, input: LimiterInput): ConsumeResult {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : {
          bucketKey: input.bucketKey,
          count: 0,
          resetAt: now + input.windowSeconds * 1000,
        };

  bucket.count += 1;
  memoryBuckets.set(key, bucket);

  return {
    limit: input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt: bucket.resetAt,
    success: bucket.count <= input.limit,
  };
}

function memoryPeek(key: string, limit: number, windowSeconds: number): PeekResult {
  const now = Date.now();
  const current = memoryBuckets.get(key);
  if (!current || current.resetAt <= now) {
    return { limit, remaining: limit, resetAt: now + windowSeconds * 1000 };
  }

  return { limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function redisBucketKey(input: LimiterInput) {
  return `${input.prefix}:${input.bucketKey}`;
}

function numberAt(reply: unknown[], index: number) {
  const value = Number(reply[index]);
  if (!Number.isFinite(value)) {
    throw new TypeError("Unexpected Redis rate limit reply.");
  }
  return value;
}

function parseConsumeReply(reply: unknown): ConsumeResult {
  if (!Array.isArray(reply)) {
    throw new TypeError("Unexpected Redis rate limit reply.");
  }

  return {
    limit: numberAt(reply, 1),
    remaining: numberAt(reply, 2),
    resetAt: numberAt(reply, 3),
    success: numberAt(reply, 0) === 1,
  };
}

function parsePeekReply(reply: unknown): PeekResult {
  if (!Array.isArray(reply)) {
    throw new TypeError("Unexpected Redis rate limit reply.");
  }

  return {
    limit: numberAt(reply, 0),
    remaining: numberAt(reply, 1),
    resetAt: numberAt(reply, 2),
  };
}

async function redisConsume(input: LimiterInput) {
  if (!redisConfigured()) {
    return null;
  }

  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const now = Date.now();
  const reply = await client.eval(REDIS_CONSUME_SCRIPT, {
    arguments: [
      String(now),
      String(input.windowSeconds * 1000),
      String(input.limit),
      `${now}:${randomUUID()}`,
    ],
    keys: [redisBucketKey(input)],
  });

  return parseConsumeReply(reply);
}

async function redisPeek(input: LimiterInput) {
  if (!redisConfigured()) {
    return null;
  }

  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  const reply = await client.eval(REDIS_PEEK_SCRIPT, {
    arguments: [String(Date.now()), String(input.windowSeconds * 1000), String(input.limit)],
    keys: [redisBucketKey(input)],
  });

  return parsePeekReply(reply);
}

export async function consume(input: LimiterInput): Promise<ConsumeResult> {
  const redisResult = await redisConsume(input);
  if (!redisResult) {
    return memoryConsume(redisBucketKey(input), input);
  }

  return redisResult;
}

export async function peek(input: LimiterInput): Promise<PeekResult> {
  const redisResult = await redisPeek(input);
  if (!redisResult) {
    return memoryPeek(`${input.prefix}:${input.bucketKey}`, input.limit, input.windowSeconds);
  }

  return redisResult;
}

export async function checkRateLimit(req: Request, identity: Identity): Promise<LimitResult> {
  const result = await consume({
    bucketKey: identityKey(req, identity),
    limit: limitFor(identity.kind),
    prefix: `bisibility:api:v1:${identity.kind}`,
    windowSeconds: HTTP_WINDOW_SECONDS,
  });

  return {
    headers: rateHeaders(result.limit, result.remaining, result.resetAt, result.success),
    success: result.success,
  };
}

export function rateLimitExceeded(result: LimitResult) {
  return errorResponse("rate_limited", "Rate limit exceeded.", 429, { headers: result.headers });
}

/** Clears limiter buckets owned by an exact identifier, including its action-scoped buckets. */
export async function resetBucketsFor(identifier: string): Promise<ResetBucketsResult> {
  return resetScopedBuckets(identifier, memoryBuckets);
}

export function resetRateLimitStateForTests() {
  memoryBuckets.clear();
  resetRedisClientForTests();
}
