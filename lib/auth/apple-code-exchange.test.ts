import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPLE_TOKEN_URL,
  AppleCodeExchangeError,
  exchangeAppleAuthorizationCode,
} from "./apple-code-exchange";
import { type AppleRevocationConfig, revokeAppleTokens } from "./apple-token-revocation";
import { decryptAppleToken, encryptAppleToken, isEncryptedAppleToken } from "./apple-token-storage";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const config: AppleRevocationConfig = {
  clientIds: ["com.example.web", "com.bisibility.app"],
  keyId: "KEY123",
  privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  teamId: "TEAM123",
};

function exchange(response: () => Promise<Response>) {
  const requests: { body: URLSearchParams; url: string }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ body: init?.body as URLSearchParams, url: String(url) });
    return response();
  });
  const result = exchangeAppleAuthorizationCode({
    clientId: "com.bisibility.app",
    code: "c0de",
    config,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { requests, result };
}

async function failureCode(response: () => Promise<Response>) {
  const error = await exchange(response).result.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppleCodeExchangeError);
  return (error as AppleCodeExchangeError).code;
}

describe("Apple authorization code exchange", () => {
  it("redeems the code for the app bundle with a signed client secret", async () => {
    const { requests, result } = exchange(async () =>
      Response.json({ id_token: "id.token.value", refresh_token: "rtoken.value" }),
    );
    await expect(result).resolves.toEqual({
      idToken: "id.token.value",
      refreshToken: "rtoken.value",
    });
    expect(requests[0].url).toBe(APPLE_TOKEN_URL);
    expect(requests[0].body.get("grant_type")).toBe("authorization_code");
    expect(requests[0].body.get("client_id")).toBe("com.bisibility.app");
    expect(requests[0].body.get("code")).toBe("c0de");
    const [, claims] = (requests[0].body.get("client_secret") ?? "").split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({
      aud: "https://appleid.apple.com",
      iss: "TEAM123",
      sub: "com.bisibility.app",
    });
  });

  it("reports a refused or replayed code as invalid", async () => {
    expect(
      await failureCode(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
    ).toBe("authorization_code_invalid");
  });

  it("reports Apple outages and incomplete responses as unavailable", async () => {
    expect(await failureCode(async () => new Response("down", { status: 503 }))).toBe(
      "apple_unavailable",
    );
    expect(
      await failureCode(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe("apple_unavailable");
    expect(await failureCode(async () => Response.json({ refresh_token: "r" }))).toBe(
      "apple_unavailable",
    );
  });
});

describe("Apple refresh token storage", () => {
  const versioned = {
    currentVersion: 2,
    keys: new Map([[2, "versioned-secret-for-tests-0002"]]),
    legacySecret: "legacy-secret-for-tests-000001",
  };

  it("encrypts in Better Auth's envelope and decrypts back", async () => {
    for (const key of ["plain-secret-for-tests-000001", versioned]) {
      const stored = await encryptAppleToken("rtoken.value", key);
      expect(stored).not.toContain("rtoken");
      expect(isEncryptedAppleToken(stored)).toBe(true);
      expect(await decryptAppleToken(stored, key)).toBe("rtoken.value");
    }
  });

  it("reads plaintext rows unchanged", async () => {
    expect(await decryptAppleToken("rtoken.value", versioned)).toBe("rtoken.value");
  });

  it("revokes the decrypted refresh token on account deletion", async () => {
    const stored = await encryptAppleToken("rtoken.value", versioned);
    const bodies: URLSearchParams[] = [];
    const result = await revokeAppleTokens([{ accessToken: null, refreshToken: stored }], {
      config,
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(init?.body as URLSearchParams);
        return new Response(null, { status: 200 });
      }) as typeof fetch,
      tokenKey: versioned,
    });
    expect(result).toEqual({ attempted: 1, revoked: 1, skipped: "none" });
    expect(bodies[0].get("token")).toBe("rtoken.value");
  });
});
