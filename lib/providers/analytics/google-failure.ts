import type {
  GooglePropertyFailure,
  GooglePropertyFailureReason,
} from "@/lib/integrations/google-property-failure";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
  ProviderHttpError,
} from "@/lib/providers/failure-class";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";

const reasons = {
  invalid_grant: "auth",
  UNAUTHENTICATED: "auth",
  accessNotConfigured: "api_disabled",
  SERVICE_DISABLED: "api_disabled",
  API_DISABLED: "api_disabled",
  invalid_client: "configuration",
  unauthorized_client: "configuration",
  insufficientPermissions: "permission",
  forbidden: "permission",
  PERMISSION_DENIED: "permission",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: "scope",
  dailyLimitExceeded: "quota",
  rateLimitExceeded: "quota",
  userRateLimitExceeded: "quota",
  quotaExceeded: "quota",
  RATE_LIMIT_EXCEEDED: "quota",
  QUOTA_EXCEEDED: "quota",
  RESOURCE_EXHAUSTED: "quota",
} satisfies Record<string, GooglePropertyFailureReason>;
type GoogleErrorCode = keyof typeof reasons;
const actions: Record<GooglePropertyFailureReason, GooglePropertyFailure["action"]> = {
  auth: "reconnect",
  scope: "reauthorize",
  permission: "check_permissions",
  api_disabled: "configure_api",
  configuration: "configure_api",
  quota: "retry_later",
  temporary: "retry",
  unknown: "retry",
};
const configurationCopy =
  "The Google API configuration needs attention. Ask the app administrator to enable the API and check its setup, then try again.";
const copy: Record<GooglePropertyFailureReason, string> = {
  auth: "Reconnect your Google account to load properties.",
  scope: "Reconnect your Google account and approve the requested permissions for this app.",
  permission:
    "This Google account cannot access these properties. Check its permissions in Search Console or Analytics.",
  api_disabled: configurationCopy,
  configuration: configurationCopy,
  quota: "Google's request limit was reached. Try again later.",
  temporary: "Google is temporarily unavailable. Try again.",
  unknown: "Properties could not be loaded. Try again.",
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function allowedCode(value: unknown): GoogleErrorCode | undefined {
  return typeof value === "string" && Object.hasOwn(reasons, value)
    ? (value as GoogleErrorCode)
    : undefined;
}
function payloadCode(payload: unknown) {
  const error = record(payload).error;
  const body = record(error);
  const codes = [
    error,
    ...(Array.isArray(body.errors) ? body.errors.map((value) => record(value).reason) : []),
    ...(Array.isArray(body.details) ? body.details.map((value) => record(value).reason) : []),
    body.status,
  ]
    .map(allowedCode)
    .filter((code): code is GoogleErrorCode => Boolean(code));
  return codes.find((code) => reasons[code] !== "permission") ?? codes[0];
}
class GoogleAuthorizationError extends ProviderAuthError {
  constructor(
    readonly status: number,
    readonly code: GoogleErrorCode,
    providerId: "gsc" | "ga4" | "google",
  ) {
    super(providerId);
  }
}
export class GoogleRequestError extends ProviderHttpError {
  readonly reason: GooglePropertyFailureReason;
  constructor(
    status: number,
    readonly code?: GoogleErrorCode,
    classification?: ProviderFailureClass,
  ) {
    const reason = code
      ? reasons[code]
      : status === 403
        ? "permission"
        : status === 429
          ? "quota"
          : status >= 500
            ? "temporary"
            : "unknown";
    super(
      status,
      `Google API request failed with status ${status}.`,
      reason === "quota"
        ? "rate_limit"
        : ["api_disabled", "configuration"].includes(reason)
          ? "config_invalid"
          : reason === "auth"
            ? "auth"
            : classification,
    );
    this.reason = reason;
  }
}
export function googleResponseError(
  status: number,
  payload: unknown,
  providerId: "gsc" | "ga4" | "google" = "google",
): Error {
  const code = payloadCode(payload);
  const message = record(record(payload).error).message;
  // Classify the legacy property-validation signal without retaining its untrusted text.
  const classification = classifyProviderFailure(
    new ProviderHttpError(status, typeof message === "string" ? message : ""),
  );
  return (code ? reasons[code] === "auth" : status === 401)
    ? new GoogleAuthorizationError(status, code ?? "UNAUTHENTICATED", providerId)
    : new GoogleRequestError(status, code, classification);
}
export function googlePropertyFailure(error: unknown): GooglePropertyFailure {
  const reason: GooglePropertyFailureReason =
    error instanceof ProviderAuthError
      ? "auth"
      : error instanceof GoogleRequestError
        ? error.reason
        : error instanceof ProviderHttpError && error.status === 401
          ? "auth"
          : error instanceof ProviderHttpError && error.status === 429
            ? "quota"
            : error instanceof ProviderRateLimitedError
              ? "quota"
              : error instanceof ProviderHttpError && error.status === 403
                ? "permission"
                : ["network", "provider_5xx"].includes(classifyProviderFailure(error))
                  ? "temporary"
                  : "unknown";
  const httpStatus =
    error instanceof ProviderHttpError || error instanceof GoogleAuthorizationError
      ? error.status
      : undefined;
  const code =
    error instanceof GoogleRequestError || error instanceof GoogleAuthorizationError
      ? error.code
      : undefined;
  return {
    reason,
    action: actions[reason],
    ...(httpStatus ? { httpStatus } : {}),
    ...(code ? { code } : {}),
  };
}
export function googlePropertyFailureCopy(failure: GooglePropertyFailure) {
  return copy[failure.reason];
}

export function logGooglePropertyFailure(
  provider: "gsc" | "ga4",
  error: unknown,
): GooglePropertyFailure {
  const failure = googlePropertyFailure(error);
  console.info("[google] property request failed", {
    provider,
    failureClass: classifyProviderFailure(error),
    ...failure,
  });
  return failure;
}

// Preserve only errors whose message and metadata were sanitized by the Google client.
// The generic probe wrapper must not replace them with an untyped message.
export function preserveGoogleRequestFailure(error: unknown): void {
  if (error instanceof GoogleRequestError || error instanceof GoogleAuthorizationError) throw error;
}

export function googlePropertySaveFailure(provider: "gsc" | "ga4", error: unknown) {
  const failure = logGooglePropertyFailure(provider, error);
  return {
    status: ["reconnect", "reauthorize"].includes(failure.action)
      ? ("reauth_required" as const)
      : ("failed" as const),
    failure,
  };
}
