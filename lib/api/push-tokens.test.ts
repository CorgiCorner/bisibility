import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  deletePushToken: vi.fn(),
  listPushTokens: vi.fn(),
  registerPushToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notifications/push-tokens", () => mocks);

vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: async () => ({ success: true, headers: new Headers() }),
}));
vi.mock("./idempotency", () => ({
  withIdempotency: (_input: unknown, run: () => unknown) => run(),
}));
vi.mock("@/lib/achievements/api", () => ({
  withPracticeRequest: (_input: unknown, _operation: string, run: () => unknown) => run(),
}));
vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);

import { dispatchAccountRoute } from "./account-routes";
import type { PersonalApiContext } from "./context";
import { operationPolicyForRequest } from "./operation-policy";
import { handleApiRequest } from "./router";

const TOKEN = "AB".repeat(32);
const row = {
  bundleId: "com.example.app",
  createdAt: new Date("2026-10-17T12:00:00Z"),
  environment: "sandbox",
  id: "row_1",
  lastSeenAt: new Date("2026-10-17T12:00:00Z"),
  publicId: "dpt_a00000000000000000000000",
  revokedAt: null,
  token: TOKEN.toLowerCase(),
  updatedAt: new Date("2026-10-17T12:00:00Z"),
  userId: "user_1",
};

function context(method: string, path: string[], body?: unknown): PersonalApiContext {
  const url = new URL(`https://app.example.com/api/v1/${path.join("/")}`);
  return {
    auth: {
      kind: "personal_token",
      memberships: [],
      token: {
        id: "pat_1",
        name: "iPhone",
        prefix: "bsb",
        publicId: null,
        scopes: ["read"],
        userId: "user_1",
      },
      user: { email: "owner@example.com", id: "user_1", name: "Owner", publicId: "usr_1" },
    },
    headers: new Headers(),
    instance: `urn:bisibility:api:v1:${url.pathname}`,
    method,
    path,
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method,
    }),
    url,
  } as PersonalApiContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registerPushToken.mockResolvedValue(row);
  mocks.listPushTokens.mockResolvedValue([row]);
  mocks.deletePushToken.mockResolvedValue(row);
});

describe("device push token routes", () => {
  it("are personal-token routes available to read-scope tokens", () => {
    for (const [method, path] of [
      ["GET", ["me", "push-tokens"]],
      ["POST", ["me", "push-tokens"]],
      ["DELETE", ["me", "push-tokens", row.publicId]],
    ] as const) {
      expect(operationPolicyForRequest(method, path)).toMatchObject({ requiredScope: "read" });
    }
  });

  it("registers a token without echoing it back", async () => {
    const response = await dispatchAccountRoute(
      context("POST", ["me", "push-tokens"], {
        bundle_id: "com.example.app",
        environment: "sandbox",
        token: TOKEN,
      }),
    );
    expect(mocks.registerPushToken).toHaveBeenCalledWith("user_1", {
      bundleId: "com.example.app",
      environment: "sandbox",
      token: TOKEN,
    });
    const body = await response?.json();
    expect(body).toEqual({
      bundle_id: "com.example.app",
      created_at: "2026-10-17T12:00:00.000Z",
      environment: "sandbox",
      id: row.publicId,
      last_seen_at: "2026-10-17T12:00:00.000Z",
      token_suffix: TOKEN.toLowerCase().slice(-8),
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN.toLowerCase());
  });

  it("rejects malformed tokens and unknown fields", async () => {
    await expect(
      dispatchAccountRoute(
        context("POST", ["me", "push-tokens"], {
          bundle_id: "com.example.app",
          environment: "sandbox",
          token: "not-hex",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      dispatchAccountRoute(
        context("POST", ["me", "push-tokens"], {
          bundle_id: "com.example.app",
          environment: "sandbox",
          token: TOKEN,
          user_id: "usr_other",
        }),
      ),
    ).rejects.toThrow();
    expect(mocks.registerPushToken).not.toHaveBeenCalled();
  });

  it("deletes only the caller's own token and validates the id", async () => {
    const response = await dispatchAccountRoute(
      context("DELETE", ["me", "push-tokens", row.publicId]),
    );
    expect(response?.status).toBe(200);
    expect(mocks.deletePushToken).toHaveBeenCalledWith("user_1", row.publicId);
    mocks.deletePushToken.mockResolvedValueOnce(null);
    const missing = await dispatchAccountRoute(
      context("DELETE", ["me", "push-tokens", "dpt_b00000000000000000000000"]),
    );
    expect(missing?.status).toBe(404);
    expect(() => dispatchAccountRoute(context("DELETE", ["me", "push-tokens", "pat_x"]))).toThrow();
  });
});

describe("push token success through the real router", () => {
  it.each(["GET", "POST", "DELETE"])("captures %s", async (method) => {
    const path = ["me", "push-tokens", ...(method === "DELETE" ? [row.publicId] : [])];
    const ctx = context(
      method,
      path,
      method === "POST"
        ? {
            bundle_id: row.bundleId,
            environment: "sandbox",
            token: TOKEN,
          }
        : undefined,
    );
    mocks.authenticate.mockResolvedValue(ctx.auth);
    const response = await handleApiRequest(ctx.req, path);
    expect(response.status).toBe(200);
    const body = await response.json();
    if (method === "GET")
      expect(body).toMatchObject({ data: [{ id: row.publicId }], meta: { next_cursor: null } });
    else expect(body).toHaveProperty("id", row.publicId);
  });
});
