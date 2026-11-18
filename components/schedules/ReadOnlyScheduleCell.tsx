import { persistedScheduleCalendar } from "@/lib/schedules/cadence-label";
import type { DataSyncSchedule, LocalMonitorSchedule } from "@/lib/schedules/types";
import { cadenceLabel, type SchedulesT } from "./schedules-table-labels";

export type ReadOnlySchedule = DataSyncSchedule | LocalMonitorSchedule;

export function ReadOnlyScheduleCell({
  schedule,
  column,
  locale,
  t,
}: Readonly<{
  schedule: ReadOnlySchedule;
  column: string;
  locale: string;
  t: SchedulesT;
}>) {
  if (column === "schedule")
    return (
      <div className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-fg">
          {schedule.kind === "data_sync" ? t(`unified.syncs.${schedule.sync_kind}`) : schedule.name}
        </span>
        <span className="mt-0.5 block text-[11px] text-fg-muted">
          {t(`unified.states.${schedule.state}`)}
        </span>
        {schedule.state_reason ? (
          <span className="mt-0.5 block text-[11px] text-fg-muted">
            {t(`unified.reasons.${schedule.state_reason}`)}
          </span>
        ) : null}
      </div>
    );
  if (column === "cadence") {
    const calendar = persistedScheduleCalendar(
      schedule.cadence.frequency,
      schedule.cadence.cron_expression,
    );
    return (
      <div>
        <span className="block text-fg">
          {cadenceLabel(
            {
              frequency: schedule.cadence.frequency,
              cronExpression: schedule.cadence.cron_expression,
              timeOfDay: schedule.cadence.time_of_day,
              weekday: calendar.weekday,
              dayOfMonth: calendar.dayOfMonth ? Number.parseInt(calendar.dayOfMonth, 10) : null,
            },
            t,
          )}
        </span>
        <span className="mt-0.5 block text-[10.5px] text-fg-muted">
          {schedule.cadence.timezone}
        </span>
      </div>
    );
  }
  if (column === "members")
    return schedule.kind === "data_sync" ? (
      <span>{schedule.target.domain ?? "-"}</span>
    ) : (
      <span>{t("unified.monitorCount", { count: schedule.target_summary.monitors ?? 0 })}</span>
    );
  if (column === "actions") return null;
  if (column === "next" && schedule.kind === "data_sync")
    return <ScheduleLastRun schedule={schedule} locale={locale} t={t} />;
  if (column === "next")
    return (
      <span className="text-[11px]">
        {schedule.next_run_at
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: schedule.cadence.timezone,
            }).format(new Date(schedule.next_run_at))
          : "-"}
      </span>
    );
  return <span className="text-[11px] text-fg-muted">-</span>;
}

export function ScheduleLastRun({
  schedule,
  locale,
  t,
}: Readonly<{ schedule: ReadOnlySchedule; locale: string; t: SchedulesT }>) {
  return (
    <div className="text-[11px] text-fg-muted">
      <span className="block">
        {schedule.last_run_at
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: schedule.cadence.timezone,
            }).format(new Date(schedule.last_run_at))
          : t("unified.noRecordedRun")}
      </span>
      <span className="mt-0.5 block">{t("unified.lastEvidenceHint")}</span>
    </div>
  );
}
