"use client";

import { useTranslations } from "next-intl";
import type { AuthErrorMessages } from "./login-errors";

export function useAuthErrorMessages(): AuthErrorMessages {
  const t = useTranslations("auth");
  return {
    accountInactive: t("login.status.accountInactive"),
    emailUnavailable: t("emailUnavailable.description"),
    fallback: t("login.status.genericError"),
    methodUnavailable: t("login.status.methodUnavailable"),
    providerEmailUnavailable: t("login.status.providerEmailUnavailable"),
    providerEmailUnverified: t("login.status.providerEmailUnverified"),
    providerProfileUnavailable: t("login.status.providerProfileUnavailable"),
    sessionBlocked: t("login.status.sessionBlocked"),
  };
}
