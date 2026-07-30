import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  resetRedisClientForTests: vi.fn(),
}));

vi.mock("@/lib/redis/redis", () => redisMocks);

import { resetIdempotencyForTests, withIdempotency } from "./idempotency";

function input() {
  return {
    apiKeyId: "key_1",
    headers: new Headers(),
    method: "POST",
    pathname: "/api/v1/projects",
    req: new Request("https://example.test/api/v1/projects", {
      headers: { "idempotency-key": "idem_1" },
      method: "POST",
    }),
  };
}

describe("withIdempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.getRedisClient.mockResolvedValue(null);
    resetIdempotencyForTests();
    process.env.REDIS_URL = "";
  });

  it("does not execute concurrent duplicate handlers more than once", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = vi.fn(async () => {
      await pending;
      return Response.json({ id: "created" }, { status: 201 });
    });

    const first = withIdempotency(input(), handler);
    while (handler.mock.calls.length === 0) {
      await Promise.resolve();
    }
    const second = withIdempotency(input(), handler);
    release();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledOnce();
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(secondResponse.json()).resolves.toEqual({ id: "created" });
  });

  it("bypasses storage when the request has no idempotency key", async () => {
    const request = input();
    request.req = new Request(request.req.url, { method: "POST" });
    const handler = vi.fn(async () => Response.json({ ok: true }));

    await expect(withIdempotency(request, handler)).resolves.toHaveProperty("status", 200);
    await expect(withIdempotency(request, handler)).resolves.toHaveProperty("status", 200);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(redisMocks.getRedisClient).not.toHaveBeenCalled();
  });

  it("replays a completed response and refreshes rate-limit headers", async () => {
    const handler = vi.fn(async () =>
      Response.json(
        { id: "created" },
        { headers: { "ratelimit-remaining": "9", "x-source": "handler" }, status: 201 },
      ),
    );
    const first = await withIdempotency(input(), handler);
    const replayInput = input();
    replayInput.headers.set("ratelimit-remaining", "8");
    replayInput.headers.set("x-ratelimit-limit", "10");

    const replay = await withIdempotency(replayInput, handler);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(replay.headers.get("ratelimit-remaining")).toBe("8");
    expect(replay.headers.get("x-ratelimit-limit")).toBe("10");
    expect(replay.headers.get("x-source")).toBe("handler");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("releases a waiting duplicate when the claimed handler fails", async () => {
    let rejectHandler!: (error: Error) => void;
    const pending = new Promise<Response>((_resolve, reject) => {
      rejectHandler = reject;
    });
    const handler = vi.fn(() => pending);

    const first = withIdempotency(input(), handler);
    while (handler.mock.calls.length === 0) await Promise.resolve();
    const firstRejection = expect(first).rejects.toThrow("write failed");
    const duplicate = withIdempotency(input(), handler);
    await Promise.resolve();
    rejectHandler(new Error("write failed"));

    await firstRejection;
    const response = await duplicate;
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "A request with this Idempotency-Key is still in progress.",
      status: 409,
    });
  });

  it("uses Redis for claims and replays stored responses", async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, options?: { NX?: boolean }) => {
        if (options?.NX && values.has(key)) return null;
        values.set(key, value);
        return "OK";
      }),
    };
    redisMocks.getRedisClient.mockResolvedValue(redis);
    const handler = vi.fn(async () => Response.json({ id: "redis" }, { status: 202 }));

    const first = await withIdempotency(input(), handler);
    const replay = await withIdempotency(input(), handler);

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(replay.json()).resolves.toEqual({ id: "redis" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("falls back to memory when Redis connection or claiming fails", async () => {
    redisMocks.getRedisClient.mockRejectedValueOnce(new Error("redis offline"));
    const handler = vi.fn(async () => Response.json({ fallback: true }));
    await expect(withIdempotency(input(), handler)).resolves.toHaveProperty("status", 200);

    resetIdempotencyForTests();
    redisMocks.getRedisClient.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(async () => {
        throw new Error("claim failed");
      }),
    });
    await expect(withIdempotency(input(), handler)).resolves.toHaveProperty("status", 200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("replays legacy Redis response envelopes", async () => {
    const stored = {
      body: JSON.stringify({ legacy: true }),
      expiresAt: Date.now() + 60_000,
      headers: [["content-type", "application/json"]],
      status: 207,
    };
    redisMocks.getRedisClient.mockResolvedValue({
      get: vi.fn(async () => JSON.stringify(stored)),
      set: vi.fn(async () => null),
    });
    const handler = vi.fn();

    const response = await withIdempotency(input(), handler);

    expect(response.status).toBe(207);
    expect(response.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(response.json()).resolves.toEqual({ legacy: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("waits for a concurrent Redis claim to complete", async () => {
    const completed = {
      response: {
        body: JSON.stringify({ completed: true }),
        expiresAt: Date.now() + 60_000,
        headers: [["content-type", "application/json"]],
        status: 201,
      },
      state: "completed",
    };
    const get = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ expiresAt: Date.now() + 30_000, state: "in_progress" }),
      )
      .mockResolvedValueOnce(JSON.stringify(completed));
    redisMocks.getRedisClient.mockResolvedValue({ get, set: vi.fn(async () => null) });

    const response = await withIdempotency(input(), vi.fn());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ completed: true });
    expect(get).toHaveBeenCalledTimes(2);
  });
});
