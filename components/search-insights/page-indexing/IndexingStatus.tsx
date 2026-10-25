"use client";

import { SearchInsightsContextCard } from "@/components/search-insights/SearchInsightsContextCard";
import { Button } from "@/components/ui/Button";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { StatusChip } from "@/components/ui/StatusChip";
import { MAX_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import type { IndexingData } from "@/lib/search-index/ui-model";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useViewerTimeZone } from "./use-viewer-time-zone";

export function IndexingStatus({
  data,
  projectId,
  canInspect,
  onInspect,
}: Readonly<{
  data: IndexingData;
  projectId: string;
  canInspect: boolean;
  onInspect: () => void;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const locale = useLocale();
  const hour12 = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).resolvedOptions().hour12;
  const { report, settings } = data;
  const now = data.now ?? new Date();
  const year = (value: Date) => format.dateTime(value, { timeZone, year: "numeric" });
  const date = (value: Date | null) =>
    value
      ? format.dateTime(new Date(value), {
          timeZone,
          month: "short",
          day: "numeric",
          hour: hour12 ? "numeric" : "2-digit",
          minute: "2-digit",
          ...(year(new Date(value)) === year(now) ? {} : { year: "numeric" }),
        })
      : "-";
  const reset = date(settings.nextResetAt);
  const dailyProviderStop =
    settings.last429Kind === "daily" &&
    settings.last429At &&
    nextPacificMidnight(new Date(settings.last429At)).getTime() ===
      new Date(settings.nextResetAt).getTime();
  const exhausted =
    dailyProviderStop ||
    (settings.budgetMode !== "available_quota" &&
      (data.allowance.remaining === 0 || settings.todayCount >= MAX_INSPECTION_DAILY_LIMIT));
  return (
    <>
      <SearchInsightsContextCard
        trustStrip={
          <p className="m-0 border-t border-border px-3 py-2 text-ui-caption text-fg-muted">
            {t("trustStrip", { count: settings.todayCount, reset })}
          </p>
        }
      >
        <span className="break-all text-ui-body font-semibold">{report.property}</span>
        <span className="text-ui-caption text-fg-muted">
          {t("denominator", {
            checked: report.checked,
            total: report.total,
          })}{" "}
          {t("freshness", {
            oldest: date(report.oldestResultAt),
            newest: date(report.newestResultAt),
          })}
        </span>
        <StatusChip size="sm" tone="info" label={t(`modes.${settings.budgetMode}`)} />
        <Link
          className="text-ui-caption underline"
          href={`/app/${projectId}/settings/data-sources#url-inspection`}
        >
          {t("settings")}
        </Link>
        <Button
          id="indexing-inspect-trigger"
          className="ml-auto"
          size="xs"
          variant="secondary"
          disabled={!canInspect || Boolean(exhausted)}
          onClick={onInspect}
        >
          {t("inspect")}
        </Button>
      </SearchInsightsContextCard>
      {exhausted ? (
        <InlineCallout role="status" tint="yellow">
          {t(report.complete ? "dailyExhausted" : "dailyExhaustedPartial", { reset })}
        </InlineCallout>
      ) : null}
      {!report.complete && !exhausted ? (
        <InlineCallout role="status" tint="neutral">
          {t("partial")}
        </InlineCallout>
      ) : null}
    </>
  );
}
