import "server-only";

import { type AppleRevocationConfig, appleClientSecret } from "@/lib/auth/apple-token-revocation";

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const EXCHANGE_TIMEOUT_MS = 10_000;

export type AppleCodeExchangeResult = {
  idToken: string;
  refreshToken: string | null;
};

export type AppleCodeExchangeFailure = "authorization_code_invalid" | "apple_unavailable";

export class AppleCodeExchangeError extends Error {
  constructor(
    readonly code: AppleCodeExchangeFailure,
    message: string,
  ) {
    super(message);
    this.name = "AppleCodeExchangeError";
  }
}

/**
 * Redeems the authorization code the app received from Apple, authenticating with the same ES256
 * client secret the account-deletion revocation uses. Apple codes are single-use and expire after
 * five minutes, so a replayed request fails here with `invalid_grant`.
 */
export async function exchangeAppleAuthorizationCode(input: {
  clientId: string;
  code: string;
  config: AppleRevocationConfig;
  fetch?: typeof fetch;
  now?: Date;
}): Promise<AppleCodeExchangeResult> {
  const request = input.fetch ?? fetch;
  let response: Response;
  try {
    response = await request(APPLE_TOKEN_URL, {
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: appleClientSecret(input.config, input.clientId, input.now),
        code: input.code,
        grant_type: "authorization_code",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
  } catch {
    throw new AppleCodeExchangeError("apple_unavailable", "Apple's token endpoint is unavailable.");
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    // RFC 6749 client errors mean the code (or our client registration) was refused.
    if (response.status === 400 && typeof body?.error === "string") {
      throw new AppleCodeExchangeError(
        "authorization_code_invalid",
        "Apple did not accept the authorization code.",
      );
    }
    throw new AppleCodeExchangeError("apple_unavailable", "Apple's token endpoint is unavailable.");
  }
  if (typeof body?.id_token !== "string" || !body.id_token) {
    throw new AppleCodeExchangeError("apple_unavailable", "Apple returned an incomplete response.");
  }
  return {
    idToken: body.id_token,
    refreshToken:
      typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
  };
}
