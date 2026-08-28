import "server-only";

import { consume } from "@/lib/api/ratelimit";

export function isCurrentEmailOtpError(error: unknown) {
  if (typeof error !== "object" || error === null || !("body" in error)) return false;
  const { body } = error;
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(String(body.code))
  );
}

export async function consumeAccountEmailCodeBudget(userId: string) {
  const limit = await consume({
    bucketKey: userId,
    limit: 5,
    prefix: "bisibility:account-email-change-code",
    windowSeconds: 15 * 60,
  }).catch(() => {
    // Fail closed so a limiter outage cannot create an unthrottled send path.
    throw new Error("Too many codes requested. Try again later.");
  });
  if (!limit.success) throw new Error("Too many codes requested. Try again later.");
}
