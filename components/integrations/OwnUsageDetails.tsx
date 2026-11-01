"use client";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { useLocale, useTranslations } from "next-intl";
import { UsageDetailsTable } from "./UsageDetailsTable";

export function OwnUsageDetails({ data }: { data: ProjectUsageViews }) {
  const t = useTranslations("projectIntegrations.usageDetailsTable");
  if (data.status !== "available") return null;
  return (
    <UsageDetailsTable
      data={data}
      fundingSource="byok"
      messages={{
        usageMonth: t("usageMonth"),
        usageMonthHelp: t("usageMonthHelp"),
        usageMonthEmpty: t("usageMonthEmpty"),
        usageProvider: t("usageProvider"),
        usageAppRequests: t("usageAppRequests"),
        usageApiRequests: t("usageApiRequests"),
        usageBilled: t("usageBilled"),
        mixedUnits: t("mixedUnits"),
        providerCount: t.raw("providerCount"),
        partialUsage: t("partialUsage"),
        creditsTitle: t("creditsTitle"),
        ownKeysTitle: t("ownKeysTitle"),
        retainedConnection: t("retainedConnection"),
      }}
    />
  );
}

/** UTC month used by the metering view, shown before self-host limits. */
export function OwnUsagePeriod({ data }: { data: ProjectUsageViews }) {
  const t = useTranslations("projectSettingsUsage.limits");
  const locale = useLocale();
  if (data.status !== "available") return null;
  const start = new Date(data.from);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return (
    <p className="text-xs text-fg-muted">
      {t("usagePeriod", {
        month: new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(start),
        date: new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        }).format(next),
      })}
    </p>
  );
}
