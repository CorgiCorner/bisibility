import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

const TWO_FACTOR_COOKIE_NAME = "two_factor";
const TWO_FACTOR_TABLE = "twoFactor";
const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 10 * 60;

type EmailOtpTwoFactorContext = Parameters<typeof deleteSessionCookie>[0];

export async function enforceEmailOtpTwoFactor(ctx: EmailOtpTwoFactorContext) {
  const signedIn = ctx.context.newSession;

  if (!signedIn?.user.twoFactorEnabled) {
    return;
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

  return ctx.json({ twoFactorRedirect: true, twoFactorMethods });
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
