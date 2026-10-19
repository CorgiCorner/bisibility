import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type AppleRevocationConfig,
  appleClientSecret,
  appleRevocationConfig,
  revokeAppleTokens,
} from "./apple-token-revocation";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const config: AppleRevocationConfig = {
  clientIds: ["com.example.web", "com.example.app"],
  keyId: "KEY123",
  privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  teamId: "TEAM123",
};

describe("Sign in with Apple token revocation", () => {
  it("signs a short-lived ES256 client secret for the client id", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const [header, payload, signature] = appleClientSecret(config, "com.example.app", now).split(
      ".",
    );
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY123",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      aud: "https://appleid.apple.com",
      exp: now.getTime() / 1000 + 300,
      iat: now.getTime() / 1000,
      iss: "TEAM123",
      sub: "com.example.app",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { dsaEncoding: "ieee-p1363", format: "pem", key: publicPem },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("does nothing without Apple accounts and reports a missing key", async () => {
    const request = vi.fn();
    expect(await revokeAppleTokens([], { config, fetch: request })).toMatchObject({
      skipped: "no_apple_account",
    });
    expect(
      await revokeAppleTokens([{ accessToken: null, refreshToken: "r1" }], {
        config: null,
        fetch: request,
      }),
    ).toEqual({ attempted: 1, revoked: 0, skipped: "unconfigured" });
    expect(request).not.toHaveBeenCalled();
    expect(appleRevocationConfig({})).toBeNull();
  });

  it("prefers the refresh token and tries each client id until Apple accepts", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await revokeAppleTokens([{ accessToken: "a1", refreshToken: "r1" }], {
      config,
      fetch: request as unknown as typeof fetch,
    });
    expect(result).toEqual({ attempted: 1, revoked: 1, skipped: "none" });
    const bodies = request.mock.calls.map(([, init]) => new URLSearchParams(String(init.body)));
    expect(bodies.map((body) => body.get("client_id"))).toEqual([
      "com.example.web",
      "com.example.app",
    ]);
    expect(bodies[1].get("token")).toBe("r1");
    expect(bodies[1].get("token_type_hint")).toBe("refresh_token");
    expect(request.mock.calls[0][0]).toBe("https://appleid.apple.com/auth/revoke");
  });
});
