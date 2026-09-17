import type { WaitlistFailureCode } from "@/lib/landing/waitlist-result";

export type SharedErrorMessages = {
  genericFallback: () => string;
  rateLimited: () => string;
  serverComponentDigest: (values: { digest: string }) => string;
  staleDeployment: () => string;
  verificationFailed: () => string;
};

export type ActionErrorClassification =
  | { kind: "fallback" }
  | { kind: "ownedMessage"; message: string }
  | { digest: string; kind: "serverComponentDigest" }
  | { kind: "staleDeployment" };

export type WaitlistErrorClassification =
  | { kind: "fallback" }
  | { kind: "rateLimited" }
  | { digest: string; kind: "serverComponentDigest" }
  | { kind: "staleDeployment" }
  | { kind: "verificationFailed" };

const stalePatterns = [
  /failed to find server action/i,
  /server action .* was not found on the server/i,
  /older or newer deployment/i,
];

const nextDigestMessagePatterns = [
  /Server Components render/i,
  /An unexpected response was received from the server/i,
];

const safeWaitlistMessages: Readonly<Record<WaitlistFailureCode, string>> = {
  rate_limited: "Too many requests. Please try again later.",
  verification_failed: "Verification failed. Please try again.",
};

const englishSharedErrorMessages: SharedErrorMessages = {
  genericFallback: () => "The action could not be completed.",
  rateLimited: () => safeWaitlistMessages.rate_limited,
  serverComponentDigest: ({ digest }) =>
    `Check failed on our side (ref ${digest}). Retry in a moment.`,
  staleDeployment: () =>
    "bisibility was updated while this page was open. Refresh the app to continue. Any unsaved changes will be lost.",
  verificationFailed: () => safeWaitlistMessages.verification_failed,
};

/** Temporary compatibility text for unmigrated callers listed in the i18n handoff. */
export const STALE_DEPLOYMENT_MESSAGE = englishSharedErrorMessages.staleDeployment();

export function isStaleDeploymentError(error: unknown) {
  return error instanceof Error && stalePatterns.some((pattern) => pattern.test(error.message));
}

function serverComponentDigest(error: Error) {
  if (!nextDigestMessagePatterns.some((pattern) => pattern.test(error.message))) return null;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.length > 0 ? digest : null;
}

/** Keeps recognition independent from the locale and rendering context. */
export function classifyActionError(error: unknown): ActionErrorClassification {
  if (!(error instanceof Error)) return { kind: "fallback" };
  if (isStaleDeploymentError(error)) return { kind: "staleDeployment" };
  const digest = serverComponentDigest(error);
  if (digest) return { digest, kind: "serverComponentDigest" };
  if (error.message) return { kind: "ownedMessage", message: error.message };
  return { kind: "fallback" };
}

/**
 * Renders recognized cross-feature failures with the caller's scoped catalog.
 * Owned feature messages stay data until that feature maps them to stable UI codes.
 */
export function presentActionError(
  error: unknown,
  messages: SharedErrorMessages,
  fallback = messages.genericFallback(),
): string {
  const classified = classifyActionError(error);
  switch (classified.kind) {
    case "staleDeployment":
      return messages.staleDeployment();
    case "serverComponentDigest":
      return messages.serverComponentDigest({ digest: classified.digest });
    case "ownedMessage":
      return classified.message;
    case "fallback":
      return fallback;
  }
}

export function classifyWaitlistError(error: unknown): WaitlistErrorClassification {
  if (!(error instanceof Error)) return { kind: "fallback" };
  if (error.message === safeWaitlistMessages.verification_failed) {
    return { kind: "verificationFailed" };
  }
  if (error.message === safeWaitlistMessages.rate_limited) return { kind: "rateLimited" };

  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment") return classified;
  if (classified.kind === "serverComponentDigest") return classified;
  return { kind: "fallback" };
}

export function presentWaitlistFailure(
  code: WaitlistFailureCode,
  messages: SharedErrorMessages,
): string {
  return code === "verification_failed" ? messages.verificationFailed() : messages.rateLimited();
}

/** Waitlist errors deliberately omit unknown upstream error messages. */
export function presentWaitlistError(
  error: unknown,
  messages: SharedErrorMessages,
  fallback: string,
): string {
  const classified = classifyWaitlistError(error);
  switch (classified.kind) {
    case "verificationFailed":
      return messages.verificationFailed();
    case "rateLimited":
      return messages.rateLimited();
    case "staleDeployment":
      return messages.staleDeployment();
    case "serverComponentDigest":
      return messages.serverComponentDigest({ digest: classified.digest });
    case "fallback":
      return fallback;
  }
}

/**
 * Compatibility adapter for the explicitly inventoried callers that have not
 * received a scoped translator yet. New UI consumers must use presentActionError.
 */
export function actionErrorMessage(
  error: unknown,
  fallback = englishSharedErrorMessages.genericFallback(),
) {
  return presentActionError(error, englishSharedErrorMessages, fallback);
}

/** Compatibility adapter for existing waitlist callers until their scoped migration. */
export function waitlistFailureMessage(code: WaitlistFailureCode): string {
  return presentWaitlistFailure(code, englishSharedErrorMessages);
}

/** Compatibility adapter retaining the existing waitlist non-leakage boundary. */
export function waitlistErrorMessage(error: unknown, fallback: string): string {
  return presentWaitlistError(error, englishSharedErrorMessages, fallback);
}
