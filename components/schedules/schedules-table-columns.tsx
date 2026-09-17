import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import Link from "next/link";
import type { useTranslations } from "next-intl";
import { RestoreScheduleButton, ScheduleArchiveMenu } from "./ScheduleLifecycleActions";
import type { ScheduleListRow } from "./SchedulesList";

export type SchedulesTableRow = ScheduleListRow & { id: string; nextRunLabel: string | null };

type SchedulesTableColumnsOptions = {
  canUpdate: boolean;
  canManage?: boolean;
  onArchive?: (row: SchedulesTableRow) => void;
  projectId?: string;
  onTogglePause: (row: SchedulesTableRow) => void;
  pendingScheduleId: string | null;
  projectRef: string;
  locale: string;
  t: ReturnType<typeof useTranslations<"projectRuns.schedules">>;
};

type ScheduleState = "blocked" | "paused";

function scheduleStateMeta(t: SchedulesTableColumnsOptions["t"]) {
  return {
    blocked: { label: t("list.blocked"), tone: "text-fg-muted" },
    paused: { label: t("list.paused"), tone: "text-fg-muted" },
  } satisfies Record<ScheduleState, { label: string; tone: string }>;
}

function stateFor(row: SchedulesTableRow): ScheduleState | null {
  if (row.archivedAt) return null;
  if (!row.enabled || row.frequency === "paused") return "paused";
  return row.blocked ? "blocked" : null;
}

function memberLabel(row: SchedulesTableRow, t: SchedulesTableColumnsOptions["t"]) {
  if (row.archivedAt) return t("list.noAssignedKeywords");
  if (row.targetCount === null || row.targetCount === undefined) {
    return t("checks", { count: row.keywordCount });
  }
  return t("list.members", {
    keywords: row.keywordCount,
    targets: row.targetCount,
  });
}

function perRunLabel(cents: number | null | undefined, locale: string) {
  if (cents === null || cents === undefined) return "-";
  return `~${new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(cents / 100)}`;
}

function pauseTitle(enabled: boolean, t: SchedulesTableColumnsOptions["t"]) {
  return enabled ? t("list.pauseTitle") : t("list.resumeTitle");
}

const weekdayKeys = {
  Friday: "Friday",
  Monday: "Monday",
  Saturday: "Saturday",
  Sunday: "Sunday",
  Thursday: "Thursday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
} as const;

function cadenceLabel(row: SchedulesTableRow, t: SchedulesTableColumnsOptions["t"]) {
  const time = row.timeOfDay ?? "-";
  if (row.timeOfDay === null && ["daily", "weekly", "monthly"].includes(row.frequency)) {
    const interval =
      row.frequency === "daily"
        ? t("intervalDay")
        : row.frequency === "weekly"
          ? t("intervalWeek")
          : t("intervalMonth");
    return t("cadenceLabels.every", { interval });
  }
  if (row.frequency === "daily") return t("cadenceLabels.daily", { time });
  if (row.frequency === "weekly") {
    const day =
      row.weekday && row.weekday in weekdayKeys
        ? t(`weekdays.${weekdayKeys[row.weekday as keyof typeof weekdayKeys]}`)
        : t("frequencyWeekly");
    return t("cadenceLabels.weekly", { day, time });
  }
  if (row.frequency === "monthly") {
    return t("cadenceLabels.monthly", {
      day: row.dayOfMonth ? t("cadenceLabels.dayOfMonth", { day: row.dayOfMonth }) : "-",
      time,
    });
  }
  if (row.frequency === "custom_cron")
    return t("cadenceLabels.custom", { expression: row.cronExpression ?? "-" });
  return row.frequency === "manual" ? t("cadenceLabels.manual") : t("cadenceLabels.paused");
}

function cadenceMeta(row: SchedulesTableRow, t: SchedulesTableColumnsOptions["t"]) {
  const timezone = row.timezone ?? t("useProjectTimeZone");
  return !row.timeOfDay
    ? timezone
    : t("cadenceMeta", { minutes: row.jitterMinutes ?? 0, time: row.timeOfDay, timezone });
}

export function schedulesTableColumns({
  canUpdate,
  canManage,
  onArchive,
  projectId,
  onTogglePause,
  pendingScheduleId,
  projectRef,
  locale,
  t,
}: Readonly<SchedulesTableColumnsOptions>): readonly DataTableColumn<SchedulesTableRow>[] {
  const states = scheduleStateMeta(t);
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => {
        const schedule = row.original;
        const state = stateFor(schedule);
        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                className="text-[12.5px] font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                href={projectSchedulesPath(projectRef, schedule.publicId)}
                onClick={(event) => event.stopPropagation()}
              >
                {schedule.name}
              </Link>
              {schedule.archivedAt ? <PillBadge size="xs">{t("archived")}</PillBadge> : null}
              {schedule.isDefault ? (
                <PillBadge size="xs" title={t("list.defaultHint")}>
                  {t("default")}
                </PillBadge>
              ) : null}
            </div>
            {state ? (
              <span className={`mt-0.5 block text-[11px] ${states[state].tone}`}>
                {states[state].label}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("schedule"),
      id: "schedule",
      meta: { flex: 2, title: t("schedule") },
      minSize: 184,
      size: 240,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">{cadenceLabel(schedule, t)}</span>
            <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
              {cadenceMeta(schedule, t)}
            </span>
          </div>
        );
      },
      enableSorting: false,
      header: t("cadence"),
      id: "cadence",
      meta: { flex: 1, title: t("cadence") },
      minSize: 160,
      size: 192,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">{memberLabel(schedule, t)}</span>
            {schedule.memberMarketCount !== undefined &&
            schedule.memberDeviceCount !== undefined ? (
              <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                {t("list.memberMeta", {
                  devices: schedule.memberDeviceCount,
                  markets: schedule.memberMarketCount,
                })}
              </span>
            ) : null}
            {schedule.sharedTag ? (
              <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                {t("list.tagScope", { tag: schedule.sharedTag })}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("members"),
      id: "members",
      meta: { flex: 2, title: t("members") },
      minSize: 192,
      size: 240,
    },
    {
      accessorKey: "perRunCents",
      cell: ({ row }) => (
        <div>
          <span className="block font-sans text-[12px] font-semibold tabular-nums text-fg">
            {row.original.archivedAt ? "-" : perRunLabel(row.original.perRunCents, locale)}
          </span>
          {!row.original.archivedAt ? (
            <span className="mt-0.5 block text-[10px] text-fg-muted">{t("list.perRun")}</span>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: t("perRun"),
      id: "per-run",
      meta: { title: t("perRun") },
      minSize: 104,
      size: 116,
    },
    {
      accessorKey: "nextRunLabel",
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <span className={`text-[11px] ${stateFor(schedule) ? "text-fg-muted" : "text-fg"}`}>
            {!schedule.archivedAt && schedule.enabled ? (schedule.nextRunLabel ?? "-") : "-"}
          </span>
        );
      },
      enableSorting: false,
      header: t("next"),
      id: "next",
      meta: { title: t("next") },
      minSize: 120,
      size: 140,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        const pauseLabel = schedule.enabled ? t("list.pause") : t("list.resume");
        if (schedule.archivedAt)
          return canManage && projectId ? (
            <RestoreScheduleButton projectId={projectId} scheduleId={schedule.publicId} />
          ) : null;
        return (
          <div className="flex items-center justify-end gap-1">
            {canUpdate ? (
              <Button
                aria-label={`${pauseLabel} ${schedule.name}`}
                disabled={pendingScheduleId === schedule.publicId}
                onClick={() => onTogglePause(schedule)}
                size="xs"
                title={pauseTitle(schedule.enabled, t)}
                variant="secondary"
              >
                {pauseLabel}
              </Button>
            ) : null}
            {canManage && onArchive ? (
              <ScheduleArchiveMenu name={schedule.name} onArchive={() => onArchive(schedule)} />
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("actions"),
      id: "actions",
      meta: { align: "end", lockResize: true, title: t("actions") },
      minSize: 132,
      size: 140,
    },
  ];
}
