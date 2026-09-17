"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { classifyActionError } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

/** Maps only known migration failures while retaining the shared stale/digest remedies. */
export function useCloudImportActionError() {
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("cloudImport.token.error");

  return (error: unknown) => {
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
    if (classified.kind === "serverComponentDigest") {
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    }

    switch (errorCode(error)) {
      case "migration_token_not_active":
        return t("notActive");
      case "migration_token_already_consumed":
        return t("tokenUsed");
      case "project_read_only":
        return t("writeLocked");
      case "rate_limited":
        return t("rateLimited");
      default:
        return t("generic");
    }
  };
}
