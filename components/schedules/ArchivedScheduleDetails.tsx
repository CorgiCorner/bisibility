"use client";

// The schedule page wraps this panel in ProjectRunsFeatureBoundary, a client provider, so
// `projectRuns.schedules` is readable only on the client side of that boundary.

import { RunsTable } from "@/components/rank-runs/RunsTable";
import type { RankRunRecord } from "@/components/rank-runs/runs-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PillBadge } from "@/components/ui/Pill";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { useTranslations } from "next-intl";
import type { ScheduleEditorSchedule } from "./ScheduleEditorModel";
import { RestoreScheduleButton } from "./ScheduleLifecycleActions";

export function ArchivedScheduleDetails({
  canManage,
  history,
  nextCursor,
  projectId,
  projectTimezone,
  projectDepth,
  providerLabel,
  schedule,
}: Readonly<{
  canManage: boolean;
  history: readonly RankRunRecord[];
  nextCursor: string | null;
  projectId: string;
  projectTimezone: string;
  projectDepth: number;
  providerLabel: string;
  schedule: ScheduleEditorSchedule;
}>) {
  const t = useTranslations("projectRuns.schedules");
  return (
    <div className="grid gap-4">
      <Card size="sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillBadge size="xs">{t("archived")}</PillBadge>
          {canManage ? (
            <RestoreScheduleButton projectId={projectId} scheduleId={schedule.publicId} />
          ) : null}
        </div>
        <p className="my-4 text-sm text-fg-muted">{t("archivedDetails.body")}</p>
        <dl className="m-0 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-fg-muted">{t("archivedDetails.timeZone")}</dt>
            <dd className="m-0 mt-1">
              {schedule.timezone ??
                t("archivedDetails.projectDefaultTimeZone", { timeZone: projectTimezone })}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("archivedDetails.serpDepth")}</dt>
            <dd className="m-0 mt-1">
              {schedule.serpDepth
                ? t("archivedDetails.topDepth", { depth: schedule.serpDepth })
                : t("archivedDetails.projectDefaultDepth", { depth: projectDepth })}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("archivedDetails.startWindow")}</dt>
            <dd className="m-0 mt-1">
              {schedule.timeOfDay
                ? t("archivedDetails.withinWindow", {
                    minutes: schedule.jitterMinutes,
                    time: schedule.timeOfDay,
                  })
                : t("archivedDetails.spreadInterval")}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("provider")}</dt>
            <dd className="m-0 mt-1">{providerLabel}</dd>
          </div>
        </dl>
      </Card>
      <Card className="min-w-0 overflow-hidden p-0" size="sm">
        <h2 className="m-0 border-b border-border px-4 py-3 text-base font-semibold">
          {t("archivedDetails.runHistory")}
        </h2>
        {history.length ? (
          <RunsTable
            rows={history}
            projectRef={projectId}
            emptyActionHref={projectSchedulesPath(projectId)}
          />
        ) : (
          <p className="m-0 p-6 text-sm text-fg-muted">{t("archivedDetails.noRuns")}</p>
        )}
        {nextCursor ? (
          <div className="border-t border-border p-4">
            <Button
              size="sm"
              variant="secondary"
              href={`${projectSchedulesPath(projectId, schedule.publicId)}?cursor=${encodeURIComponent(nextCursor)}`}
            >
              {t("archivedDetails.olderRuns")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
