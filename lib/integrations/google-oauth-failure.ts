/**
 * Google OAuth install failures, reduced to a closed set of non-sensitive reason codes.
 *
 * The callback route used to swallow every failure into one opaque `google=error` redirect,
 * which left both the operator and the user guessing. A reason code is safe to log and safe to
 * put in a URL: it names the stage that failed, never the OAuth code, state, or any token.
 */

export const GOOGLE_OAUTH_FAILURE_REASONS = [
  "actor_mismatch",
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

export function googleOAuthFailureFrom(error: unknown): GoogleOAuthFailure {
  if (error instanceof GoogleOAuthInstallError) {
    return {
      projectId: error.projectId,
      provider: error.provider,
      reason: error.reason,
      returnPath: error.returnPath,
    };
  }
  return { projectId: null, provider: null, reason: null, returnPath: null };
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
 * One server-side line per failed install. Reason, project and provider only - the OAuth code,
 * the state payload and the tokens must never reach a log sink.
 */
export function logGoogleOAuthFailure(failure: Omit<GoogleOAuthFailure, "returnPath">) {
  console.error("[google-oauth] install failed", {
    ...(failure.googleError ? { googleError: failure.googleError } : {}),
    projectId: failure.projectId ?? "unknown",
    provider: failure.provider ?? "unknown",
    reason: failure.reason ?? "unclassified",
  });
}
