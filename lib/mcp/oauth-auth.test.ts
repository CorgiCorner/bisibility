import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateMcpOAuthRequest } from "./oauth-auth";

const mocks = vi.hoisted(() => ({
  authUrl: "https://auth.example.com",
  authUrlConfigured: true,
  resourceUrl: "https://resource.example.com/api/mcp",
  userFindUnique: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  get AUTH_URL() {
    return mocks.authUrl;
  },
  get AUTH_URL_CONFIGURED() {
    return mocks.authUrlConfigured;
  },
  get MCP_RESOURCE_URL() {
    return mocks.resourceUrl;
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

vi.mock("better-auth/oauth2", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

function request(token?: string, host = "rank.example.com") {
  const headers = new Headers({
    Host: host,
    "X-Forwarded-Proto": "https",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return new Request(`https://${host}/api/mcp`, { headers, method: "POST" });
}

describe("MCP OAuth authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUrl = "https://auth.example.com";
    mocks.authUrlConfigured = true;
    mocks.resourceUrl = "https://resource.example.com/api/mcp";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses configured verification inputs despite a hostile Host header", async () => {
    mocks.verifyAccessToken.mockResolvedValue({
      scope: "openid read write admin",
      sub: "user_1",
    });
    mocks.userFindUnique.mockResolvedValue({
      deactivatedAt: null,
      email: "owner@example.com",
      id: "user_1",
      memberships: [{ projectId: "project_1", role: "owner" }],
      name: "Owner",
      publicId: "usr_a00000000000000000000000",
    });

    const result = await authenticateMcpOAuthRequest(
      request("oauth-access-token", "attacker.example.com"),
    );

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith("oauth-access-token", {
      jwksUrl: "https://auth.example.com/api/auth/jwks",
      verifyOptions: {
        audience: "https://resource.example.com/api/mcp",
        issuer: "https://auth.example.com",
      },
    });
    expect(result).toMatchObject({
      auth: {
        kind: "personal_token",
        memberships: [{ projectId: "project_1", role: "owner" }],
        token: {
          name: "MCP OAuth",
          scopes: ["read", "write", "admin"],
          userId: "user_1",
        },
      },
    });
  });

  it("ignores the request host when verifying the MCP OAuth trust boundary", async () => {
    mocks.verifyAccessToken.mockResolvedValue({ scope: "read", sub: "user_1" });
    mocks.userFindUnique.mockResolvedValue({
      deactivatedAt: null,
      email: "owner@example.com",
      id: "user_1",
      memberships: [],
      name: "Owner",
      publicId: "usr_a00000000000000000000000",
    });

    await authenticateMcpOAuthRequest(request("oauth-access-token"));

    const verificationOptions = mocks.verifyAccessToken.mock.calls[0]?.[1];
    expect(verificationOptions?.jwksUrl).not.toContain("rank.example.com");
    expect(verificationOptions?.verifyOptions.audience).not.toContain("rank.example.com");
    expect(verificationOptions?.verifyOptions.issuer).not.toContain("rank.example.com");
  });

  it("ignores TRUST_REQUEST_ORIGIN when selecting token verification inputs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("TRUST_REQUEST_ORIGIN", "true");
    mocks.verifyAccessToken.mockResolvedValue({ scope: "read", sub: "user_1" });
    mocks.userFindUnique.mockResolvedValue({
      deactivatedAt: null,
      email: "owner@example.com",
      id: "user_1",
      memberships: [],
      name: "Owner",
      publicId: "usr_a00000000000000000000000",
    });

    await authenticateMcpOAuthRequest(request("oauth-access-token", "attacker.example.com"));

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith("oauth-access-token", {
      jwksUrl: "https://auth.example.com/api/auth/jwks",
      verifyOptions: {
        audience: "https://resource.example.com/api/mcp",
        issuer: "https://auth.example.com",
      },
    });
  });

  it("returns the MCP protected-resource challenge when no token is present", async () => {
    const result = await authenticateMcpOAuthRequest(request());
    if (!("response" in result)) throw new Error("Expected an OAuth challenge response.");

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://resource.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("ignores the request host in the WWW-Authenticate metadata challenge", async () => {
    const result = await authenticateMcpOAuthRequest(request());
    if (!("response" in result)) throw new Error("Expected an OAuth challenge response.");

    expect(result.response.headers.get("www-authenticate")).not.toContain("rank.example.com");
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("keeps the challenge available when no authentication server URL is configured", async () => {
    mocks.authUrl = "http://localhost:3000";
    mocks.authUrlConfigured = false;
    mocks.resourceUrl = "http://localhost:3000/api/mcp";

    const result = await authenticateMcpOAuthRequest(request());
    if (!("response" in result)) throw new Error("Expected an OAuth challenge response.");

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("fails closed when no authentication server URL is configured", async () => {
    mocks.authUrlConfigured = false;

    await expect(authenticateMcpOAuthRequest(request("oauth-access-token"))).rejects.toThrow(
      "MCP OAuth token verification requires BETTER_AUTH_URL to be configured.",
    );
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("rejects verifier failures without emitting temporary diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.verifyAccessToken.mockRejectedValue(new Error("invalid audience"));

    const result = await authenticateMcpOAuthRequest(request("oauth-access-token"));
    if (!("response" in result)) throw new Error("Expected an OAuth rejection response.");

    expect(result.response.status).toBe(401);
    expect(mocks.verifyAccessToken).toHaveBeenCalledWith("oauth-access-token", {
      jwksUrl: "https://auth.example.com/api/auth/jwks",
      verifyOptions: {
        audience: "https://resource.example.com/api/mcp",
        issuer: "https://auth.example.com",
      },
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects tokens without a user subject or bisibility access scope", async () => {
    mocks.verifyAccessToken.mockResolvedValue({ scope: "openid", sub: "user_1" });

    const result = await authenticateMcpOAuthRequest(request("oauth-access-token"));
    if (!("response" in result)) throw new Error("Expected an OAuth rejection response.");

    expect(result.response.status).toBe(401);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});
