import "server-only";

// Must run before the process.env reads in this module - fills runtime env on
// platforms that omit it at request time (no-op where the platform injects env).
import "@/lib/deployment/runtime-env.generated";
import { authDatabase } from "@/lib/auth/auth-database";
import { AUTH_IP_ADDRESS_OPTIONS } from "@/lib/auth/client-ip";
import { demoEmailOtpRateLimit } from "@/lib/auth/demo-email-otp";
import { emailOtpTwoFactorPlugin } from "@/lib/auth/email-otp-two-factor";
import { prepareFirstRunUserCreation } from "@/lib/auth/first-run";
import { firstRunCreationState, isPendingFirstRunUser } from "@/lib/auth/first-run-context";
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_AUTHORIZATION_TTL_SECONDS,
  OAUTH_REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth/oauth-policy";
import { oidcScopes } from "@/lib/auth/oidc-scopes";
import { sendOtpEmail } from "@/lib/auth/otp-email";
import { addAuthPublicId } from "@/lib/auth/public-id-hooks";
import {
  DEMO_FIXED_OTP_ACKNOWLEDGED,
  DEMO_FIXED_OTP_ENABLED,
  FIXED_OTP_ENABLED,
} from "@/lib/auth/runtime-config";
import { resolveAuthSecret, resolveAuthSecrets } from "@/lib/auth/secret";
import { recordSignInAudit } from "@/lib/auth/sign-in-audit";
import { enforceGoogleSignupCapacity } from "@/lib/auth/signin-capacity";
import { twoFactorRouteGuard } from "@/lib/auth/two-factor-route-guard";
import { prisma } from "@/lib/db/prisma";
import {
  normalizeAuthorizationServerOrigin,
  resolveMcpResourceUrl,
} from "@/lib/deployment/mcp-origin-contract";
import { oauthProvider } from "@better-auth/oauth-provider";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, jwt, twoFactor } from "better-auth/plugins";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const AUTH_SECRET = resolveAuthSecret();
const AUTH_SECRETS = resolveAuthSecrets();
export const AUTH_URL_CONFIGURED = Boolean(process.env.BETTER_AUTH_URL?.trim());
export const AUTH_URL = normalizeAuthorizationServerOrigin(
  process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`,
);
export const MCP_RESOURCE_URL = resolveMcpResourceUrl(AUTH_URL);
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
  };
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  };
}

type SessionCreationInput = { userId: string };
type UserCreationInput = Parameters<typeof prepareFirstRunUserCreation>[0];
type UserCreationContext = Parameters<typeof prepareFirstRunUserCreation>[1];

async function prepareSessionCreation(session: SessionCreationInput) {
  await preventDeactivatedSessionCreation(session);
  return addAuthPublicId(session, "sid");
}

async function prepareUserCreation(user: UserCreationInput, context: UserCreationContext) {
  const prepared = await prepareFirstRunUserCreation(user, context);
  return addAuthPublicId(user, "usr", prepared);
}

// Throw instead of returning false because some provider routes would still set cookies;
// keep the error generic to avoid disclosing deactivation state.
export async function preventDeactivatedSessionCreation(session: SessionCreationInput) {
  if (isPendingFirstRunUser(session.userId)) {
    return;
  }

  const user = await prisma.user.findUnique({
    select: { deactivatedAt: true },
    where: { id: session.userId },
  });

  if (!user || user.deactivatedAt) {
    throw new APIError("UNAUTHORIZED", {
      code: "SESSION_CREATION_BLOCKED",
      message: "Unable to create session.",
    });
  }
}

type SignInPayload = {
  user?: {
    id?: unknown;
  };
};

async function getReturnedPayload(returned: unknown) {
  if (returned instanceof Response) {
    if (!returned.ok) {
      return null;
    }

    return returned
      .clone()
      .json()
      .catch(() => null);
  }

  return returned;
}

function getSignedInUserId(payload: unknown) {
  const maybePayload = payload as SignInPayload | null;
  const userId = maybePayload?.user?.id;

  return typeof userId === "string" ? userId : null;
}

function attemptedEmail(body: unknown) {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : "unknown";
}

const authAuditPlugin = {
  id: "auth-audit",
  hooks: {
    after: [
      {
        matcher(context) {
          return context.path === "/sign-in/email-otp";
        },
        handler: createAuthMiddleware(async (ctx) => {
          // First-run setup writes its completion audit when it promotes the signed-in user.
          if (firstRunCreationState()) {
            return;
          }

          const payload = await getReturnedPayload(ctx.context.returned);
          const userId = getSignedInUserId(payload);
          const email = attemptedEmail(ctx.body);

          if (!userId) {
            await recordSignInAudit({
              email,
              status: "failed",
              statusReason: "invalid_or_expired_code",
            });
            return;
          }

          await recordSignInAudit({ email, status: "success", userId });
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

export const auth = betterAuth({
  advanced: {
    ipAddress: AUTH_IP_ADDRESS_OPTIONS,
  },
  appName: "bisibility",
  baseURL: AUTH_URL,
  secret: AUTH_SECRET,
  secrets: AUTH_SECRETS,
  database: prismaAdapter(authDatabase, {
    provider: "postgresql",
    transaction: true,
  }),
  databaseHooks: {
    account: {
      create: { before: enforceGoogleSignupCapacity },
    },
    session: {
      create: { before: prepareSessionCreation },
    },
    user: {
      create: {
        before: prepareUserCreation,
      },
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders,
  session: {
    additionalFields: {
      publicId: {
        input: false,
        required: false,
        returned: false,
        type: "string",
      },
    },
    expiresIn: SESSION_TTL_SECONDS,
    updateAge: 60 * 60 * 24,
    // Cache sessions in a signed cookie for 60s to reduce RSC database reads while
    // keeping revocation latency low.
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  user: {
    additionalFields: {
      isInstanceAdmin: {
        defaultValue: false,
        input: false,
        required: false,
        returned: false,
        type: "boolean",
      },
      publicId: {
        input: false,
        required: false,
        returned: false,
        type: "string",
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      // Match the "expires in 5 minutes" copy in sendOtpEmail (and don't depend on
      // the better-auth default, which is longer).
      expiresIn: 5 * 60,
      storeOTP: "hashed",
      rateLimit: demoEmailOtpRateLimit(DEMO_FIXED_OTP_ENABLED, DEMO_FIXED_OTP_ACKNOWLEDGED),
      // Opt-in fixed code; otherwise better-auth uses random codes.
      ...(FIXED_OTP_ENABLED ? { generateOTP: () => "000000" } : {}),
      async sendVerificationOTP(data) {
        await sendOtpEmail(data, { fixedOtpEnabled: FIXED_OTP_ENABLED });
      },
    }),
    twoFactorRouteGuard(),
    twoFactor({
      allowPasswordless: true,
      issuer: "bisibility",
    }),
    jwt({
      jwt: {
        issuer: AUTH_URL,
        audience: AUTH_URL,
      },
    }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      codeExpiresIn: OAUTH_AUTHORIZATION_TTL_SECONDS,
      refreshTokenExpiresIn: OAUTH_REFRESH_TOKEN_TTL_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      scopes: [...oidcScopes],
      // GHSA-p2fr-6hmx-4528: on this provider line a grant or refresh token bound to one
      // allowed audience can be exchanged for a token addressed to another allowed audience.
      // Listing exactly one resource removes the second audience to switch to. Keep this list
      // at one entry until the provider gains per-client resource binding.
      validAudiences: [MCP_RESOURCE_URL],
    }),
    authAuditPlugin,
    emailOtpTwoFactorPlugin,
    nextCookies(),
  ],
});
