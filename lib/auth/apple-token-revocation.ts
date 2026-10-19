import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import {
  type AppleTokenKey,
  authTokenKey,
  decryptAppleToken,
  isEncryptedAppleToken,
} from "@/lib/auth/apple-token-storage";

/** Account provider id used by the Sign in with Apple integration. */
export const APPLE_PROVIDER_ID = "apple";

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const AUDIENCE = "https://appleid.apple.com";
const CLIENT_SECRET_TTL_SECONDS = 300;

type Env = Record<string, string | undefined>;

export type AppleRevocationConfig = {
  clientIds: string[];
  keyId: string;
  privateKey: string;
  teamId: string;
};

/** Null until the Sign in with Apple key is configured; deletion then records the skip. */
export function appleRevocationConfig(env: Env = process.env): AppleRevocationConfig | null {
  const teamId = env.APPLE_SIGN_IN_TEAM_ID?.trim();
  const keyId = env.APPLE_SIGN_IN_KEY_ID?.trim();
  const privateKey = env.APPLE_SIGN_IN_PRIVATE_KEY?.trim().replaceAll("\\n", "\n");
  const clientIds = (env.APPLE_SIGN_IN_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!teamId || !keyId || !privateKey || clientIds.length === 0) return null;
  return { clientIds, keyId, privateKey, teamId };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** ES256 client secret for Apple's token endpoints, valid for five minutes. */
export function appleClientSecret(
  config: AppleRevocationConfig,
  clientId: string,
  now = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = base64Url(
    JSON.stringify({
      aud: AUDIENCE,
      exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
      iat: issuedAt,
      iss: config.teamId,
      sub: clientId,
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    dsaEncoding: "ieee-p1363",
    key: createPrivateKey(config.privateKey),
  });
  return `${header}.${payload}.${base64Url(signature)}`;
}

export type AppleTokenRecord = { accessToken: string | null; refreshToken: string | null };

export type AppleRevocationResult = {
  attempted: number;
  revoked: number;
  skipped: "none" | "no_apple_account" | "unconfigured";
};

type RevocationOptions = {
  config?: AppleRevocationConfig | null;
  fetch?: typeof fetch;
  now?: Date;
  /** Key for tokens stored encrypted (native sign-in); defaults to the auth secret. */
  tokenKey?: AppleTokenKey;
};

/**
 * Stored tokens may be encrypted. A value that only looks encrypted (a plaintext token made of hex
 * digits) fails to decrypt and is sent as stored; Apple refuses anything that is not a token.
 */
async function readStoredToken(value: string, options: RevocationOptions) {
  if (!isEncryptedAppleToken(value)) return value;
  try {
    return await decryptAppleToken(value, options.tokenKey ?? (await authTokenKey()));
  } catch {
    return value;
  }
}

/**
 * Revokes Sign in with Apple tokens before an account is deleted, as App
 * Review 5.1.1(v) requires. The token's audience is either the web Services
 * ID or the app bundle, so each configured client id is tried in turn.
 */
export async function revokeAppleTokens(
  records: readonly AppleTokenRecord[],
  options: RevocationOptions = {},
): Promise<AppleRevocationResult> {
  const tokens = records
    .map((record) =>
      record.refreshToken
        ? { hint: "refresh_token", token: record.refreshToken }
        : record.accessToken
          ? { hint: "access_token", token: record.accessToken }
          : null,
    )
    .filter((value): value is { hint: string; token: string } => value != null);
  if (tokens.length === 0) return { attempted: 0, revoked: 0, skipped: "no_apple_account" };
  const config = options.config === undefined ? appleRevocationConfig() : options.config;
  if (!config) return { attempted: tokens.length, revoked: 0, skipped: "unconfigured" };
  const request = options.fetch ?? fetch;
  let revoked = 0;
  for (const stored of tokens) {
    const token = await readStoredToken(stored.token, options);
    const { hint } = stored;
    for (const clientId of config.clientIds) {
      const response = await request(REVOKE_URL, {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: appleClientSecret(config, clientId, options.now),
          token,
          token_type_hint: hint,
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (response?.ok) {
        revoked += 1;
        break;
      }
    }
  }
  return { attempted: tokens.length, revoked, skipped: "none" };
}
