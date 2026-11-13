"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { UsageTrack } from "@/components/usagekit/usage-meter";
import { appPath } from "@/lib/routing/app-path";
import { indexingProgress } from "@/lib/search-index/progress-model";
import type { IndexingData } from "@/lib/search-index/ui-model";
import { GearIcon as Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import { indexingOverviewOf } from "./indexing-view-model";
import { useViewerTimeZone } from "./use-viewer-time-zone";

export function IndexingProgressCard({
  data,
  projectId,
}: Readonly<{ data: IndexingData; projectId: string }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const headingId = useId();
  const overview = indexingOverviewOf(data);
  const progress = indexingProgress({
    checked: data.report.checked,
    dailyLimit: data.settings.inspectionDailyLimit,
    estimatedDaysRemaining: data.report.estimatedDaysRemaining,
    mode: data.settings.budgetMode,
    nextBatchAt: data.backgroundRun?.nextAt ?? null,
    total: data.report.total,
  });
  const settings = (
    <Button
      href={`${appPath(projectId, "settings", "data-sources")}#url-inspection`}
      className="shrink-0"
      startIcon={<Gear aria-hidden size={14} weight="regular" />}
      size="sm"
      variant="secondary"
    >
      {t("progress.settings")}
    </Button>
  );
  const rate = (
    <p className="m-0 flex items-center gap-1 text-ui-caption text-fg-muted">
      <span>
        {progress.kind === "off"
          ? t("progress.off")
          : progress.kind === "limit_zero"
            ? t("progress.limitZero")
            : progress.kind === "available_quota"
              ? t("progress.availableQuota")
              : progress.nextBatchAt
                ? t("progress.perDay", {
                    count: progress.dailyLimit,
                    time: format.dateTime(new Date(progress.nextBatchAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone,
                    }),
                  })
                : t("progress.perDayNoTime", { count: progress.dailyLimit })}
      </span>
      <InfoTooltip text={t("progress.tooltip")} />
    </p>
  );
  if (progress.kind === "off" || progress.kind === "limit_zero") {
    const message = progress.kind === "off" ? t("progress.off") : t("progress.limitZero");
    return (
      <Card
        aria-labelledby={headingId}
        className="flex flex-col gap-2"
        component="section"
        size="sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-ui-body font-semibold" id={headingId}>
            {message}
          </h2>
          {settings}
        </div>
      </Card>
    );
  }
  return (
    <Card aria-labelledby={headingId} className="flex flex-col gap-2" component="section" size="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-ui-body font-semibold" id={headingId}>
          {t("progress.checked", { checked: progress.checked, total: progress.total })}
        </h2>
        {settings}
      </div>
      <UsageTrack
        aria-label={t("progress.meter")}
        aria-valuemax={progress.total}
        aria-valuemin={0}
        aria-valuenow={progress.checked}
        fill={`${progress.percent}%`}
        level="ok"
        role="progressbar"
        size="md"
      />
      {rate}
      <p className="m-0 text-ui-caption text-fg-muted">
        {t("progress.sources", {
          manual: overview.sources.manual,
          sitemap: overview.sources.sitemap,
          targets: overview.sources.keyword_target,
        })}
      </p>
      {progress.kind === "fixed" && progress.daysLeft != null ? (
        <p className="m-0 text-ui-caption text-fg">
          {t("progress.daysLeft", { days: progress.daysLeft })}
        </p>
      ) : null}
    </Card>
  );
}
