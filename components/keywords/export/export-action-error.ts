import type { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { classifyActionError, presentActionError } from "@/lib/ui/action-error";
import type { useTranslations } from "next-intl";

type ExportMessages = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.export">
>;

/** Maps only known export failures to actionable copy and suppresses unknown server detail. */
export function exportFailureMessage(
  error: unknown,
  sharedErrors: ReturnType<typeof useSharedErrorMessages>,
  t: ExportMessages,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment" || classified.kind === "serverComponentDigest") {
    return presentActionError(error, sharedErrors, t("failed"));
  }
  if (classified.kind !== "ownedMessage") return t("failed");

  const message = classified.message.toLowerCase();
  if (message.includes("unauthorized") || message.includes("forbidden")) {
    return t("authorizationFailed");
  }
  if (
    /^instance import package downloads currently support up to \d+ keywords\.$/i.test(
      classified.message,
    )
  ) {
    return t("limitExceeded");
  }
  if (
    /^instance import package downloads currently support up to \d+ checks per keyword\.$/i.test(
      classified.message,
    )
  ) {
    return t("historyLimitExceeded");
  }
  return t("failed");
}
