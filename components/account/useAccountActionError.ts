"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { classifyActionError } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";

/** Keeps shared recovery guidance while mapping the account action's safe, owned outcomes. */
export function useAccountActionError() {
  const sharedErrors = useSharedErrorMessages();
  const emailErrors = useTranslations("account.email.errors");

  function present(error: unknown, fallback: string, known?: (message: string) => string | null) {
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
    if (classified.kind === "serverComponentDigest") {
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    }
    if (classified.kind === "ownedMessage") return known?.(classified.message) ?? fallback;
    return fallback;
  }

  function knownEmailError(message: string) {
    if (message === "Enter a different email address.") return emailErrors("differentAddress");
    if (message === "The code from your current email is invalid or expired. Request a new one.") {
      return emailErrors("currentCodeExpired");
    }
    if (message === "The verification code is invalid or expired, or the email is unavailable.") {
      return emailErrors("newCodeInvalidOrUnavailable");
    }
    if (message === "Email is already verified.") return emailErrors("alreadyVerified");
    if (message === "The verification code is invalid or expired.") {
      return emailErrors("verificationCodeInvalidOrExpired");
    }
    return null;
  }

  return {
    email: (error: unknown, fallback: string) => present(error, fallback, knownEmailError),
    generic: (error: unknown, fallback: string) => present(error, fallback),
  };
}
