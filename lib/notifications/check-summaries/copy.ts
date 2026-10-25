import "server-only";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import type { AppLocale } from "@/i18n/config";
import { createIntlTranslator } from "@/i18n/translator.server";
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatCheckWindowLabel } from "./window-label";

const countKeys = ["down", "up", "failed", "under_review", "unchanged", "new"] as const;
function object(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function checkSummaryCopyRenderer(locale: AppLocale) {
  const messages = await loadCoreMessages(locale, ["shell"]);
  const t = createIntlTranslator(locale, messages, { timeZone: "UTC" });
  return (
    type: "manual_run_summary" | "scheduled_window_summary",
    payload: Prisma.JsonValue | null,
  ) => {
    const data = object(payload);
    const counts = object(data.counts);
    const incidents = Array.isArray(data.linkedIncidentIds) ? data.linkedIncidentIds.length : 0;
    const body = countKeys.flatMap((key) => {
      const count = counts[key];
      if (key === "under_review" && incidents > 0) return [];
      return typeof count === "number" && Number.isSafeInteger(count) && count > 0
        ? [t(`shell.notifications.summary.${key}`, { count })]
        : [];
    });
    if (incidents > 0)
      body.push(t("shell.notifications.summary.linkedIncidents", { count: incidents }));
    const window =
      typeof data.windowStart === "string" && typeof data.windowEnd === "string"
        ? formatCheckWindowLabel({
            start: data.windowStart,
            end: data.windowEnd,
            timeZone: "UTC",
            locale,
          })
        : "";
    return {
      title:
        type === "manual_run_summary"
          ? t("shell.notifications.summary.manualTitle")
          : t("shell.notifications.summary.scheduledTitle", { window }),
      body: body.join(", "),
    };
  };
}
