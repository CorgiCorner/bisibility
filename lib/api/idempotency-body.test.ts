import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRedisClient: vi.fn(), resetRedisClientForTests: vi.fn() }));
vi.mock("@/lib/redis/redis", () => mocks);

import { IDEMPOTENCY_BODY_BYTES, resetIdempotencyForTests, withIdempotency } from "./idempotency";

beforeEach(() => {
  vi.resetAllMocks();
  resetIdempotencyForTests();
});
function input(body: string, fingerprintBody = true) {
  return {
    apiKeyId: "fixture",
    method: "POST",
    pathname: "/runs",
    headers: new Headers(),
    fingerprintBody,
    req: new Request("https://example.test/runs", {
      method: "POST",
      headers: { "Idempotency-Key": "K" },
      body,
    }),
  };
}
function redis() {
  const values = new Map<string, string>();
  mocks.getRedisClient.mockResolvedValue({
    eval: async (script: string, options: { arguments: string[]; keys: string[] }) => {
      const [key] = options.keys;
      const [expected, next] = options.arguments;
      const current = values.get(key);
      if (current !== undefined && current !== expected) return 0;
      if (script.includes("SET")) values.set(key, next);
      else values.delete(key);
      return 1;
    },
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string, options?: { NX?: boolean }) => {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
  });
  return values;
}
it.each(["memory", "redis"])(
  "binds a cached error in %s without changing the answer",
  async (backend) => {
    if (backend === "redis") redis();
    const handler = vi.fn(async () => Response.json({ saved: true }, { status: 503 }));
    const original = input('{"quote":"A"}');
    const first = await withIdempotency(original, handler);
    expect(first.status).toBe(503);
    expect(await original.req.text()).toBe('{"quote":"A"}');
    const replay = await withIdempotency(input('{"quote":"A"}'), handler);
    expect(replay.status).toBe(503);
    expect(await replay.json()).toEqual({ saved: true });
    const changed = await withIdempotency(input('{"quote":"B"}'), handler);
    expect(changed.status).toBe(422);
    const problem = await changed.json();
    expect(problem.type).toContain("validation_failed");
    expect(problem.instance).toBe("urn:bisibility:api:v1:/runs");
    const byteMismatch = await withIdempotency(input('\ufeff{"quote":"A"}'), handler);
    expect(byteMismatch.status).toBe(422);
    expect(handler).toHaveBeenCalledOnce();
  },
);
it.each(["memory", "redis"])(
  "refuses an unbound legacy %s cache entry only when opted in",
  async (backend) => {
    if (backend === "redis") redis();
    const handler = vi.fn(async () => Response.json({ saved: true }));
    expect((await withIdempotency(input("A", false), handler)).status).toBe(200);
    expect((await withIdempotency(input("B", false), handler)).status).toBe(200);
    expect((await withIdempotency(input("A"), handler)).status).toBe(422);
    expect(handler).toHaveBeenCalledOnce();
  },
);
it.each([false, true])("checks a waiting Redis response body (changed=%s)", async (changed) => {
  const values = redis();
  const handler = vi.fn(async () => Response.json({ saved: true }));
  await withIdempotency(input("A"), handler);
  const completed = [...values.values()][0];
  mocks.getRedisClient.mockResolvedValue({
    set: vi.fn(async () => null),
    get: vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ state: "in_progress" }))
      .mockResolvedValue(completed),
  });
  const response = await withIdempotency(input(changed ? "B" : "A"), handler);
  expect(response.status).toBe(changed ? 422 : 200);
  if (changed) expect((await response.json()).instance).toBe("urn:bisibility:api:v1:/runs");
  expect(handler).toHaveBeenCalledOnce();
  if (!changed) {
    const mismatch = await withIdempotency(input("B"), handler);
    expect(mismatch.status).toBe(422);
  }
});

it("refuses an unreadable bound body before claiming its key or invoking the service", async () => {
  const handler = vi.fn(async () => Response.json({ saved: true }));
  const malformed = input("A");
  vi.spyOn(malformed.req, "clone").mockImplementation(() => {
    throw new TypeError("body unreadable");
  });
  const refused = await withIdempotency(malformed, handler);
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({
    instance: "urn:bisibility:api:v1:/runs",
    type: "https://bisibility.com/problems/bad_request",
  });
  expect(handler).not.toHaveBeenCalled();
  expect(mocks.getRedisClient).not.toHaveBeenCalled();
  expect((await withIdempotency(input("A"), handler)).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});

it("names the route when a chunked body cannot be read", async () => {
  const handler = vi.fn(async () => Response.json({ saved: true }));
  const req = input("unused");
  vi.spyOn(req.req, "clone").mockImplementation(() => {
    const headers = new Headers(req.req.headers);
    headers.delete("content-length");
    return new Request(req.req.url, {
      method: "POST",
      headers,
      body: new ReadableStream({
        pull(controller) {
          controller.error(new Error("aborted"));
        },
      }),
      // @ts-expect-error duplex is required for a streaming request body.
      duplex: "half",
    });
  });
  const refused = await withIdempotency(req, handler);
  expect(refused.status).toBe(400);
  expect((await refused.json()).instance).toBe("urn:bisibility:api:v1:/runs");
  expect(handler).not.toHaveBeenCalled();
  expect((await withIdempotency(input("ok"), handler)).status).toBe(200);
});

it("rejects an over-limit content-length before reading or claiming the key", async () => {
  const handler = vi.fn(async () => Response.json({ saved: true }));
  let reads = 0;
  const probe = {
    headers: new Headers({ "content-length": String(IDEMPOTENCY_BODY_BYTES + 1) }),
    clone() {
      return probe;
    },
  };
  Object.defineProperty(probe, "body", {
    get() {
      reads += 1;
      return null;
    },
  });
  const req = input("{}");
  vi.spyOn(req.req, "clone").mockReturnValue(probe as never);
  const refused = await withIdempotency(req, handler);
  expect(refused.status).toBe(413);
  expect(reads).toBe(0);
  expect(await refused.json()).toMatchObject({
    instance: "urn:bisibility:api:v1:/runs",
    status: 413,
    type: "https://bisibility.com/problems/bad_request",
  });
  expect(handler).not.toHaveBeenCalled();
  expect((await withIdempotency(input("{}"), handler)).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});

it("stops hashing a chunked body once it passes the cap", async () => {
  const handler = vi.fn(async () => Response.json({ saved: true }));
  const cancel = vi.fn();
  let pulls = 0;
  const req = input("unused");
  vi.spyOn(req.req, "clone").mockImplementation(() => {
    const headers = new Headers(req.req.headers);
    headers.delete("content-length");
    return new Request(req.req.url, {
      method: "POST",
      headers,
      body: new ReadableStream({
        cancel,
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(new Uint8Array(IDEMPOTENCY_BODY_BYTES + 1));
          else controller.close();
        },
      }),
      // @ts-expect-error duplex is required for a streaming request body.
      duplex: "half",
    });
  });
  const refused = await withIdempotency(req, handler);
  expect(refused.status).toBe(413);
  expect(pulls).toBe(1);
  expect(cancel).toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
  expect((await withIdempotency(input("ok"), handler)).status).toBe(200);
  expect(handler).toHaveBeenCalledOnce();
});
