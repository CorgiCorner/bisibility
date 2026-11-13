"use client";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { MAX_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import type { IndexingData } from "@/lib/search-index/ui-model";
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
      <section>
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
            <span className="break-all text-ui-body font-semibold">{report.property}</span>
            <span className="text-ui-caption text-fg-muted">
              {report.checked === 0
                ? t(report.total === 0 ? "noInspectionTargets" : "noInspectionResults", {
                    total: report.total,
                  })
                : t("denominator", { checked: report.checked, total: report.total })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              href={`/app/${projectId}/settings/data-sources#url-inspection`}
              size="sm"
              variant="secondary"
            >
              {t("settings")}
            </Button>
            <Button
              id="indexing-inspect-trigger"
              size="sm"
              variant="secondary"
              disabled={!canInspect || Boolean(exhausted)}
              onClick={onInspect}
            >
              {t("inspect")}
            </Button>
          </div>
        </div>
        <Disclosure
          title={t("inspectionDetails")}
          variant="inline"
          className="border-t border-border px-4"
          summaryClassName="min-h-10 py-2 text-fg-muted sm:min-h-10"
          contentClassName="flex flex-col gap-3 pb-3 text-ui-caption text-fg-muted"
        >
          <dl className="m-0 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
            <div>
              <dt>{t("modeLabel")}</dt>
              <dd className="m-0 mt-1 text-fg">{t(`modes.${settings.budgetMode}`)}</dd>
            </div>
            <div>
              <dt>{t("todayLabel")}</dt>
              <dd className="m-0 mt-1 text-fg">
                {t("checksToday", { count: settings.todayCount })}
              </dd>
            </div>
            <div>
              <dt>{t("resetLabel")}</dt>
              <dd className="m-0 mt-1 text-fg">{t("quotaReset", { reset })}</dd>
            </div>
          </dl>
          <p className="m-0">{t("storedState")}</p>
          {report.checked > 0 && report.oldestResultAt && report.newestResultAt ? (
            <p className="m-0">
              {t("freshness", {
                oldest: date(report.oldestResultAt),
                newest: date(report.newestResultAt),
              })}
            </p>
          ) : null}
        </Disclosure>
      </section>
      {exhausted ? (
        <InlineCallout className="rounded-none border-0 px-4" role="status" tint="yellow">
          {t(report.complete ? "dailyExhausted" : "dailyExhaustedPartial", { reset })}
        </InlineCallout>
      ) : null}
      {!report.complete && !exhausted ? (
        <InlineCallout className="rounded-none border-0 px-4" role="status" tint="neutral">
          {t("partial")}
        </InlineCallout>
      ) : null}
    </>
  );
}
