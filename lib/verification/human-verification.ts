import "server-only";

import type { WaitlistFailureCode } from "@/lib/landing/waitlist-result";

export type HumanVerificationResult =
  | { readonly success: true }
  | { readonly code: WaitlistFailureCode; readonly success: false };

export async function verifyHumanChallenge(
  _token: string | undefined,
  _ip: string | null,
  _clientDigest: string,
): Promise<HumanVerificationResult> {
  return { success: true };
}
