import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bearer: vi.fn(),
  verify: vi.fn(),
  policy: vi.fn(),
  user: vi.fn(),
  redis: vi.fn(),
  eval: vi.fn(),
  server: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({
  ApiAuthError: class extends Error {},
  authenticateBearer: mocks.bearer,
}));
vi.mock("@/lib/auth/auth", () => ({
  AUTH_URL: "https://example.org",
  AUTH_URL_CONFIGURED: true,
  MCP_RESOURCE_URL: "https://example.com/api/mcp",
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/queries/oauth-consent", () => ({ getOAuthClientScopePolicy: mocks.policy }));
vi.mock("better-auth/oauth2", () => ({ verifyAccessToken: mocks.verify }));
vi.mock("@/lib/redis/redis", () => ({ redisConfigured: () => true, getRedisClient: mocks.redis }));
vi.mock("./server", () => ({ createBisibilityMcpServer: mocks.server }));

import { handleMcpHttpRequest } from "./transport";

function request(token: string) {
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "request-1", method: "tools/list" }),
  });
}

describe("MCP dependency failures through real auth and limiter code", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "");
    mocks.bearer.mockResolvedValue({ kind: "project_key", apiKey: { id: "key" } });
    mocks.verify.mockResolvedValue({ sub: "user", client_id: "test-client", scope: "read" });
    mocks.policy.mockResolvedValue({
      name: "Example",
      redirectUris: ["https://example.org/callback"],
    });
    mocks.user.mockResolvedValue({ id: "user", memberships: [], deactivatedAt: null });
    mocks.redis.mockResolvedValue({ eval: mocks.eval });
    mocks.eval.mockResolvedValue([1, 60, 59, Date.now() + 60_000]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ["connect", "redis"],
    ["eval", "eval"],
  ] as const)("fails closed on Redis %s rejection", async (_stage, mock) => {
    mocks[mock].mockRejectedValueOnce(
      Object.assign(new Error("private Redis address"), { code: "ECONNREFUSED" }),
    );
    const response = await handleMcpHttpRequest(request("bsb_key_test_example"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: "request-1",
      error: { code: -32603 },
    });
    expect(mocks.server).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({ phase: "rate_limit" }),
    );
  });

  it.each([null, {}, [1, "invalid", 2, 3]])(
    "rejects invalid limiter replies without fallback: %j",
    async (reply) => {
      mocks.eval.mockResolvedValueOnce(reply);
      const response = await handleMcpHttpRequest(request("bsb_key_test_example"));
      expect(response.status).toBe(500);
      expect(await response.json()).toHaveProperty("error.code", -32603);
      expect(mocks.server).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["policy", "oauth_scope"],
    ["user", "user_lookup"],
  ] as const)("contains OAuth %s storage rejection", async (mock, stage) => {
    mocks[mock].mockRejectedValueOnce(
      Object.assign(new Error("SQL with private data"), { code: "P2024" }),
    );
    const response = await handleMcpHttpRequest(request("oauth-test"));
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error.code", -32603);
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({ phase: stage }),
    );
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SQL with private");
  });

  it("logs OAuth verification infrastructure failure before converting it to a response", async () => {
    mocks.verify.mockRejectedValueOnce(
      Object.assign(new Error("private verification error"), { code: "ECONNRESET" }),
    );
    const response = await handleMcpHttpRequest(request("oauth-test"));
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error");
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "oauth_verify",
        causes: expect.arrayContaining([expect.objectContaining({ code: "ECONNRESET" })]),
      }),
    );
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
  });
});
