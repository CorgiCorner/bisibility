import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  type BisibilityRedisClient,
  getRedisClient,
  resetRedisClientForTests,
} from "@/lib/redis/redis";
import { RequestBodyLimitError } from "./errors";
import { errorResponse } from "./responses";
import { readBoundedRequest } from "./surface";

const TTL_MS = 24 * 60 * 60 * 1000;
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const IN_PROGRESS_TTL_MS = 30 * 1000;
const IN_PROGRESS_TTL_SECONDS = Math.floor(IN_PROGRESS_TTL_MS / 1000);
const WAIT_FOR_COMPLETION_MS = 1500;
const WAIT_POLL_MS = 50;
const REDIS_PREFIX = "bisibility:api:v1:idempotency";
// readJsonBody accepts this cap and decodes the same bytes with TextDecoder. Create hashes
// those bytes before the claim. Preview parses through readJsonBody. Route handlers are not
// limited by Next's proxyClientMaxBodySize.
export const IDEMPOTENCY_BODY_BYTES = 10 * 1024 * 1024;

type StoredResponse = {
  body: string;
  bodyFingerprint?: string;
  expiresAt: number;
  headers: [string, string][];
  status: number;
};
type PendingResponse = {
  expiresAt: number;
  promise: Promise<StoredResponse | null>;
  resolve: (value: StoredResponse | null) => void;
  state: "in_progress";
};
type MemoryEntry = PendingResponse | { response: StoredResponse; state: "completed" };
type RedisEntry =
  | StoredResponse
  | { claimToken: string; expiresAt: number; state: "in_progress" }
  | { response: StoredResponse; state: "completed" };

// Replays survive restarts and span instances when Redis/Valkey is configured;
// the in-process Map is a single-process fallback for local dev and tests.
const responses = new Map<string, MemoryEntry>();

async function redisClient() {
  try {
    return await getRedisClient();
  } catch {
    return null;
  }
}

function completedResponse(entry: RedisEntry | null | undefined) {
  if (!entry) return null;
  if ("body" in entry) return entry;
  return entry.state === "completed" ? entry.response : null;
}

async function readRedisEntry(redis: BisibilityRedisClient, key: string) {
  const stored = await redis.get(`${REDIS_PREFIX}:${key}`);
  return stored ? (JSON.parse(stored) as RedisEntry) : null;
}

async function storeRedisClaim(
  redis: BisibilityRedisClient,
  key: string,
  marker: string,
  value: StoredResponse,
) {
  const redisKey = `${REDIS_PREFIX}:${key}`;
  try {
    await redis.eval(STORE_CLAIM_SCRIPT, {
      arguments: [
        marker,
        JSON.stringify({ response: value, state: "completed" }),
        String(TTL_SECONDS),
      ],
      keys: [redisKey],
    });
  } catch {
    console.error("[idempotency] Could not store a completed response.", {
      keyHash: createHash("sha256").update(redisKey).digest("hex"),
    });
  }
}

function purgeExpired(now = Date.now()) {
  for (const [key, value] of responses) {
    const expiresAt = value.state === "completed" ? value.response.expiresAt : value.expiresAt;
    if (expiresAt <= now) {
      responses.delete(key);
    }
  }
}

function createPending(): PendingResponse {
  let resolve!: (value: StoredResponse | null) => void;
  const promise = new Promise<StoredResponse | null>((done) => {
    resolve = done;
  });
  return { expiresAt: Date.now() + IN_PROGRESS_TTL_MS, promise, resolve, state: "in_progress" };
}

function claimMemory(key: string) {
  purgeExpired();
  const existing = responses.get(key);
  if (existing?.state === "completed")
    return { response: existing.response, state: "replay" as const };
  if (existing?.state === "in_progress") return { pending: existing, state: "wait" as const };
  const pending = createPending();
  responses.set(key, pending);
  return { pending, state: "claimed" as const };
}

function storageKey(input: {
  apiKeyId: string;
  idempotencyKey: string;
  method: string;
  pathname: string;
}) {
  return [input.apiKeyId, input.method.toUpperCase(), input.pathname, input.idempotencyKey].join(
    ":",
  );
}

function routeInstance(pathname: string) {
  return `urn:bisibility:api:v1:${pathname}`;
}

function replayResponse(
  stored: StoredResponse,
  headers: Headers,
  instance: string,
  bodyFingerprint?: string,
) {
  if (bodyFingerprint !== undefined && stored.bodyFingerprint !== bodyFingerprint)
    return errorResponse(
      "validation_failed",
      "This Idempotency-Key is not bound to these body bytes. Use a new key for a different body.",
      422,
      { headers, instance },
    );
  const replayHeaders = new Headers(stored.headers);
  for (const [key, value] of headers) {
    if (key.toLowerCase().startsWith("ratelimit") || key.toLowerCase().startsWith("x-ratelimit")) {
      replayHeaders.set(key, value);
    }
  }
  replayHeaders.set("Idempotency-Replayed", "true");

  return new Response(stored.body, { headers: replayHeaders, status: stored.status });
}

function inProgressResponse(headers: Headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/problem+json");
  responseHeaders.set("retry-after", "1");
  return new Response(
    JSON.stringify({
      detail: "A request with this Idempotency-Key is still in progress.",
      status: 409,
      title: "Idempotency key in progress",
      type: "https://bisibility.com/problems/idempotency_in_progress",
    }),
    { headers: responseHeaders, status: 409 },
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRedisStored(redis: BisibilityRedisClient, key: string) {
  const deadline = Date.now() + WAIT_FOR_COMPLETION_MS;
  while (Date.now() < deadline) {
    await delay(WAIT_POLL_MS);
    const stored = completedResponse(await readRedisEntry(redis, key));
    if (stored) return stored;
  }
  return null;
}

const RELEASE_CLAIM_SCRIPT =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';
const STORE_CLAIM_SCRIPT =
  'local v = redis.call("GET", KEYS[1]); if v == ARGV[1] or not v then redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3]); return 1 else return 0 end';

async function claimRedis(redis: BisibilityRedisClient, key: string) {
  const marker = JSON.stringify({
    claimToken: randomUUID(),
    expiresAt: Date.now() + IN_PROGRESS_TTL_MS,
    state: "in_progress",
  });
  const claimed = await redis.set(`${REDIS_PREFIX}:${key}`, marker, {
    EX: IN_PROGRESS_TTL_SECONDS,
    NX: true,
  });
  if (claimed) return { marker, state: "claimed" as const };
  const stored = completedResponse(await readRedisEntry(redis, key));
  return stored ? { response: stored, state: "replay" as const } : { state: "wait" as const };
}

async function releaseRedisClaim(redis: BisibilityRedisClient, key: string, marker: string) {
  await redis
    .eval(RELEASE_CLAIM_SCRIPT, {
      arguments: [marker],
      keys: [`${REDIS_PREFIX}:${key}`],
    })
    .catch(() => undefined);
}

async function handleRedisIdempotency(
  redis: BisibilityRedisClient,
  key: string,
  headers: Headers,
  handler: () => Promise<Response>,
  instance: string,
  bodyFingerprint?: string,
) {
  const claim = await claimRedis(redis, key).catch(() => null);
  if (!claim) return null;
  if (claim.state === "replay")
    return replayResponse(claim.response, headers, instance, bodyFingerprint);
  if (claim.state === "wait") {
    const stored = await waitForRedisStored(redis, key);
    return stored
      ? replayResponse(stored, headers, instance, bodyFingerprint)
      : inProgressResponse(headers);
  }
  try {
    const response = await handler();
    const stored = {
      body: await response.clone().text(),
      ...(bodyFingerprint === undefined ? {} : { bodyFingerprint }),
      expiresAt: Date.now() + TTL_MS,
      headers: [...response.headers.entries()],
      status: response.status,
    };
    await storeRedisClaim(redis, key, claim.marker, stored).catch(() => undefined);
    return response;
  } catch (error) {
    await releaseRedisClaim(redis, key, claim.marker);
    throw error;
  }
}

export async function withIdempotency(
  input: {
    apiKeyId: string;
    headers: Headers;
    method: string;
    pathname: string;
    req: Request;
    /** Opt-in exact-body binding; legacy operations retain their existing replay convention. */
    fingerprintBody?: boolean;
  },
  handler: () => Promise<Response>,
) {
  const idempotencyKey = input.req.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return handler();
  }
  // Hash before dispatch, including disabled/error responses; never consume the handler's body.
  const instance = routeInstance(input.pathname);
  let bodyFingerprint: string | undefined;
  if (input.fingerprintBody) {
    try {
      const bytes = await readBoundedRequest(input.req.clone(), IDEMPOTENCY_BODY_BYTES);
      bodyFingerprint = createHash("sha256").update(bytes).digest("hex");
    } catch (error) {
      if (error instanceof RequestBodyLimitError && error.reason === "too_large")
        return errorResponse("bad_request", error.message, 413, {
          headers: input.headers,
          instance,
        });
      return errorResponse("bad_request", "The request body could not be read.", 400, {
        headers: input.headers,
        instance,
      });
    }
  }

  const key = storageKey({ ...input, idempotencyKey });
  const redis = await redisClient();
  if (redis) {
    const response = await handleRedisIdempotency(
      redis,
      key,
      input.headers,
      handler,
      instance,
      bodyFingerprint,
    );
    if (response) return response;
  }

  const claim = claimMemory(key);
  if (claim.state === "replay")
    return replayResponse(claim.response, input.headers, instance, bodyFingerprint);
  if (claim.state === "wait") {
    const stored = await claim.pending.promise;
    return stored
      ? replayResponse(stored, input.headers, instance, bodyFingerprint)
      : inProgressResponse(input.headers);
  }

  try {
    const response = await handler();
    const body = await response.clone().text();
    const stored = {
      body,
      ...(bodyFingerprint === undefined ? {} : { bodyFingerprint }),
      expiresAt: Date.now() + TTL_MS,
      headers: [...response.headers.entries()],
      status: response.status,
    };
    if (responses.get(key) === claim.pending)
      responses.set(key, { response: stored, state: "completed" });
    claim.pending.resolve(stored);
    return response;
  } catch (error) {
    if (responses.get(key) === claim.pending) responses.delete(key);
    claim.pending.resolve(null);
    throw error;
  }
}

export function resetIdempotencyForTests() {
  responses.clear();
  resetRedisClientForTests();
}
