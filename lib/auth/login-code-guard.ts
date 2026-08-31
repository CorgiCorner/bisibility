import "server-only";

import { isFirstRun } from "@/lib/auth/first-run";
import { isVerifiedLoginCodeRequest } from "@/lib/auth/login-code-request-context";
import { withOtpSendState } from "@/lib/auth/otp-send-context";
import { reserveEmailSignInCode } from "@/lib/auth/signin-capacity";
import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";
import { deploymentMode } from "@/lib/deployment/deployment";
import { isEmailConfigured } from "@/lib/email/registry";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

const SEND_CODE_PATH = "/email-otp/send-verification-otp";
type OtpRequestMarker = { firstRunFallback: boolean; sendCounterReserved: boolean };
type AuthRequestContext = Record<string, unknown> & { otpRequestMarker?: OtpRequestMarker };

export function withOtpEmailRequest<T>(
  authContext: AuthRequestContext | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const marker = authContext?.otpRequestMarker;
  if (!marker || !authContext) return callback();
  delete authContext.otpRequestMarker;
  return withOtpSendState(marker, callback);
}

export function loginCodeGuardPlugin({
  fixedOtpEnabled = false,
}: {
  fixedOtpEnabled?: boolean;
} = {}): BetterAuthPlugin {
  return {
    hooks: {
      before: [
        {
          handler: createAuthMiddleware(async (context) => {
            if (context.body?.type !== "sign-in") return;
            if (deploymentMode() === "cloud" && !isVerifiedLoginCodeRequest()) {
              throw new APIError("FORBIDDEN", {
                code: "HUMAN_VERIFICATION_REQUIRED",
                message: "Verification failed. Please try again.",
              });
            }

            const noProductionMailer =
              !isEmailConfigured() && process.env.NODE_ENV === "production" && !fixedOtpEnabled;
            const firstRunFallback = noProductionMailer && (await isFirstRun());
            if (noProductionMailer && !firstRunFallback) {
              throw new APIError("SERVICE_UNAVAILABLE", {
                code: "EMAIL_NOT_CONFIGURED",
                message: "Email delivery is not configured on this instance.",
              });
            }

            let sendCounterReserved = false;
            if (!firstRunFallback) {
              const capacity = await reserveEmailSignInCode();
              if (!capacity.granted) {
                throw new APIError("TOO_MANY_REQUESTS", {
                  code: EMAIL_CAPACITY_EXHAUSTED,
                  message: EMAIL_CAPACITY_EXHAUSTED,
                });
              }
              sendCounterReserved = capacity.gated;
            }
            (context.context as AuthRequestContext).otpRequestMarker = {
              firstRunFallback,
              sendCounterReserved,
            };
          }),
          matcher: (context) => context.path === SEND_CODE_PATH,
        },
      ],
    },
    id: "login-code-guard",
  };
}
