import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPLE_APP_BUNDLE_ID,
  APPLE_ISSUER,
  AppleIdentityError,
  appleNonceDigest,
  verifyAppleIdentityToken,
} from "./apple-identity-token";

const RAW_NONCE = "nnnnnnnnnnnnnnnn0123456789abcdef";
const NOW = new Date("2026-10-19T12:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

type Key = Awaited<ReturnType<typeof generateKeyPair>>;
let current: Key;
let rotated: Key;

async function jwk(key: Key, kid: string) {
  return { ...(await exportJWK(key.publicKey)), alg: "ES256", kid, use: "sig" };
}

async function sign(
  claims: Record<string, unknown> = {},
  options: { key?: Key; kid?: string } = {},
) {
  return new SignJWT({
    aud: APPLE_APP_BUNDLE_ID,
    email: "person@example.com",
    email_verified: "true",
    exp: nowSeconds + 600,
    iat: nowSeconds - 5,
    iss: APPLE_ISSUER,
    nonce: appleNonceDigest(RAW_NONCE),
    sub: "001234.apple-user",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: options.kid ?? "current" })
    .sign((options.key ?? current).privateKey);
}

async function failure(token: Promise<string>, extra: { rawNonce?: string } = {}) {
  const error = await verifyAppleIdentityToken(await token, {
    jwks: createLocalJWKSet({ keys: [await jwk(current, "current")] }),
    now: NOW,
    rawNonce: RAW_NONCE,
    ...extra,
  }).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppleIdentityError);
  return (error as AppleIdentityError).code;
}

beforeAll(async () => {
  current = await generateKeyPair("ES256");
  rotated = await generateKeyPair("ES256");
});

describe("Apple identity token verification", () => {
  it("accepts a token signed by Apple's key for the app with the hashed nonce", async () => {
    const identity = await verifyAppleIdentityToken(await sign({ is_private_email: true }), {
      jwks: createLocalJWKSet({ keys: [await jwk(current, "current")] }),
      now: NOW,
      rawNonce: RAW_NONCE,
    });
    expect(identity).toEqual({
      email: "person@example.com",
      emailVerified: true,
      expiresAt: new Date((nowSeconds + 600) * 1000),
      isPrivateEmail: true,
      sub: "001234.apple-user",
    });
  });

  it("uses lowercase hex SHA-256 of the raw nonce", () => {
    expect(appleNonceDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("rejects the web Services ID and other audiences", async () => {
    expect(await failure(sign({ aud: "com.bisibility.web" }))).toBe("identity_token_invalid");
  });

  it("rejects another issuer", async () => {
    expect(await failure(sign({ iss: "https://issuer.example.com" }))).toBe(
      "identity_token_invalid",
    );
  });

  it("rejects an expired token beyond one minute of skew", async () => {
    expect(await failure(sign({ exp: nowSeconds - 61, iat: nowSeconds - 300 }))).toBe(
      "identity_token_invalid",
    );
  });

  it("rejects a token issued in the future or more than ten minutes ago", async () => {
    expect(await failure(sign({ iat: nowSeconds + 120 }))).toBe("identity_token_invalid");
    expect(await failure(sign({ exp: nowSeconds + 600, iat: nowSeconds - 700 }))).toBe(
      "identity_token_invalid",
    );
  });

  it("rejects a token without a subject", async () => {
    expect(await failure(sign({ sub: undefined }))).toBe("identity_token_invalid");
    expect(await failure(sign({ sub: " " }))).toBe("identity_token_invalid");
  });

  it("rejects a token whose nonce is not the hash of the raw nonce", async () => {
    expect(await failure(sign({ nonce: RAW_NONCE }))).toBe("nonce_mismatch");
    expect(await failure(sign(), { rawNonce: `${RAW_NONCE}x` })).toBe("nonce_mismatch");
    expect(await failure(sign({ nonce: undefined }))).toBe("nonce_mismatch");
  });

  it("rejects a signature from a key Apple does not publish", async () => {
    expect(await failure(sign({}, { key: rotated }))).toBe("identity_token_invalid");
    expect(await failure(sign({}, { key: rotated, kid: "unknown" }))).toBe(
      "identity_token_invalid",
    );
  });

  it("does not mark an unverified email as verified", async () => {
    const identity = await verifyAppleIdentityToken(await sign({ email_verified: "false" }), {
      jwks: createLocalJWKSet({ keys: [await jwk(current, "current")] }),
      now: NOW,
      rawNonce: RAW_NONCE,
    });
    expect(identity.emailVerified).toBe(false);
  });

  it("refetches Apple's key set when a token names a rotated key", async () => {
    let published = [await jwk(current, "current")];
    const fetches: string[] = [];
    const jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
      cooldownDuration: 0,
      [customFetch]: async (url: string) => {
        fetches.push(url);
        return Response.json({ keys: published });
      },
    });
    const options = { jwks, now: NOW, rawNonce: RAW_NONCE };

    await verifyAppleIdentityToken(await sign(), options);
    await verifyAppleIdentityToken(await sign(), options);
    expect(fetches).toHaveLength(1);

    published = [await jwk(rotated, "rotated")];
    await expect(
      verifyAppleIdentityToken(await sign({}, { key: rotated, kid: "rotated" }), options),
    ).resolves.toMatchObject({ sub: "001234.apple-user" });
    expect(fetches).toHaveLength(2);
  });

  it("reports an unreachable key set as an Apple outage, not a bad token", async () => {
    const down = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
      [customFetch]: async () => new Response("unavailable", { status: 503 }),
    });
    const offline = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
      [customFetch]: async () => {
        throw new TypeError("fetch failed");
      },
    });
    for (const jwks of [down, offline]) {
      const error = await verifyAppleIdentityToken(await sign(), {
        jwks,
        now: NOW,
        rawNonce: RAW_NONCE,
      }).catch((caught: unknown) => caught);
      expect((error as AppleIdentityError).code).toBe("apple_unavailable");
    }
  });
});
