import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeOauthToken, revokeToken } from "./tokens";

const mocks = vi.hoisted(() => ({
  issuePersonalToken: vi.fn(),
  prisma: { oauthAccessToken: { findUnique: vi.fn() } },
  revokePersonalToken: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./pat-service", () => ({
  issuePersonalToken: mocks.issuePersonalToken,
  listPersonalTokens: vi.fn(),
  revokePersonalToken: mocks.revokePersonalToken,
}));

function request(token: string) {
  return new Request("https://example.com/api/v1/me/tokens", {
    body: JSON.stringify({ expires_in_days: 90, name: "CLI", scope: "admin" }),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
}

describe("OAuth personal-token exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issuePersonalToken.mockResolvedValue({
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
      expiresAt: new Date("2026-10-10T00:00:00.000Z"),
      id: "pat_1",
      lastUsedAt: null,
      maskedValue: "bsb_pat_live_example******abcd",
      name: "CLI",
      prefix: "bsb_pat_live_example",
      publicId: "pat_a00000000000000000000000",
      raw: "bsb_pat_live_example-secret",
      revokedAt: null,
      scopes: ["read", "write", "admin"],
    });
  });

  it("looks up the plugin-compatible token hash and requires tokens:write", async () => {
    const raw = "opaque-oauth-token";
    mocks.prisma.oauthAccessToken.findUnique.mockResolvedValue({
      clientId: "bisibility-cli",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      scopes: ["openid", "tokens:write"],
      userId: "user_1",
    });

    const response = await exchangeOauthToken(request(raw), new URL("https://example.com"), {
      headers: new Headers(),
      instance: "urn:test",
    });

    expect(response.status).toBe(201);
    expect(mocks.prisma.oauthAccessToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: createHash("sha256").update(raw).digest("base64url") },
      }),
    );
    expect(mocks.issuePersonalToken).toHaveBeenCalledWith(
      "user_1",
      { expiresInDays: 90, name: "CLI", scope: "admin" },
      { action: "pat.exchange_login", viaClientId: "bisibility-cli" },
    );
    await expect(response.json()).resolves.toMatchObject({ token: "bsb_pat_live_example-secret" });
  });

  it("rejects OAuth tokens without tokens:write", async () => {
    mocks.prisma.oauthAccessToken.findUnique.mockResolvedValue({
      clientId: "bisibility-cli",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      scopes: ["openid"],
      userId: "user_1",
    });

    const response = await exchangeOauthToken(
      request("opaque-oauth-token"),
      new URL("https://example.com"),
      { headers: new Headers(), instance: "urn:test" },
    );

    expect(response.status).toBe(403);
    expect(mocks.issuePersonalToken).not.toHaveBeenCalled();
  });

  it("revokes the authenticated token by its public ID for DELETE current", async () => {
    const revoked = {
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
      expiresAt: null,
      id: "pat_db_1",
      lastUsedAt: new Date("2026-07-27T00:00:00.000Z"),
      name: "CLI",
      prefix: "bsb_pat_live_example",
      publicId: "pat_a00000000000000000000000",
      revokedAt: new Date("2026-07-27T12:00:00.000Z"),
      scopes: ["read", "write"],
    };
    mocks.revokePersonalToken.mockResolvedValue(revoked);
    const ctx = {
      auth: {
        kind: "personal_token",
        memberships: [],
        token: {
          id: "pat_db_1",
          name: "CLI",
          prefix: "bsb_pat_live_example",
          publicId: "pat_a00000000000000000000000",
          scopes: ["read", "write"],
          userId: "user_db_1",
        },
        user: {
          email: "owner@example.com",
          id: "user_db_1",
          name: "Owner",
          publicId: "usr_a00000000000000000000000",
        },
      },
      headers: new Headers(),
      instance: "urn:test",
    } as never;

    const response = await revokeToken(ctx, "current");

    expect(mocks.revokePersonalToken).toHaveBeenCalledWith(
      "user_db_1",
      "pat_a00000000000000000000000",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "pat_a00000000000000000000000",
    });
  });
});
