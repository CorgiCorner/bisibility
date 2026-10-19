import "server-only";

import { type SecretConfig, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

export type AppleTokenKey = string | SecretConfig;

/**
 * ADR-021 needs the Apple refresh token at rest for revocation on account deletion. The global
 * `account.encryptOAuthTokens` flag stays off so existing Google and GitHub rows keep their
 * current plaintext format; Apple tokens are written in Better Auth's own encrypted envelope with
 * the auth secret instead, which Better Auth reads unchanged if the flag is enabled later.
 */
export function encryptAppleToken(token: string, key: AppleTokenKey) {
  return symmetricEncrypt({ data: token, key });
}

// Mirrors Better Auth's own detection, so a row written before encryption still reads back.
export function isEncryptedAppleToken(value: string) {
  return value.startsWith("$ba$") || (value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value));
}

export async function decryptAppleToken(value: string, key: AppleTokenKey) {
  return isEncryptedAppleToken(value) ? symmetricDecrypt({ data: value, key }) : value;
}

/** The auth instance's secret configuration, loaded lazily to keep `auth` out of import cycles. */
export async function authTokenKey(): Promise<AppleTokenKey> {
  const { auth } = await import("@/lib/auth/auth");
  return (await auth.$context).secretConfig;
}
