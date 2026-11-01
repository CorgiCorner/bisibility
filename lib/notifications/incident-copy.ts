import "server-only";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import type { AppLocale } from "@/i18n/config";
import { createIntlTranslator } from "@/i18n/translator.server";
import type { Prisma } from "@/lib/generated/prisma/client";

export const incidentResultKeys = [
  "resultUnderReviewCount",
  "resultRecoveredCount",
  "resultPartialCount",
  "resultProviderErrorCount",
  "resultMissingCount",
] as const;
export const incidentCostKeys = [
  "costMeasuredCount",
  "costUnknownCount",
  "costUnderReviewCount",
  "costConflictCount",
] as const;

export async function incidentCopyRenderer(locale: AppLocale) {
  const messages = await loadCoreMessages(locale, ["shell"]);
  const t = createIntlTranslator(locale, messages, { timeZone: "UTC" });
  return (payload: Prisma.JsonValue | null) => {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    if (data.kind === "account_block") {
      const provider = typeof data.provider === "string" ? data.provider : "";
      const reason =
        data.reason === "provider_billing"
          ? "billing"
          : data.reason === "provider_auth"
            ? "credentials"
            : data.reason === "provider_account_restricted"
              ? "restricted"
              : "body";
      return {
        title: t(
          data.state === "resolved"
            ? "shell.notifications.accountBlock.resolvedTitle"
            : "shell.notifications.accountBlock.title",
          { provider },
        ),
        body: t(
          data.state === "resolved"
            ? "shell.notifications.accountBlock.resolvedBody"
            : `shell.notifications.accountBlock.${reason}`,
        ),
      };
    }
    const dimension = (
      keys: readonly ((typeof incidentResultKeys)[number] | (typeof incidentCostKeys)[number])[],
    ) =>
      keys
        .flatMap((key) => {
          const count = data[key];
          return typeof count === "number" && Number.isSafeInteger(count) && count > 0
            ? [t(`shell.notifications.incident.${key}`, { count })]
            : [];
        })
        .join(", ");
    const counts = t("shell.notifications.incident.counts", {
      results: dimension(incidentResultKeys),
      costs: dimension(incidentCostKeys),
    });
    const body = [
      data.state === "resolved" ? t("shell.notifications.incident.resolved") : null,
      counts,
      t("shell.notifications.incident.noRepeat"),
    ]
      .filter(Boolean)
      .join(" ");
    return { title: t("shell.notifications.incident.title"), body };
  };
}
