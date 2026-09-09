"use server";

import "@/lib/deployment/runtime-env.generated";

import { createHash } from "node:crypto";
import { withVerifiedLoginCodeRequest } from "@/lib/auth/login-code-request-context";
import { loginSchema } from "@/lib/auth/login-schema";
import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";
import { deploymentMode } from "@/lib/deployment/deployment";
import { resolveClientIp } from "@/lib/http/client-ip";
import type { WaitlistFailureCode } from "@/lib/landing/waitlist-result";
import { verifyHumanChallenge } from "@/lib/verification/human-verification";
import { headers } from "next/headers";

export type RequestLoginCodeResult =
  | { readonly ok: true }
  | {
      readonly code:
        | "capacity_exhausted"
        | "delivery_failed"
        | "EMAIL_NOT_CONFIGURED"
        | "invalid_input"
        | WaitlistFailureCode;
      readonly ok: false;
    };

function sendFailureCode(error: unknown) {
  const typed = error as { body?: { code?: unknown }; status?: unknown; statusCode?: unknown };
  const code = typeof typed?.body?.code === "string" ? typed.body.code.toLowerCase() : "";
  if (code === "email_not_configured") return "EMAIL_NOT_CONFIGURED" as const;
  if (code === EMAIL_CAPACITY_EXHAUSTED) return "capacity_exhausted" as const;
  if (typed?.status === "TOO_MANY_REQUESTS" || typed?.statusCode === 429 || code.includes("rate")) {
    return "rate_limited" as const;
  }
  return "delivery_failed" as const;
}

export async function requestLoginCode(input: unknown): Promise<RequestLoginCodeResult> {
  const parsed = loginSchema.pick({ email: true, verificationToken: true }).safeParse(input);
  if (!parsed.success) return { code: "invalid_input", ok: false };

  const requestHeaders = await headers();
  if (deploymentMode() === "cloud") {
    const rawIp = resolveClientIp(requestHeaders);
    const clientDigest = createHash("sha256")
      .update(rawIp ?? "unidentified")
      .digest("base64url");
    const verification = await verifyHumanChallenge(
      parsed.data.verificationToken,
      rawIp,
      clientDigest,
    ).catch(() => ({ code: "verification_failed" as const, success: false as const }));
    if (!verification.success) return { code: verification.code, ok: false };
  }

  const { auth } = await import("@/lib/auth/auth");
  try {
    await withVerifiedLoginCodeRequest(() =>
      auth.api.sendVerificationOTP({
        body: { email: parsed.data.email.toLowerCase(), type: "sign-in" },
        headers: requestHeaders,
      }),
    );
    return { ok: true };
  } catch (error) {
    return { code: sendFailureCode(error), ok: false };
  }
}
