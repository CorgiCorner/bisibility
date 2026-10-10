"use client";
import { Button } from "@/components/ui/Button";
import { PillBadge } from "@/components/ui/Pill";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";
export function TrackingSchedules({
  schedules,
  canWrite,
  onCreate,
  onEdit,
  onArchive,
}: Readonly<{
  schedules: TrackingWorkspaceData["schedules"];
  canWrite: boolean;
  onCreate: () => void;
  onEdit: (schedule: TrackingWorkspaceData["schedules"][number]) => void;
  onArchive: (id: string) => void;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <section className="rounded-card border border-border bg-bg-elev p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("schedules")}</h2>
        <Button size="sm" variant="secondary" disabled={!canWrite} onClick={onCreate}>
          {t("addSchedule")}
        </Button>
      </div>
      <p className="mt-2 text-sm leading-6 text-fg-muted">
        {t("schedulesUseAnExactConfigurationAndAnExplicit")}
      </p>
      {schedules.length ? (
        schedules.map((schedule) => (
          <div
            className="mt-4 flex flex-wrap justify-between gap-3 border-t border-border pt-4"
            key={schedule.id}
          >
            <div>
              <p className="text-sm font-medium">{schedule.name}</p>
              <p className="mt-1 font-mono text-xs text-fg-muted">
                {schedule.cron} · {schedule.timezone}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {t("nextRun")}:{" "}
                {schedule.enabled ? (schedule.nextRunAt ?? t("nextRunPending")) : t("disabled")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PillBadge>{schedule.enabled ? t("enabled") : t("disabled")}</PillBadge>
              <Button
                size="xs"
                variant="ghost"
                disabled={!canWrite}
                onClick={() => onEdit(schedule)}
              >
                {t("edit")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={!canWrite}
                onClick={() => onArchive(schedule.id)}
              >
                {t("archive")}
              </Button>
            </div>
          </div>
        ))
      ) : (
        <p className="mt-4 rounded-control bg-bg-sunken p-4 text-sm text-fg-muted">
          {t("noSchedulesConfiguredRunAManualPreviewFirst")}
        </p>
      )}
    </section>
  );
}
