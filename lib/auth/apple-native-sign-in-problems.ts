import "server-only";

import { errorResponse } from "@/lib/api/responses";
import { recordSignInAudit } from "@/lib/auth/sign-in-audit";

export const APPLE_NATIVE_SIGN_IN_METHOD = "apple_native";
const INSTANCE = "urn:bisibility:auth:ios:apple";

export type AppleNativeSignInProblem =
  | "account_deactivated"
  | "account_link_required"
  | "apple_sign_in_unavailable"
  | "apple_unavailable"
  | "authorization_code_invalid"
  | "email_required"
  | "identity_token_invalid"
  | "invalid_request"
  | "nonce_mismatch"
  | "nonce_replayed"
  | "sign_in_unavailable"
  | "signup_unavailable"
  | "two_factor_required";

const problems = {
  account_deactivated: [403, "forbidden", "This account is deactivated."],
  account_link_required: [
    409,
    "conflict",
    "An account with this email already exists. Sign in with an email code or Google instead.",
  ],
  apple_sign_in_unavailable: [503, "provider_unavailable", "Sign in with Apple is not available."],
  apple_unavailable: [503, "provider_unavailable", "Apple is unavailable. Try again shortly."],
  authorization_code_invalid: [401, "unauthorized", "Apple did not confirm this sign-in."],
  email_required: [
    400,
    "bad_request",
    "Apple did not share a verified email address, which a new account needs.",
  ],
  identity_token_invalid: [401, "unauthorized", "The Apple identity could not be verified."],
  invalid_request: [400, "bad_request", "The sign-in request is malformed."],
  nonce_mismatch: [401, "unauthorized", "The sign-in nonce does not match."],
  nonce_replayed: [401, "unauthorized", "This sign-in was already used. Start again."],
  sign_in_unavailable: [403, "forbidden", "Sign-in is not available for this account."],
  signup_unavailable: [403, "forbidden", "New accounts cannot be created here right now."],
  two_factor_required: [
    403,
    "forbidden",
    "This account uses two-factor authentication. Sign in through the web flow.",
  ],
} as const satisfies Record<
  AppleNativeSignInProblem,
  readonly [
    number,
    "bad_request" | "conflict" | "forbidden" | "provider_unavailable" | "unauthorized",
    string,
  ]
>;

function problem(code: AppleNativeSignInProblem) {
  const [status, kind, detail] = problems[code];
  return errorResponse(kind, detail, status, {
    headers: { "Cache-Control": "no-store" },
    instance: INSTANCE,
    problemDetails: { code },
  });
}

type FailureAudit = { email?: string | null; userId?: string | null };

export async function refuse(code: AppleNativeSignInProblem, audit: FailureAudit = {}) {
  await recordSignInAudit({
    email: audit.email ?? "unknown",
    method: APPLE_NATIVE_SIGN_IN_METHOD,
    status: "failed",
    statusReason: code,
    userId: audit.userId,
  }).catch(() => undefined);
  return problem(code);
}
