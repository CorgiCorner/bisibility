import { generateKeyPairSync, randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Pass-through spy: shows whether a request reached account creation at all.
vi.mock("@/lib/auth/user-creation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/user-creation")>();
  return { prepareUserCreation: vi.fn(original.prepareUserCreation) };
});
vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = "https://auth.example.com";
});

import { authenticateBearer } from "@/lib/api/auth";
import { requireRecentOAuthAuthentication } from "@/lib/api/recent-auth";
import {
  APPLE_APP_BUNDLE_ID,
  APPLE_ISSUER,
  appleNonceDigest,
} from "@/lib/auth/apple-identity-token";
import { decryptAppleToken } from "@/lib/auth/apple-token-storage";
import { auth } from "@/lib/auth/auth";
import { iosOAuthClientCreateData, iosOAuthClientFields } from "@/lib/auth/ios-oauth-client";
import { IOS_OAUTH_CLIENT_ID } from "@/lib/auth/oauth-policy";
import { prepareUserCreation } from "@/lib/auth/user-creation";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";

const ORIGIN = "https://auth.example.com";
const APPLE_ENV = [
  "APPLE_SIGN_IN_CLIENT_IDS",
  "APPLE_SIGN_IN_KEY_ID",
  "APPLE_SIGN_IN_PRIVATE_KEY",
  "APPLE_SIGN_IN_TEAM_ID",
] as const;
const users: string[] = [];
const emails: string[] = [];
const realFetch = globalThis.fetch;

type AppleKey = Awaited<ReturnType<typeof generateKeyPair>>;
let appleKey: AppleKey;
let refreshCounter = 0;
const appleTokenRequests: URLSearchParams[] = [];

function email() {
  const value = `apple-${randomUUID()}@example.com`;
  emails.push(value);
  return value;
}

function rawNonce() {
  return `${randomUUID()}${randomUUID()}`;
}

async function appleJwt(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    aud: APPLE_APP_BUNDLE_ID,
    email_verified: "true",
    exp: now + 600,
    iat: now,
    iss: APPLE_ISSUER,
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "apple-test" })
    .sign(appleKey.privateKey);
}

/** Codes carry the Apple user they belong to; `refused:` codes are rejected like a replay. */
async function appleTokenEndpoint(body: URLSearchParams) {
  appleTokenRequests.push(body);
  const code = body.get("code") ?? "";
  if (code.startsWith("refused:")) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  refreshCounter += 1;
  return Response.json({
    access_token: `apple-access-${refreshCounter}`,
    expires_in: 3600,
    id_token: await appleJwt({ sub: code.replace(/^code:/, "") }),
    refresh_token: `apple-refresh.${refreshCounter}.value`,
    token_type: "Bearer",
  });
}

type SignInInput = {
  code?: string;
  email?: string | null;
  familyName?: string;
  givenName?: string;
  nonce?: string;
  sub: string;
  tokenClaims?: Record<string, unknown>;
};

async function signIn(input: SignInInput) {
  const nonce = input.nonce ?? rawNonce();
  const identity = await appleJwt({
    ...(input.email === null ? {} : { email: input.email ?? email() }),
    nonce: appleNonceDigest(nonce),
    sub: input.sub,
    ...input.tokenClaims,
  });
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/ios/apple`, {
      body: JSON.stringify({
        authorization_code: input.code ?? `code:${input.sub}`,
        family_name: input.familyName,
        given_name: input.givenName,
        identity_token: identity,
        nonce,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  return {
    body: await response.json().catch(() => ({})),
    contentType: response.headers.get("content-type"),
    headers: response.headers,
    status: response.status,
  };
}

async function expectProblem(
  result: Awaited<ReturnType<typeof signIn>>,
  status: number,
  code: string,
) {
  expect(result.status).toBe(status);
  expect(result.contentType).toContain("application/problem+json");
  expect(result.body).toMatchObject({ details: { code }, status });
  expect(result.body).not.toHaveProperty("access_token");
}

async function linkedUser(options: { deactivated?: boolean; twoFactor?: boolean } = {}) {
  const id = `apple-user-${randomUUID()}`;
  const sub = `001.${randomUUID()}`;
  await prisma.user.create({
    data: {
      accounts: { create: { accountId: sub, providerId: "apple", refreshToken: "older" } },
      deactivatedAt: options.deactivated ? new Date() : null,
      email: email(),
      emailVerified: true,
      id,
      name: "Linked",
      publicId: makePublicId("usr"),
      twoFactorEnabled: options.twoFactor ?? false,
    },
  });
  users.push(id);
  return { id, sub };
}

async function appTokenCount(userId: string) {
  return prisma.oauthAccessToken.count({ where: { clientId: IOS_OAUTH_CLIENT_ID, userId } });
}

beforeAll(async () => {
  appleKey = await generateKeyPair("ES256");
  const signingKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
  process.env.APPLE_SIGN_IN_CLIENT_IDS = `com.bisibility.web,${APPLE_APP_BUNDLE_ID}`;
  process.env.APPLE_SIGN_IN_KEY_ID = "TESTKEY";
  process.env.APPLE_SIGN_IN_PRIVATE_KEY = signingKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  process.env.APPLE_SIGN_IN_TEAM_ID = "TESTTEAM";
  const jwk = { ...(await exportJWK(appleKey.publicKey)), alg: "ES256", kid: "apple-test" };
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://appleid.apple.com/auth/keys") return Response.json({ keys: [jwk] });
    if (url === "https://appleid.apple.com/auth/token") {
      return appleTokenEndpoint(new URLSearchParams(init?.body as URLSearchParams));
    }
    if (url.startsWith("https://appleid.apple.com/")) throw new Error(`Unexpected ${url}`);
    return realFetch(input, init);
  });

  await prisma.oauthClient.upsert({
    create: iosOAuthClientCreateData(ORIGIN),
    update: iosOAuthClientFields(ORIGIN),
    where: { clientId: IOS_OAUTH_CLIENT_ID },
  });
  // An existing account keeps first-run setup out of the way on self-host test databases.
  await linkedUser();
});

beforeEach(() => {
  appleTokenRequests.length = 0;
  vi.mocked(prepareUserCreation).mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const key of APPLE_ENV) delete process.env[key];
  await prisma.user.deleteMany({
    where: { OR: [{ id: { in: users } }, { email: { in: emails } }] },
  });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("native Sign in with Apple", () => {
  it("creates an account for an unknown Apple user and issues the iOS app token pair", async () => {
    const sub = `001.${randomUUID()}`;
    const address = email();
    const result = await signIn({ email: address, familyName: "Lovelace", givenName: "Ada", sub });

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.body).toMatchObject({
      access_token: expect.any(String),
      expires_in: 900,
      refresh_token: expect.any(String),
      scope: "openid profile email offline_access api:read api:write",
      token_type: "Bearer",
    });
    expect(result.body.access_token).not.toContain(".");

    const user = await prisma.user.findUniqueOrThrow({
      include: { accounts: true },
      where: { email: address },
    });
    users.push(user.id);
    expect(user).toMatchObject({ emailVerified: true, name: "Ada Lovelace" });
    // New accounts pass the same creation gates as web signups.
    expect(prepareUserCreation).toHaveBeenCalledTimes(1);
    expect(user.accounts).toHaveLength(1);
    const [account] = user.accounts;
    expect(account).toMatchObject({ accountId: sub, providerId: "apple" });
    expect(account.refreshToken).not.toContain("apple-refresh");
    const key = (await auth.$context).secretConfig;
    expect(await decryptAppleToken(account.refreshToken ?? "", key)).toMatch(/^apple-refresh\./);
    expect(appleTokenRequests[0].get("client_id")).toBe(APPLE_APP_BUNDLE_ID);

    const authenticated = await authenticateBearer(
      new Request(`${ORIGIN}/api/v1/me`, {
        headers: { Authorization: `Bearer ${result.body.access_token}` },
      }),
    );
    expect(authenticated).toMatchObject({
      oauthClientId: IOS_OAUTH_CLIENT_ID,
      token: { scopes: ["read", "write"], userId: user.id },
    });
    // A fresh native sign-in counts as recent authentication for account deletion.
    expect(requireRecentOAuthAuthentication(authenticated, { instance: "urn:test" })).toBeNull();

    const rotated = await auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/token`, {
        body: new URLSearchParams({
          client_id: IOS_OAUTH_CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: result.body.refresh_token,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
    );
    expect(rotated.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "auth.sign_in", actorId: user.id, status: "success" },
    });
    expect(audit?.after).toMatchObject({ email: address, method: "apple_native" });
    expect(JSON.stringify(audit)).not.toContain(result.body.access_token);
  });

  it("signs an existing Apple user in without creating another account", async () => {
    const { id, sub } = await linkedUser();
    const before = await prisma.user.count();

    const result = await signIn({ sub });

    expect(result.status).toBe(200);
    expect(await prisma.user.count()).toBe(before);
    expect(await appTokenCount(id)).toBe(1);
    const account = await prisma.account.findFirstOrThrow({
      where: { providerId: "apple", userId: id },
    });
    expect(account.refreshToken).not.toBe("older");
  });

  it("never links an Apple identity to an existing account by email", async () => {
    const existing = await linkedUser();
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });

    const result = await signIn({ email: owner.email, sub: `001.${randomUUID()}` });

    await expectProblem(result, 409, "account_link_required");
    // Refused before any account creation is attempted, and attributed to the existing account.
    expect(prepareUserCreation).not.toHaveBeenCalled();
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "auth.sign_in",
        statusReason: "account_link_required",
        targetId: owner.publicId,
      },
    });
    expect(audit?.actorId).toBeNull();
    expect(await prisma.account.count({ where: { userId: existing.id } })).toBe(1);
    expect(await appTokenCount(existing.id)).toBe(0);
  });

  it("sends accounts with two-factor authentication to the web flow", async () => {
    const { id, sub } = await linkedUser({ twoFactor: true });
    await expectProblem(await signIn({ sub }), 403, "two_factor_required");
    expect(await appTokenCount(id)).toBe(0);
  });

  it("refuses deactivated accounts", async () => {
    const { id, sub } = await linkedUser({ deactivated: true });
    await expectProblem(await signIn({ sub }), 403, "account_deactivated");
    expect(await appTokenCount(id)).toBe(0);
  });

  it("refuses a nonce that was already used", async () => {
    const { sub } = await linkedUser();
    const nonce = rawNonce();
    expect((await signIn({ nonce, sub })).status).toBe(200);
    await expectProblem(await signIn({ nonce, sub }), 401, "nonce_replayed");
  });

  it("rejects identities for another audience or issuer, expired ones and a wrong nonce", async () => {
    const { id, sub } = await linkedUser();
    const now = Math.floor(Date.now() / 1000);
    for (const tokenClaims of [
      { aud: "com.bisibility.web" },
      { iss: "https://issuer.example.com" },
      { exp: now - 120, iat: now - 400 },
    ]) {
      await expectProblem(await signIn({ sub, tokenClaims }), 401, "identity_token_invalid");
    }
    await expectProblem(
      await signIn({ sub, tokenClaims: { nonce: appleNonceDigest(rawNonce()) } }),
      401,
      "nonce_mismatch",
    );
    expect(appleTokenRequests).toHaveLength(0);
    expect(await appTokenCount(id)).toBe(0);
  });

  it("requires Apple to confirm the code for the same Apple user", async () => {
    const { id, sub } = await linkedUser();
    await expectProblem(
      await signIn({ code: `code:001.${randomUUID()}`, sub }),
      401,
      "authorization_code_invalid",
    );
    await expectProblem(
      await signIn({ code: "refused:code", sub }),
      401,
      "authorization_code_invalid",
    );
    expect(await appTokenCount(id)).toBe(0);
  });

  it("needs a verified email to create an account", async () => {
    const sub = `001.${randomUUID()}`;
    await expectProblem(await signIn({ email: null, sub }), 400, "email_required");
    await expectProblem(
      await signIn({ sub, tokenClaims: { email_verified: "false" } }),
      400,
      "email_required",
    );
    expect(await prisma.account.count({ where: { accountId: sub } })).toBe(0);
  });

  it("rejects malformed requests and reports a missing configuration", async () => {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/ios/apple`, {
        body: JSON.stringify({ identity_token: "x", nonce: "short" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ details: { code: "invalid_request" } });

    const { sub } = await linkedUser();
    await prisma.oauthClient.update({
      data: { disabled: true },
      where: { clientId: IOS_OAUTH_CLIENT_ID },
    });
    try {
      await expectProblem(await signIn({ sub }), 503, "apple_sign_in_unavailable");
    } finally {
      await prisma.oauthClient.update({
        data: { disabled: false },
        where: { clientId: IOS_OAUTH_CLIENT_ID },
      });
    }

    const clientIds = process.env.APPLE_SIGN_IN_CLIENT_IDS;
    process.env.APPLE_SIGN_IN_CLIENT_IDS = "com.bisibility.web";
    try {
      await expectProblem(await signIn({ sub }), 503, "apple_sign_in_unavailable");
    } finally {
      process.env.APPLE_SIGN_IN_CLIENT_IDS = clientIds;
    }
  });
});
