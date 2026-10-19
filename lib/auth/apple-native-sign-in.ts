import "server-only";

import { createHash } from "node:crypto";
import {
  AppleCodeExchangeError,
  exchangeAppleAuthorizationCode,
} from "@/lib/auth/apple-code-exchange";
import {
  APPLE_APP_BUNDLE_ID,
  AppleIdentityError,
  appleNonceDigest,
  verifyAppleIdentityToken,
} from "@/lib/auth/apple-identity-token";
import {
  APPLE_NATIVE_SIGN_IN_METHOD,
  type AppleNativeSignInProblem,
  refuse,
} from "@/lib/auth/apple-native-sign-in-problems";
import { APPLE_PROVIDER_ID, appleRevocationConfig } from "@/lib/auth/apple-token-revocation";
import { encryptAppleToken } from "@/lib/auth/apple-token-storage";
import { IOS_OAUTH_CLIENT_ID, IOS_OAUTH_CLIENT_SCOPES } from "@/lib/auth/oauth-policy";
import { prepareSessionCreation } from "@/lib/auth/session-creation";
import { recordSignInAudit } from "@/lib/auth/sign-in-audit";
import { prisma } from "@/lib/db/prisma";
import type { AuthContext, BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";

/** `POST /api/auth/ios/apple`: native Sign in with Apple for the iOS app (ADR-021, Part 1, 3). */
export const APPLE_NATIVE_SIGN_IN_PATH = "/ios/apple";
/** Same budget Better Auth applies to its `/sign-in/*` routes: three attempts per ten seconds. */
export const APPLE_NATIVE_SIGN_IN_RATE_LIMIT = { max: 3, window: 10 } as const;

const NONCE_IDENTIFIER_PREFIX = "apple-native-nonce:";
const NONCE_RETENTION_SKEW_MS = 60_000;
/** The bootstrap grant is consumed by an immediate rotation; it never leaves the server. */
const BOOTSTRAP_GRANT_TTL_MS = 60_000;

const requestSchema = z.object({
  authorization_code: z.string().min(1).max(2048),
  family_name: z.string().trim().max(100).optional(),
  given_name: z.string().trim().max(100).optional(),
  identity_token: z.string().min(1).max(16_384),
  // The raw nonce the app hashed into the Apple request; short values are guessable.
  nonce: z.string().min(32).max(256),
});

export type AppleNativeSignInDependencies = {
  /** Runs the provider's own refresh-token grant for `bisibility-ios` and returns its JSON. */
  refreshGrant: (refreshToken: string) => Promise<unknown>;
  fetch?: typeof fetch;
  jwks?: JWTVerifyGetKey;
};

type AppTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
};

function isAppTokenResponse(value: unknown): value is AppTokenResponse {
  const body = value as Partial<AppTokenResponse> | null;
  return (
    typeof body?.access_token === "string" &&
    typeof body.refresh_token === "string" &&
    typeof body.expires_in === "number" &&
    typeof body.scope === "string" &&
    typeof body.token_type === "string"
  );
}

/**
 * Issues the same token pair as the web OAuth flow by seeding a refresh grant for `bisibility-ios`
 * (exactly as the provider stores one after an authorization-code grant, with the sign-in time)
 * and redeeming it through the provider's refresh grant, which rotates it at once. Lifetimes,
 * scopes, rotation, reuse detection and the response shape therefore stay the provider's own.
 */
async function issueAppTokens(userId: string, deps: AppleNativeSignInDependencies) {
  const raw = generateRandomString(32, "A-Z", "a-z");
  const now = new Date();
  await prisma.oauthRefreshToken.create({
    data: {
      authTime: now,
      clientId: IOS_OAUTH_CLIENT_ID,
      createdAt: now,
      expiresAt: new Date(now.getTime() + BOOTSTRAP_GRANT_TTL_MS),
      scopes: [...IOS_OAUTH_CLIENT_SCOPES],
      token: createHash("sha256").update(raw).digest("base64url"),
      userId,
    },
  });
  const issued = await deps.refreshGrant(raw);
  if (!isAppTokenResponse(issued)) throw new Error("The app token grant returned no token pair.");
  return issued;
}

function newUserName(given?: string, family?: string) {
  return [given, family].filter(Boolean).join(" ");
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function sessionGateProblem(error: unknown): AppleNativeSignInProblem {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  return code === "ACCOUNT_DEACTIVATED" ? "account_deactivated" : "sign_in_unavailable";
}

type EndpointContext = { body?: unknown; context: AuthContext };

export async function handleAppleNativeSignIn(
  ctx: EndpointContext,
  deps: AppleNativeSignInDependencies,
): Promise<Response> {
  const parsed = requestSchema.safeParse(ctx.body);
  if (!parsed.success) return refuse("invalid_request");
  const body = parsed.data;

  const config = appleRevocationConfig();
  const appClient = await prisma.oauthClient.findUnique({
    select: { disabled: true },
    where: { clientId: IOS_OAUTH_CLIENT_ID },
  });
  if (!config?.clientIds.includes(APPLE_APP_BUNDLE_ID) || !appClient || appClient.disabled) {
    return refuse("apple_sign_in_unavailable");
  }

  let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    identity = await verifyAppleIdentityToken(body.identity_token, {
      jwks: deps.jwks,
      rawNonce: body.nonce,
    });
  } catch (error) {
    return refuse(error instanceof AppleIdentityError ? error.code : "identity_token_invalid");
  }

  // Each nonce signs in once; Apple's single-use code is the second, independent replay barrier.
  const nonceIdentifier = `${NONCE_IDENTIFIER_PREFIX}${appleNonceDigest(body.nonce)}`;
  if (await ctx.context.internalAdapter.findVerificationValue(nonceIdentifier)) {
    return refuse("nonce_replayed", { email: identity.email });
  }
  await ctx.context.internalAdapter.createVerificationValue({
    expiresAt: new Date(identity.expiresAt.getTime() + NONCE_RETENTION_SKEW_MS),
    identifier: nonceIdentifier,
    value: "used",
  });

  let appleRefreshToken: string | null;
  try {
    const exchanged = await exchangeAppleAuthorizationCode({
      clientId: APPLE_APP_BUNDLE_ID,
      code: body.authorization_code,
      config,
      fetch: deps.fetch,
    });
    // The code must belong to the same Apple user as the identity it arrived with.
    const confirmed = await verifyAppleIdentityToken(exchanged.idToken, { jwks: deps.jwks });
    if (confirmed.sub !== identity.sub) return refuse("authorization_code_invalid");
    appleRefreshToken = exchanged.refreshToken;
  } catch (error) {
    if (error instanceof AppleCodeExchangeError) return refuse(error.code);
    if (error instanceof AppleIdentityError && error.code === "apple_unavailable") {
      return refuse("apple_unavailable");
    }
    return refuse("authorization_code_invalid");
  }
  const storedRefreshToken = appleRefreshToken
    ? await encryptAppleToken(appleRefreshToken, ctx.context.secretConfig)
    : null;

  const linked = await prisma.account.findUnique({
    select: { id: true, userId: true },
    where: { providerId_accountId: { accountId: identity.sub, providerId: APPLE_PROVIDER_ID } },
  });

  let userId: string;
  if (linked) {
    userId = linked.userId;
  } else {
    if (!identity.email || !identity.emailVerified) return refuse("email_required");
    const existing = await prisma.user.findUnique({
      select: { id: true },
      where: { email: identity.email },
    });
    // ADR-021, Part 1, 4: linking needs proof of the existing account, so never link here.
    if (existing) {
      return refuse("account_link_required", { email: identity.email, userId: existing.id });
    }
    try {
      const created = await ctx.context.internalAdapter.createOAuthUser(
        {
          email: identity.email,
          emailVerified: true,
          name: newUserName(body.given_name, body.family_name),
        },
        {
          accountId: identity.sub,
          providerId: APPLE_PROVIDER_ID,
          refreshToken: storedRefreshToken,
          scope: "email name",
        },
      );
      userId = created.user.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return refuse("account_link_required", { email: identity.email });
      }
      return refuse("signup_unavailable", { email: identity.email });
    }
  }

  // The same gates a web session passes: deactivation, demo and preview identities.
  try {
    await prepareSessionCreation({ expiresAt: new Date(Date.now() + 60_000), userId });
  } catch (error) {
    return refuse(sessionGateProblem(error), { email: identity.email, userId });
  }
  const user = await prisma.user.findUnique({
    select: { email: true, twoFactorEnabled: true },
    where: { id: userId },
  });
  if (!user) return refuse("sign_in_unavailable", { email: identity.email });
  // This endpoint cannot run the second factor, so it never issues tokens to such an account.
  if (user.twoFactorEnabled) return refuse("two_factor_required", { email: user.email, userId });

  if (linked && storedRefreshToken) {
    await prisma.account.update({
      data: { refreshToken: storedRefreshToken },
      where: { id: linked.id },
    });
  }

  const tokens = await issueAppTokens(userId, deps);
  await recordSignInAudit({
    email: user.email,
    method: APPLE_NATIVE_SIGN_IN_METHOD,
    status: "success",
    userId,
  });
  return new Response(JSON.stringify(tokens), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      Pragma: "no-cache",
    },
    status: 200,
  });
}

/**
 * Native Sign in with Apple: a deliberate, separately reviewed exception to
 * `disableIdTokenSignIn` (ADR-021). It mints no browser session, only the iOS app token pair.
 */
export function appleNativeSignInPlugin(deps: AppleNativeSignInDependencies) {
  return {
    endpoints: {
      appleNativeSignIn: createAuthEndpoint(APPLE_NATIVE_SIGN_IN_PATH, { method: "POST" }, (ctx) =>
        handleAppleNativeSignIn(ctx, deps),
      ),
    },
    id: "apple-native-sign-in",
    rateLimit: [
      {
        pathMatcher: (path: string) => path === APPLE_NATIVE_SIGN_IN_PATH,
        ...APPLE_NATIVE_SIGN_IN_RATE_LIMIT,
      },
    ],
  } satisfies BetterAuthPlugin;
}
