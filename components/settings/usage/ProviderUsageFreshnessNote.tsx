"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { ProviderUsageFreshness } from "@/lib/provider-usage/usage-freshness";
import { useTranslations } from "next-intl";

export function ProviderUsageFreshnessNote({
  freshness,
}: Readonly<{ freshness?: ProviderUsageFreshness }>) {
  const t = useTranslations("projectSettingsUsage.provider");
  const dates = useDateDisplay();
  return (
    <span className="mt-1 block text-[10px] text-fg-muted">
      {t("usageLagNotice")}
      {freshness?.lastReconciledAt
        ? ` ${t("reconciledAt", { time: formatDisplayDateTime(new Date(freshness.lastReconciledAt), dates) })}`
        : null}
      {freshness?.status === "stale" ? (
        <span className="block text-fg">{t("reconciliationStale")}</span>
      ) : null}
    </span>
  );
}
