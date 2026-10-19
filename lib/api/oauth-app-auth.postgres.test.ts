import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = "https://auth.example.com";
});

import { auth, MCP_RESOURCE_URL } from "@/lib/auth/auth";
import { iosOAuthClientCreateData, iosOAuthClientFields } from "@/lib/auth/ios-oauth-client";
import { IOS_OAUTH_CLIENT_ID } from "@/lib/auth/oauth-policy";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { ApiAuthError, authenticateBearer } from "./auth";
import { requireRecentOAuthAuthentication } from "./recent-auth";
import { handleApiRequest } from "./router";
import { exchangeOauthToken } from "./tokens";

const ORIGIN = "https://auth.example.com";
const users: string[] = [];
const clients: string[] = [];

function digest(raw: string) {
  return createHash("sha256").update(raw).digest("base64url");
}

function opaque() {
  return randomBytes(24).toString("base64url").replace(/[-_]/g, "x");
}

function bearer(token: string, path = "/api/v1/me") {
  return new Request(`${ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function user() {
  const id = `app-oauth-user-${randomUUID()}`;
  await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, id, name: "App", publicId: makePublicId("usr") },
  });
  users.push(id);
  return id;
}

async function client(clientId: string, scopes: string[]) {
  await prisma.oauthClient.create({
    data: {
      clientId,
      contacts: [],
      grantTypes: ["authorization_code", "refresh_token"],
      postLogoutRedirectUris: [],
      public: true,
      redirectUris: ["https://callback.example.com/return"],
      responseTypes: ["code"],
      scopes,
      tokenEndpointAuthMethod: "none",
    },
  });
  clients.push(clientId);
}

/** A refresh row exactly as the provider stores it after an authorization-code grant. */
async function grant(
  userId: string,
  options: { authTime?: Date | null; clientId?: string; scopes?: string[] } = {},
) {
  const raw = opaque();
  await prisma.oauthRefreshToken.create({
    data: {
      authTime: options.authTime === undefined ? new Date() : options.authTime,
      clientId: options.clientId ?? IOS_OAUTH_CLIENT_ID,
      expiresAt: new Date(Date.now() + 86_400_000),
      scopes: options.scopes ?? ["openid", "offline_access", "api:read", "api:write"],
      token: digest(raw),
      userId,
    },
  });
  return raw;
}

async function tokenEndpoint(fields: Record<string, string>, path = "/api/auth/oauth2/token") {
  const response = await auth.handler(
    new Request(`${ORIGIN}${path}`, {
      body: new URLSearchParams(fields),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    }),
  );
  return { body: await response.json().catch(() => ({})), status: response.status };
}

function refresh(refreshToken: string, extra: Record<string, string> = {}) {
  return tokenEndpoint({
    client_id: IOS_OAUTH_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...extra,
  });
}

async function rejected(token: string) {
  await expect(authenticateBearer(bearer(token))).rejects.toBeInstanceOf(ApiAuthError);
}

async function directAccessToken(
  userId: string,
  clientId: string,
  scopes: string[],
  ttlMs = 600_000,
) {
  const raw = opaque();
  await prisma.oauthAccessToken.create({
    data: {
      clientId,
      expiresAt: new Date(Date.now() + ttlMs),
      scopes,
      token: digest(raw),
      userId,
    },
  });
  return raw;
}

beforeAll(async () => {
  await prisma.oauthClient.upsert({
    create: {
      clientId: "bisibility-cli",
      contacts: [],
      grantTypes: ["authorization_code", "refresh_token"],
      postLogoutRedirectUris: [],
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      responseTypes: ["code"],
      scopes: ["openid", "profile", "email", "offline_access", "tokens:write"],
      tokenEndpointAuthMethod: "none",
    },
    update: {},
    where: { clientId: "bisibility-cli" },
  });
  await prisma.oauthClient.upsert({
    create: iosOAuthClientCreateData(ORIGIN),
    update: iosOAuthClientFields(ORIGIN),
    where: { clientId: IOS_OAUTH_CLIENT_ID },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.oauthClient.deleteMany({ where: { clientId: { in: clients } } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("app OAuth tokens on /api/v1", () => {
  it("accepts a rotated opaque app token with read and write, a 15-minute life and the sign-in time", async () => {
    const userId = await user();
    const authTime = new Date(Date.now() - 120_000);
    const issued = await refresh(await grant(userId, { authTime }));

    expect(issued.status).toBe(200);
    expect(issued.body.access_token).not.toContain(".");
    expect(issued.body.expires_in).toBe(900);
    expect(issued.body.refresh_token).toEqual(expect.any(String));
    const authenticated = await authenticateBearer(bearer(issued.body.access_token));
    expect(authenticated).toMatchObject({
      kind: "personal_token",
      oauthClientId: IOS_OAUTH_CLIENT_ID,
      token: { scopes: ["read", "write"], userId },
    });
    expect(authenticated.kind === "personal_token" && authenticated.authTime?.getTime()).toBe(
      authTime.getTime(),
    );
    expect(requireRecentOAuthAuthentication(authenticated, { instance: "urn:test" })).toBeNull();

    const me = await handleApiRequest(bearer(issued.body.access_token), ["me"]);
    expect(me.status).toBe(200);
  });

  it("maps a narrowed api:read grant to read only and refuses admin operations", async () => {
    const userId = await user();
    const issued = await refresh(await grant(userId), { scope: "openid api:read" });
    expect(issued.status).toBe(200);
    const authenticated = await authenticateBearer(bearer(issued.body.access_token));
    expect(authenticated).toMatchObject({ token: { scopes: ["read"] } });

    const tokens = await handleApiRequest(bearer(issued.body.access_token, "/api/v1/me/tokens"), [
      "me",
      "tokens",
    ]);
    expect(tokens.status).toBe(403);
  });

  it("revokes the whole grant when a rotated refresh token is replayed", async () => {
    const userId = await user();
    const original = await grant(userId);
    const rotated = await refresh(original);
    expect(rotated.status).toBe(200);
    await authenticateBearer(bearer(rotated.body.access_token));

    const replay = await refresh(original);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    await rejected(rotated.body.access_token);
    expect(
      await prisma.oauthRefreshToken.count({ where: { clientId: IOS_OAUTH_CLIENT_ID, userId } }),
    ).toBe(0);
    expect((await refresh(rotated.body.refresh_token)).status).toBe(400);
  });

  it("revokes the refresh token and its access tokens on sign-out", async () => {
    const userId = await user();
    const issued = await refresh(await grant(userId));
    const revoked = await tokenEndpoint(
      {
        client_id: IOS_OAUTH_CLIENT_ID,
        token: issued.body.refresh_token,
        token_type_hint: "refresh_token",
      },
      "/api/auth/oauth2/revoke",
    );

    expect(revoked.status).toBe(200);
    await rejected(issued.body.access_token);
    expect((await refresh(issued.body.refresh_token)).status).toBe(400);
  });

  it("rejects tokens of other clients, JWTs, expired tokens and grants without api scopes", async () => {
    const userId = await user();
    const registered = `registered-${randomUUID()}`;
    await client(registered, ["openid", "read", "api:read"]);

    await rejected(await directAccessToken(userId, registered, ["openid", "api:read"]));
    await rejected(await directAccessToken(userId, "bisibility-cli", ["read", "write", "admin"]));
    await rejected(await directAccessToken(userId, IOS_OAUTH_CLIENT_ID, ["api:write"], -1_000));
    await rejected(
      await directAccessToken(userId, IOS_OAUTH_CLIENT_ID, ["openid", "read", "admin"]),
    );
    // Synthetic unsigned token ({"alg":"EdDSA"}.{"sub":"user"}.signature) that /api/v1 must refuse.
    // nosemgrep: generic.secrets.security.detected-jwt-token.detected-jwt-token
    await rejected("eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl");

    // Naming the MCP resource yields a JWT; /api/v1 must refuse it even for the app client.
    const jwt = await refresh(await grant(userId), { resource: MCP_RESOURCE_URL });
    expect(jwt.status).toBe(200);
    expect(jwt.body.access_token.split(".")).toHaveLength(3);
    await rejected(jwt.body.access_token);
  });

  it("rejects disabled clients, deactivated accounts and deleted accounts", async () => {
    const userId = await user();
    const raw = await directAccessToken(userId, IOS_OAUTH_CLIENT_ID, ["api:write"]);
    await authenticateBearer(bearer(raw));

    await prisma.oauthClient.update({
      data: { disabled: true },
      where: { clientId: IOS_OAUTH_CLIENT_ID },
    });
    try {
      await rejected(raw);
    } finally {
      await prisma.oauthClient.update({
        data: { disabled: false },
        where: { clientId: IOS_OAUTH_CLIENT_ID },
      });
    }

    await prisma.user.update({ data: { deactivatedAt: new Date() }, where: { id: userId } });
    await rejected(raw);

    const deleted = await user();
    const deletedToken = await refresh(await grant(deleted));
    await prisma.user.delete({ where: { id: deleted } });
    await rejected(deletedToken.body.access_token);
    expect(await prisma.oauthRefreshToken.count({ where: { userId: deleted } })).toBe(0);
  });

  it("requires a sign-in from the last 10 minutes for destructive account operations", async () => {
    const userId = await user();
    for (const authTime of [new Date(Date.now() - 11 * 60_000), null]) {
      const issued = await refresh(await grant(userId, { authTime }));
      const authenticated = await authenticateBearer(bearer(issued.body.access_token));
      const response = requireRecentOAuthAuthentication(authenticated, { instance: "urn:test" });
      expect(response?.status).toBe(403);
      expect(await response?.json()).toMatchObject({
        details: { code: "reauthentication_required", max_age_seconds: 600 },
      });
    }
  });

  it("never exchanges an app token for a personal access token", async () => {
    const userId = await user();
    const raw = await directAccessToken(userId, IOS_OAUTH_CLIENT_ID, ["api:write", "tokens:write"]);
    const response = await exchangeOauthToken(
      new Request(`${ORIGIN}/api/v1/me/tokens`, {
        body: JSON.stringify({ name: "phone" }),
        headers: { Authorization: `Bearer ${raw}` },
        method: "POST",
      }),
      new URL(`${ORIGIN}/api/v1/me/tokens`),
      { headers: new Headers(), instance: "urn:test" },
    );
    expect(response.status).toBe(403);
    expect(await prisma.personalAccessToken.count({ where: { userId } })).toBe(0);
  });

  it("keeps api scopes out of dynamic client registration", async () => {
    const register = (body: Record<string, unknown>) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/oauth2/register`, {
          body: JSON.stringify({
            client_name: "Registered",
            redirect_uris: ["https://callback.example.com/return"],
            token_endpoint_auth_method: "none",
            ...body,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      );

    const refused = await register({ scope: "openid api:read" });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    const accepted = await register({});
    expect(accepted.status).toBeLessThan(300);
    const body = await accepted.json();
    clients.push(body.client_id);
    expect(body.scope.split(" ")).not.toContain("api:read");
    expect(body.scope.split(" ")).not.toContain("api:write");
  });
});
