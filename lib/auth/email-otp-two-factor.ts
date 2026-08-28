import "server-only";

import { validateReturnTo } from "@/lib/auth/return-to";
import { SIGNED_IN_HOME_PATH, TWO_FACTOR_CHALLENGE_PATH } from "@/lib/auth/two-factor-routes";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

const TWO_FACTOR_COOKIE_NAME = "two_factor";
const TWO_FACTOR_TABLE = "twoFactor";
const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 10 * 60;

type EmailOtpTwoFactorContext = Parameters<typeof deleteSessionCookie>[0];

export async function startTwoFactorChallenge(ctx: EmailOtpTwoFactorContext) {
  const signedIn = ctx.context.newSession;

  if (!signedIn?.user.twoFactorEnabled) {
    return null;
  }

  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(signedIn.session.token);
  ctx.context.setNewSession(null);

  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE_SECONDS * 1000);

  await ctx.context.internalAdapter.createVerificationValue({
    value: signedIn.user.id,
    identifier,
    expiresAt,
  });
  await ctx.context.internalAdapter.createVerificationValue({
    value: "0",
    identifier: `2fa-attempts-${identifier}`,
    expiresAt,
  });

  const pendingCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
    maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  });
  await ctx.setSignedCookie(
    pendingCookie.name,
    identifier,
    ctx.context.secret,
    pendingCookie.attributes,
  );

  const twoFactorRecord = await ctx.context.adapter.findOne<{
    verified?: boolean | null;
  }>({
    model: TWO_FACTOR_TABLE,
    where: [{ field: "userId", value: signedIn.user.id }],
  });
  const twoFactorMethods = twoFactorRecord && twoFactorRecord.verified !== false ? ["totp"] : [];

  return { twoFactorMethods };
}

export async function enforceEmailOtpTwoFactor(ctx: EmailOtpTwoFactorContext) {
  const challenge = await startTwoFactorChallenge(ctx);

  if (!challenge) {
    return;
  }

  return ctx.json({ twoFactorRedirect: true, ...challenge });
}

export const emailOtpTwoFactorPlugin = {
  id: "email-otp-two-factor",
  hooks: {
    after: [
      {
        matcher(context) {
          return context.path === "/sign-in/email-otp";
        },
        handler: createAuthMiddleware(enforceEmailOtpTwoFactor),
      },
    ],
  },
} satisfies BetterAuthPlugin;

export function socialOAuthTwoFactorLocation(value: unknown) {
  const destination = validateReturnTo(value) ?? SIGNED_IN_HOME_PATH;

  if (destination === SIGNED_IN_HOME_PATH) {
    return TWO_FACTOR_CHALLENGE_PATH;
  }

  return `${TWO_FACTOR_CHALLENGE_PATH}?${new URLSearchParams({ next: destination }).toString()}`;
}

export async function enforceSocialOAuthTwoFactor(ctx: EmailOtpTwoFactorContext) {
  const location = ctx.context.responseHeaders?.get("location");
  const challenge = await startTwoFactorChallenge(ctx);

  if (!challenge) {
    return;
  }

  ctx.setHeader("location", socialOAuthTwoFactorLocation(location));
}

export const socialOAuthTwoFactorPlugin = {
  id: "social-oauth-two-factor",
  hooks: {
    after: [
      {
        matcher(context) {
          return context.path === "/callback/:id" || context.path === "/sign-in/social";
        },
        handler: createAuthMiddleware(enforceSocialOAuthTwoFactor),
      },
    ],
  },
} satisfies BetterAuthPlugin;
