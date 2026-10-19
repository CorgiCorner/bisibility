import "server-only";

import { createHash } from "node:crypto";
import { createRemoteJWKSet, errors, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";

/** Issuer of every Sign in with Apple identity token. */
export const APPLE_ISSUER = "https://appleid.apple.com";
/** Bundle identifier of the native app; the `aud` of identity tokens it receives (ADR-021). */
export const APPLE_APP_BUNDLE_ID = "com.bisibility.app";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

/** Clock skew tolerated on `exp` and `iat`; Apple identity tokens live ten minutes. */
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_AGE = "10m";

/**
 * Apple's published keys rotate. `createRemoteJWKSet` caches them for ten minutes and refetches
 * when a token names an unknown `kid`, at most once per cooldown, so rotation needs no restart.
 */
let sharedJwks: JWTVerifyGetKey | undefined;
export function appleJwks(): JWTVerifyGetKey {
  sharedJwks ??= createRemoteJWKSet(new URL(APPLE_JWKS_URL), {
    cacheMaxAge: 10 * 60_000,
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
  });
  return sharedJwks;
}

/** The value the app puts in `ASAuthorizationAppleIDRequest.nonce`: lowercase hex SHA-256. */
export function appleNonceDigest(rawNonce: string) {
  return createHash("sha256").update(rawNonce, "utf8").digest("hex");
}

export type AppleIdentity = {
  email: string | null;
  emailVerified: boolean;
  expiresAt: Date;
  isPrivateEmail: boolean;
  sub: string;
};

export type AppleIdentityFailure =
  | "identity_token_invalid"
  | "nonce_mismatch"
  | "apple_unavailable";

export class AppleIdentityError extends Error {
  constructor(
    readonly code: AppleIdentityFailure,
    message: string,
  ) {
    super(message);
    this.name = "AppleIdentityError";
  }
}

// Apple sends these booleans either as JSON booleans or as the strings "true"/"false".
function appleBoolean(value: unknown) {
  return value === true || value === "true";
}

// Key retrieval problems (timeout, network, a non-200 or malformed key set) are Apple-side
// outages, not a bad token; jose reports a failed key-set response as a generic error.
function isUnreachable(error: unknown) {
  return (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC") ||
    error instanceof TypeError
  );
}

/**
 * Verifies a Sign in with Apple identity token: RS256/ES256 signature against Apple's JWKS,
 * `iss`, `aud`, `exp`, `iat` (not in the future, at most ten minutes old) and a non-empty `sub`.
 * With `rawNonce`, the `nonce` claim must equal its SHA-256; tokens from the code exchange carry
 * no caller nonce and are checked without one.
 */
export async function verifyAppleIdentityToken(
  token: string,
  options: {
    audience?: string;
    jwks?: JWTVerifyGetKey;
    now?: Date;
    rawNonce?: string;
  } = {},
): Promise<AppleIdentity> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, options.jwks ?? appleJwks(), {
      algorithms: ["RS256", "ES256"],
      audience: options.audience ?? APPLE_APP_BUNDLE_ID,
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: options.now,
      issuer: APPLE_ISSUER,
      maxTokenAge: MAX_TOKEN_AGE,
      requiredClaims: ["exp", "iat", "sub"],
    }));
  } catch (error) {
    if (isUnreachable(error)) {
      throw new AppleIdentityError("apple_unavailable", "Apple's signing keys are unavailable.");
    }
    throw new AppleIdentityError("identity_token_invalid", "The Apple identity is not valid.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub || typeof payload.exp !== "number") {
    throw new AppleIdentityError("identity_token_invalid", "The Apple identity is not valid.");
  }
  if (options.rawNonce !== undefined && payload.nonce !== appleNonceDigest(options.rawNonce)) {
    throw new AppleIdentityError("nonce_mismatch", "The sign-in nonce does not match.");
  }

  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : null;
  return {
    email,
    emailVerified: email !== null && appleBoolean(payload.email_verified),
    expiresAt: new Date(payload.exp * 1000),
    isPrivateEmail: appleBoolean(payload.is_private_email),
    sub,
  };
}
