"use server";

import "@/lib/deployment/runtime-env.generated";

import { createHash } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import { withVerifiedLoginCodeRequest } from "@/lib/auth/login-code-request-context";
import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";
import { deploymentMode } from "@/lib/deployment/deployment";
import { resolveClientIp } from "@/lib/http/client-ip";
import { verificationTokenSchema } from "@/lib/landing/waitlist-schema";
import { verifyHumanChallenge } from "@/lib/verification/human-verification";
import { headers } from "next/headers";
import { z } from "zod";

const WINDOW_SECONDS = 60;
const resendSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  verificationToken: verificationTokenSchema,
});
export type ResendOtpFailureCode =
  | "capacity_exhausted"
  | "delivery_failed"
  | "EMAIL_NOT_CONFIGURED"
  | "invalid_input"
  | "rate_limited"
  | "verification_failed";
export type ResendOtpResult =
  | { ok: true; retryAfter: number }
  | { code: ResendOtpFailureCode; ok: false; retryAfter: number };

const memoryResetAt = new Map<string, number>();
function memoryAllow(email: string) {
  const now = Date.now();
  const resetAt = memoryResetAt.get(email);
  if (resetAt && resetAt > now) {
    return { retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)), success: false };
  }
  memoryResetAt.set(email, now + WINDOW_SECONDS * 1000);
  return { retryAfter: WINDOW_SECONDS, success: true };
}

function sendFailureCode(
  error: unknown,
): "EMAIL_NOT_CONFIGURED" | "capacity_exhausted" | "delivery_failed" | "rate_limited" {
  const typed = error as { body?: { code?: unknown }; status?: unknown; statusCode?: unknown };
  const code = typeof typed?.body?.code === "string" ? typed.body.code.toLowerCase() : "";
  if (code === "email_not_configured") return "EMAIL_NOT_CONFIGURED";
  if (code === EMAIL_CAPACITY_EXHAUSTED) return "capacity_exhausted";
  if (typed?.status === "TOO_MANY_REQUESTS" || typed?.statusCode === 429 || code.includes("rate")) {
    return "rate_limited";
  }
  return "delivery_failed";
}

export async function resendSignInOtp(input: unknown): Promise<ResendOtpResult> {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { code: "invalid_input", ok: false, retryAfter: 0 };
  const requestHeaders = await headers();
  if (deploymentMode() === "cloud") {
    const rawIp = resolveClientIp(requestHeaders);
    const digest = createHash("sha256")
      .update(rawIp ?? "unidentified")
      .digest("base64url");
    const verification = await verifyHumanChallenge(
      parsed.data.verificationToken,
      rawIp,
      digest,
    ).catch(() => ({ code: "verification_failed" as const, success: false as const }));
    if (!verification.success) return { code: verification.code, ok: false, retryAfter: 0 };
  }

  const email = parsed.data.email.toLowerCase();
  const limit = await consume({
    bucketKey: email,
    limit: 1,
    prefix: "bisibility:otp-resend",
    windowSeconds: WINDOW_SECONDS,
  }).catch(() => memoryAllow(email));
  if (!limit.success) {
    const retryAfter =
      "resetAt" in limit
        ? Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
        : limit.retryAfter;
    return { code: "rate_limited", ok: false, retryAfter };
  }

  const { auth } = await import("@/lib/auth/auth");
  try {
    await withVerifiedLoginCodeRequest(() =>
      auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
        headers: requestHeaders,
        method: "POST",
      }),
    );
    return { ok: true, retryAfter: WINDOW_SECONDS };
  } catch (error) {
    return { code: sendFailureCode(error), ok: false, retryAfter: 0 };
  }
}
