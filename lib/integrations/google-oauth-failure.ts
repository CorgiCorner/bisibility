import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { redactOpsText } from "@/lib/ops/slack";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCredentialsDecryptError } from "@/lib/providers/crypto";
import { ProviderHttpError } from "@/lib/providers/failure-class";

/**
 * Google OAuth install failures, reduced to a closed set of non-sensitive reason codes.
 *
 * The callback route used to swallow every failure into one opaque `google=error` redirect,
 * which left both the operator and the user guessing. A reason code is safe to log and safe to
 * put in a URL: it names the stage that failed, never the OAuth code, state, or any token.
 */

export const GOOGLE_OAUTH_FAILURE_REASONS = [
  "actor_mismatch",
  "credentials_decrypt",
  "google_denied",
  "no_refresh_token",
  "state_cookie_mismatch",
  "state_expired",
  "store_failed",
  "token_exchange",
] as const;

export type GoogleOAuthFailureReason = (typeof GOOGLE_OAUTH_FAILURE_REASONS)[number];

export function isGoogleOAuthFailureReason(value: unknown): value is GoogleOAuthFailureReason {
  return (
    typeof value === "string" && (GOOGLE_OAUTH_FAILURE_REASONS as readonly string[]).includes(value)
  );
}

/** Everything the error surface needs; `null` means "the state never got that far". */
export type GoogleOAuthFailure = {
  /** Class name of an unclassified throw, for the server log only. */
  causeClass?: string;
  /** Redacted message of an unclassified throw, for the server log only. */
  causeMessage?: string;
  /** Google's own `?error=` code, kept for the log only - see `googleDeniedFailure`. */
  googleError?: string | null;
  projectId: string | null;
  provider: string | null;
  reason: GoogleOAuthFailureReason | null;
  returnPath: string | null;
};

type FailureContext = {
  projectId?: string | null;
  provider?: string | null;
  returnPath?: string | null;
};

export class GoogleOAuthInstallError extends Error {
  readonly projectId: string | null;
  readonly provider: string | null;
  readonly reason: GoogleOAuthFailureReason;
  readonly returnPath: string | null;

  constructor(reason: GoogleOAuthFailureReason, message: string, context: FailureContext = {}) {
    super(message);
    this.name = "GoogleOAuthInstallError";
    this.projectId = context.projectId ?? null;
    this.provider = context.provider ?? null;
    this.reason = reason;
    this.returnPath = context.returnPath ?? null;
  }
}

const EMPTY_FAILURE = {
  projectId: null,
  provider: null,
  reason: null,
  returnPath: null,
} satisfies Omit<GoogleOAuthFailure, "causeClass" | "causeMessage">;

function unclassifiedFailure(error: unknown): GoogleOAuthFailure {
  if (error instanceof Error) {
    return {
      ...EMPTY_FAILURE,
      causeClass: error.constructor.name,
      causeMessage: redactOpsText(error),
    };
  }
  return {
    ...EMPTY_FAILURE,
    causeMessage: redactOpsText(error),
  };
}

/**
 * Reduces any thrown value to a safe, loggable failure. Recognized shapes classify by type, never
 * by message: our own install errors, the typed credential decryption error, the provider HTTP
 * and auth errors (which only escape the token exchange), and Prisma known-request persistence
 * errors. Recognized errors carry authored copy, so only an unclassified throw contributes a
 * cause class and a redacted cause message - the one case where the operator has nothing else.
 */
export function googleOAuthFailureFrom(error: unknown): GoogleOAuthFailure {
  if (error instanceof GoogleOAuthInstallError) {
    if (!isGoogleOAuthFailureReason(error.reason)) {
      // A forged or corrupted reason must never be reflected into a log or URL.
      return unclassifiedFailure(error);
    }
    return {
      projectId: error.projectId,
      provider: error.provider,
      reason: error.reason,
      returnPath: error.returnPath,
    };
  }
  if (error instanceof ProviderCredentialsDecryptError) {
    return { ...EMPTY_FAILURE, reason: "credentials_decrypt" };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { ...EMPTY_FAILURE, reason: "store_failed" };
  }
  if (error instanceof ProviderHttpError || error instanceof ProviderAuthError) {
    return { ...EMPTY_FAILURE, reason: "token_exchange" };
  }
  return unclassifiedFailure(error);
}

/**
 * Google returns more than `access_denied` here - `admin_policy_enforced`, `org_internal`,
 * `invalid_scope` and friends all arrive on this branch. They collapse to one user-facing reason
 * because the remedy is the same from the user's side, but the operator log keeps the code Google
 * actually sent, since that is the one diagnostic the callback gets for free.
 *
 * The value arrives on a public callback URL, so anything outside Google's snake_case shape is
 * treated as noise rather than written to a log sink verbatim.
 */
export function googleDeniedFailure(
  googleError: string | null,
  context: FailureContext = {},
): GoogleOAuthFailure {
  return {
    googleError: googleError && /^[a-z_]{1,64}$/.test(googleError) ? googleError : "unrecognized",
    projectId: context.projectId ?? null,
    provider: context.provider ?? null,
    reason: "google_denied",
    returnPath: context.returnPath ?? null,
  };
}

/**
 * One server-side line per failed install. Reason, project and provider, plus - for unclassified
 * throws only - the cause class and the redacted cause message. The OAuth code, the state payload,
 * the tokens and any provider payload must never reach a log sink.
 */
export type GoogleOAuthFailureCause = {
  causeClass?: string;
  causeMessage?: string;
};

export function logGoogleOAuthFailure(failure: Omit<GoogleOAuthFailure, "returnPath">) {
  const causeFields = failure.reason
    ? {}
    : {
        ...(failure.causeClass ? { causeClass: failure.causeClass } : {}),
        ...(failure.causeMessage ? { causeMessage: redactOpsText(failure.causeMessage) } : {}),
      };
  console.error("[google-oauth] install failed", {
    ...causeFields,
    ...(failure.googleError ? { googleError: failure.googleError } : {}),
    projectId: failure.projectId ?? "unknown",
    provider: failure.provider ?? "unknown",
    reason: failure.reason ?? "unclassified",
  });
}
