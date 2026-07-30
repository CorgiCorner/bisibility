import "server-only";

import {
  type BisibilityRedisClient,
  getRedisClient,
  resetRedisClientForTests,
} from "@/lib/redis/redis";

const TTL_MS = 24 * 60 * 60 * 1000;
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const IN_PROGRESS_TTL_MS = 30 * 1000;
const IN_PROGRESS_TTL_SECONDS = Math.floor(IN_PROGRESS_TTL_MS / 1000);
const WAIT_FOR_COMPLETION_MS = 1500;
const WAIT_POLL_MS = 50;
const REDIS_PREFIX = "bisibility:api:v1:idempotency";

type StoredResponse = {
  body: string;
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
  | { expiresAt: number; state: "in_progress" }
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

async function writeRedisStored(redis: BisibilityRedisClient, key: string, value: StoredResponse) {
  await redis.set(
    `${REDIS_PREFIX}:${key}`,
    JSON.stringify({ response: value, state: "completed" }),
    { EX: TTL_SECONDS },
  );
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

function replayResponse(stored: StoredResponse, headers: Headers) {
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

async function claimRedis(redis: BisibilityRedisClient, key: string) {
  const marker = JSON.stringify({
    expiresAt: Date.now() + IN_PROGRESS_TTL_MS,
    state: "in_progress",
  });
  const claimed = await redis.set(`${REDIS_PREFIX}:${key}`, marker, {
    EX: IN_PROGRESS_TTL_SECONDS,
    NX: true,
  });
  if (claimed) return { state: "claimed" as const };
  const stored = completedResponse(await readRedisEntry(redis, key));
  return stored ? { response: stored, state: "replay" as const } : { state: "wait" as const };
}

async function handleRedisIdempotency(
  redis: BisibilityRedisClient,
  key: string,
  headers: Headers,
  handler: () => Promise<Response>,
) {
  const claim = await claimRedis(redis, key).catch(() => null);
  if (!claim) return null;
  if (claim.state === "replay") return replayResponse(claim.response, headers);
  if (claim.state === "wait") {
    const stored = await waitForRedisStored(redis, key);
    return stored ? replayResponse(stored, headers) : inProgressResponse(headers);
  }
  const response = await handler();
  const stored = {
    body: await response.clone().text(),
    expiresAt: Date.now() + TTL_MS,
    headers: [...response.headers.entries()],
    status: response.status,
  };
  await writeRedisStored(redis, key, stored).catch(() => undefined);
  return response;
}

export async function withIdempotency(
  input: {
    apiKeyId: string;
    headers: Headers;
    method: string;
    pathname: string;
    req: Request;
  },
  handler: () => Promise<Response>,
) {
  const idempotencyKey = input.req.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return handler();
  }

  const key = storageKey({ ...input, idempotencyKey });
  const redis = await redisClient();
  if (redis) {
    const response = await handleRedisIdempotency(redis, key, input.headers, handler);
    if (response) return response;
  }

  const claim = claimMemory(key);
  if (claim.state === "replay") return replayResponse(claim.response, input.headers);
  if (claim.state === "wait") {
    const stored = await claim.pending.promise;
    return stored ? replayResponse(stored, input.headers) : inProgressResponse(input.headers);
  }

  try {
    const response = await handler();
    const body = await response.clone().text();
    const stored = {
      body,
      expiresAt: Date.now() + TTL_MS,
      headers: [...response.headers.entries()],
      status: response.status,
    };
    responses.set(key, { response: stored, state: "completed" });
    claim.pending.resolve(stored);
    return response;
  } catch (error) {
    responses.delete(key);
    claim.pending.resolve(null);
    throw error;
  }
}

export function resetIdempotencyForTests() {
  responses.clear();
  resetRedisClientForTests();
}
