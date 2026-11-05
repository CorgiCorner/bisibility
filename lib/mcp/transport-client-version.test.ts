import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  authenticateMcpOAuthRequest: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ MCP_RESOURCE_URL: "https://mcp.example.com/api/mcp" }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { oauthClient: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: async () => ({ success: true, headers: {} }),
  rateLimitExceeded: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./oauth-auth", () => ({
  authenticateMcpOAuthRequest: mocks.authenticateMcpOAuthRequest,
  isApiCredential: (token: string) => token.startsWith("bsb_key_"),
  requireBearerToken: (req: Request) =>
    req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
}));

import { resetMcpClientNameCacheForTests } from "./client-version-gate";
import { handleMcpHttpRequest } from "./transport";

const user = { email: "user@example.com", id: "user", name: "User", publicId: "usr_1" };
const oauthAuth = (oauthClientId: string) => ({
  auth: {
    kind: "personal_token",
    memberships: [],
    oauthClientId,
    token: {
      id: "oauth:1",
      name: "MCP OAuth",
      prefix: "oauth",
      publicId: null,
      scopes: [],
      userId: "user",
    },
    user,
  },
});

function initialize(token: string, client?: string) {
  const headers = new Headers({
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  if (client) headers.set("X-Bisibility-Client", client);
  return new Request("https://mcp.example.com/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    }),
  });
}

describe("hosted MCP client version floor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpClientNameCacheForTests();
    mocks.authenticateMcpOAuthRequest.mockResolvedValue(oauthAuth("harness-client"));
    mocks.findUnique.mockResolvedValue({ name: "DeepSeek Harness" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("changes nothing while the floor is unset", async () => {
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "");
    expect((await handleMcpHttpRequest(initialize("oauth-token"))).status).toBe(200);
    expect(
      (await handleMcpHttpRequest(initialize("oauth-token", "bisibility-dsh-plugin/0.0.1"))).status,
    ).toBe(200);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a plugin below the floor with 426 and accepts one at it", async () => {
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "0.2.0");
    const refused = await handleMcpHttpRequest(
      initialize("oauth-token", "bisibility-dsh-plugin/0.1.9"),
    );
    expect(refused.status).toBe(426);
    expect((await refused.json()).error.data).toMatchObject({
      clientVersion: "0.1.9",
      minVersion: "0.2.0",
    });
    expect(
      (await handleMcpHttpRequest(initialize("oauth-token", "bisibility-dsh-plugin/0.2.0"))).status,
    ).toBe(200);
  });

  it("treats header-less traffic from the plugin's OAuth client as 0.1.0", async () => {
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "0.2.0");
    const refused = await handleMcpHttpRequest(initialize("oauth-token"));
    expect(refused.status).toBe(426);
    expect((await refused.json()).error.data.clientVersion).toBe("0.1.0");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      select: { name: true },
      where: { clientId: "harness-client" },
    });
  });

  it("leaves header-less traffic from other clients and API keys unaffected", async () => {
    vi.stubEnv("DSH_PLUGIN_MIN_VERSION", "0.2.0");
    mocks.findUnique.mockResolvedValue({ name: "Another MCP client" });
    expect((await handleMcpHttpRequest(initialize("oauth-token"))).status).toBe(200);

    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: { id: "key" },
      project: { ownerId: "user" },
    });
    mocks.findUnique.mockClear();
    expect((await handleMcpHttpRequest(initialize("bsb_key_example"))).status).toBe(200);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
