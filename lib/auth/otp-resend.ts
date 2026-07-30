"use server";

import { consume } from "@/lib/api/ratelimit";
import { z } from "zod";
import { auth } from "./auth";

// Resend is throttled to one request per email per window. Backed by Redis/Valkey
// when REDIS_URL is configured, with an in-memory fallback for local dev and tests.
const WINDOW_SECONDS = 60;
const emailSchema = z.email();

export type ResendOtpResult = {
  ok: boolean;
  /** Seconds the caller must wait before the next resend (drives the UI countdown). */
  retryAfter: number;
  error?: string;
};

const memoryResetAt = new Map<string, number>();
function memoryAllow(email: string): { retryAfter: number; success: boolean } {
  const now = Date.now();
  const resetAt = memoryResetAt.get(email);
  if (resetAt && resetAt > now) {
    return { retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)), success: false };
  }
  memoryResetAt.set(email, now + WINDOW_SECONDS * 1000);
  return { retryAfter: WINDOW_SECONDS, success: true };
}

export async function resendSignInOtp(email: string): Promise<ResendOtpResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, retryAfter: 0, error: "Enter a valid email address." };
  }
  const address = parsed.data.toLowerCase();

  const result = await consume({
    bucketKey: address,
    limit: 1,
    prefix: "bisibility:otp-resend",
    windowSeconds: WINDOW_SECONDS,
  }).catch(() => memoryAllow(address));
  if (!result.success) {
    return {
      ok: false,
      retryAfter:
        "resetAt" in result
          ? Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
          : result.retryAfter,
      error: "Please wait before requesting another code.",
    };
  }

  try {
    await auth.api.sendVerificationOTP({ body: { email: address, type: "sign-in" } });
  } catch {
    return { ok: false, retryAfter: 0, error: "Could not send a new code. Try again." };
  }

  return { ok: true, retryAfter: WINDOW_SECONDS };
}
