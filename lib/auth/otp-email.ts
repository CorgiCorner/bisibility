import "server-only";

import { isFirstRun } from "@/lib/auth/first-run";
import { reserveEmailSignInCode } from "@/lib/auth/signin-capacity";
import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";
import { isEmailConfigured } from "@/lib/email/registry";
import { sendEmail } from "@/lib/email/send";
import { SUPPORTED_EMAIL_PROVIDERS } from "@/lib/email/types";
import { APIError } from "better-auth/api";

export type OtpEmail = {
  email: string;
  otp: string;
  // better-auth 1.6 added "change-email" (verification code sent to the new address).
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};

function signInSubject(type: OtpEmail["type"]) {
  if (type === "forget-password") {
    return "Reset your Bisibility password";
  }

  if (type === "change-email") {
    return "Confirm your new Bisibility email";
  }

  return "Your Bisibility sign-in code";
}

export async function sendOtpEmail(
  { email, otp, type }: OtpEmail,
  { fixedOtpEnabled }: { fixedOtpEnabled: boolean },
) {
  const emailConfigured = isEmailConfigured();
  const firstRunFallback =
    !emailConfigured &&
    process.env.NODE_ENV === "production" &&
    !fixedOtpEnabled &&
    type === "sign-in" &&
    (await isFirstRun());

  let sendCounterReserved = false;
  if (type === "sign-in" && !firstRunFallback) {
    const capacity = await reserveEmailSignInCode();
    if (!capacity.granted) {
      throw new APIError("TOO_MANY_REQUESTS", {
        code: EMAIL_CAPACITY_EXHAUSTED,
        message: EMAIL_CAPACITY_EXHAUSTED,
      });
    }
    sendCounterReserved = capacity.gated;
  }

  if (!emailConfigured) {
    // Demo/dev fixed-code instances do not need a mailer: the code is always 000000.
    if (process.env.NODE_ENV === "production" && !fixedOtpEnabled && !firstRunFallback) {
      throw new Error(
        `Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to send auth OTP email.`,
      );
    }

    // No mailer configured, so surface the code in the server log.
    console.info(`[auth] ${type} OTP for ${email}: ${otp}`);
    return;
  }

  await sendEmail({
    category: "transactional",
    html: `<p>Your Bisibility code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`,
    sendCounterReserved,
    subject: signInSubject(type),
    text: `Your Bisibility code is ${otp}. It expires in 5 minutes.`,
    to: email,
  });
}
