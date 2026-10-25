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
