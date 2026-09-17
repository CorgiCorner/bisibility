"use client";

import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";

/** Adapts the scoped shared catalog to the explicit error-presentation contract. */
export function useSharedErrorMessages(): SharedErrorMessages {
  const t = useTranslations("shared.errors");

  return {
    genericFallback: () => t("genericFallback"),
    rateLimited: () => t("rateLimited"),
    serverComponentDigest: ({ digest }) => t("serverComponentDigest", { digest }),
    staleDeployment: () => t("staleDeployment"),
    verificationFailed: () => t("verificationFailed"),
  };
}
