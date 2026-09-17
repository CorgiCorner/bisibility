import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";

function errorCodes(error: unknown) {
  if (!error || typeof error !== "object") return [];
  const typed = error as { body?: { code?: unknown }; code?: unknown; message?: unknown };
  return [typed.code, typed.message, typed.body?.code];
}

export type AuthErrorMessages = {
  emailUnavailable: string;
  fallback: string;
  methodUnavailable: string;
  providerEmailUnavailable: string;
  providerEmailUnverified: string;
  providerProfileUnavailable: string;
};

const messageKeyByKnownSocialError = {
  EMAIL_NOT_CONFIGURED: "emailUnavailable",
  EMAIL_NOT_VERIFIED: "providerEmailUnverified",
  FAILED_TO_GET_USER_INFO: "providerProfileUnavailable",
  PROVIDER_NOT_FOUND: "methodUnavailable",
  USER_EMAIL_NOT_FOUND: "providerEmailUnavailable",
} as const satisfies Record<string, keyof AuthErrorMessages>;

/**
 * Maps known Better Auth social-sign-in codes to caller-scoped catalog values.
 * Upstream text is deliberately not rendered: an unknown code can contain provider diagnostics,
 * while known user-facing states must not fall through as English framework messages.
 */
export function authErrorMessage(error: unknown, messages: AuthErrorMessages) {
  for (const value of errorCodes(error)) {
    if (typeof value !== "string") continue;
    const key =
      messageKeyByKnownSocialError[
        value.toUpperCase() as keyof typeof messageKeyByKnownSocialError
      ];
    if (key) return messages[key];
  }

  return messages.fallback;
}

export function isEmailCapacityError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const typed = error as { code?: unknown; message?: unknown };
  return [typed.code, typed.message].some(
    (value) => typeof value === "string" && value.toLowerCase() === EMAIL_CAPACITY_EXHAUSTED,
  );
}
