import "server-only";

import { otpSendState } from "@/lib/auth/otp-send-context";
import { FIXED_OTP_ENABLED } from "@/lib/auth/runtime-config";
import { isEmailConfigured } from "@/lib/email/registry";
import { sendEmail } from "@/lib/email/send";
import { SUPPORTED_EMAIL_PROVIDERS } from "@/lib/email/types";

export type OtpEmail = {
  email: string;
  otp: string;
  // better-auth 1.6 added "change-email" (verification code sent to the new address).
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
};

function signInSubject(type: OtpEmail["type"]) {
  if (type === "forget-password") {
    return "Reset your bisibility password";
  }

  if (type === "change-email") {
    return "Confirm your new bisibility email";
  }

  // Proves control of the address already on the account (used before an email change).
  if (type === "email-verification") {
    return "Verify your bisibility email";
  }

  return "Your bisibility sign-in code";
}

export async function sendOtpEmail({ email, otp, type }: OtpEmail) {
  const emailConfigured = isEmailConfigured();
  const requestState = otpSendState();
  const firstRunFallback = requestState?.firstRunFallback === true;
  const sendCounterReserved = requestState?.sendCounterReserved === true;

  if (!emailConfigured) {
    // Demo/dev fixed-code instances do not need a mailer: the code is always 000000.
    if (firstRunFallback) {
      console.info(`[auth] sign-in OTP for ${email}: ${otp}`);
      console.info(
        `Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to receive future sign-in codes by email.`,
      );
      return;
    }

    if (process.env.NODE_ENV === "production" && !FIXED_OTP_ENABLED) {
      throw new Error(
        `Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to send auth OTP email.`,
      );
    }

    // Local development can surface the code without requiring delivery infrastructure.
    console.info(`[auth] ${type} OTP for ${email}: ${otp}`);
    return;
  }

  await sendEmail({
    category: "transactional",
    html: `<p>Your bisibility code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`,
    sendCounterReserved,
    subject: signInSubject(type),
    text: `Your bisibility code is ${otp}. It expires in 5 minutes.`,
    to: email,
  });
}
