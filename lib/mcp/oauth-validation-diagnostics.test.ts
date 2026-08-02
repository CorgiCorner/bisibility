import { afterEach, describe, expect, it, vi } from "vitest";
import { logOauthValidationFailure } from "./oauth-validation-diagnostics";

const expected = {
  audience: "https://resource.example.com/api/mcp?private=expected-query",
  issuer: "https://auth.example.com#private-fragment",
};

function jwt(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

function validationError(name = "JWTClaimValidationFailed") {
  return Object.assign(new Error("sensitive verifier message"), {
    claim: "aud",
    code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
    name,
    payload: { scope: "admin", sub: "private-user-id" },
    reason: "check_failed",
  });
}

describe("MCP OAuth validation diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs bounded protocol metadata without credential or identity claims", () => {
    const token = jwt({
      aud: "https://regional.example.com/api/mcp?private=observed-query",
      iss: "https://auth.example.com#private-observed-fragment",
      scope: "admin",
      sub: "private-user-id",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logOauthValidationFailure(token, validationError(), expected);

    expect(warn).toHaveBeenCalledWith("[mcp-oauth] access token verification failed", {
      error: {
        claim: "aud",
        code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
        name: "JWTClaimValidationFailed",
        reason: "check_failed",
      },
      expected: {
        audience: "https://resource.example.com/api/mcp",
        issuer: "https://auth.example.com/",
      },
      observed: {
        audience: "https://regional.example.com/api/mcp",
        issuer: "https://auth.example.com/",
      },
      tokenFormat: "jwt",
    });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("private-user-id");
    expect(logged).not.toContain("admin");
    expect(logged).not.toContain("sensitive verifier message");
    expect(logged).not.toContain("private-");
  });

  it("distinguishes opaque, audience-free, and malformed JWT credentials", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = validationError("TokenShapeTestError");

    logOauthValidationFailure("opaque-private-token", error, expected);
    logOauthValidationFailure(jwt({ iss: "https://auth.example.com" }), error, expected);
    logOauthValidationFailure("header.payload.", error, expected);

    expect(warn.mock.calls.map(([, metadata]) => metadata)).toEqual([
      expect.objectContaining({
        observed: { audience: null, issuer: null },
        tokenFormat: "opaque",
      }),
      expect.objectContaining({
        observed: { audience: null, issuer: "https://auth.example.com" },
        tokenFormat: "jwt",
      }),
      expect.objectContaining({
        observed: { audience: null, issuer: null },
        tokenFormat: "malformed_jwt",
      }),
    ]);
  });

  it("filters invalid audiences before applying the bounded list limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const audiences = Array.from(
      { length: 5 },
      (_, index) => `https://audience-${index + 1}.example.com/api/mcp`,
    );
    const token = jwt({ aud: [null, "not-a-url", ...audiences] });

    logOauthValidationFailure(token, validationError("AudienceArrayTestError"), expected);

    expect(warn).toHaveBeenCalledWith(
      "[mcp-oauth] access token verification failed",
      expect.objectContaining({
        observed: {
          audience: audiences.slice(0, 4),
          audienceTruncated: true,
          issuer: null,
        },
      }),
    );
  });

  it("deduplicates repeated verifier failures within one runtime instance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = validationError("RepeatedValidationTestError");
    const token = jwt({ aud: "https://resource.example.com/api/mcp" });

    logOauthValidationFailure(token, error, expected);
    logOauthValidationFailure(token, error, expected);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
