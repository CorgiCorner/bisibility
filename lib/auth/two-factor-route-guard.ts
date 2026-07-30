import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";

const TWO_FACTOR_PREFIX = "/two-factor/";
const SIGN_IN_CHALLENGE_PATHS = new Set([
  "/two-factor/verify-backup-code",
  "/two-factor/verify-totp",
]);

export function isAllowedTwoFactorHttpRequest(path: string, hasSession: boolean) {
  return SIGN_IN_CHALLENGE_PATHS.has(path) && !hasSession;
}

export function twoFactorRouteGuard(): BetterAuthPlugin {
  return {
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (context) => {
            const path = context.path ?? "";
            const challengePath = SIGN_IN_CHALLENGE_PATHS.has(path);
            const session = challengePath ? await getAuthoritativeSessionFromCtx(context) : null;
            if (isAllowedTwoFactorHttpRequest(path, Boolean(session?.session))) {
              return;
            }
            throw new APIError("FORBIDDEN", {
              code: "TWO_FACTOR_MANAGEMENT_ACTION_REQUIRED",
              message: "Use the protected account security flow.",
            });
          }),
          matcher: (context) => context.path?.startsWith(TWO_FACTOR_PREFIX) ?? false,
        },
      ],
    },
    id: "two-factor-route-guard",
  };
}
