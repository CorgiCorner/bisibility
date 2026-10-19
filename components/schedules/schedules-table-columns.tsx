import type { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import Link from "next/link";
import type { AiScheduleListRow } from "./ai-schedule-rows";
import { ScheduleRowActions, type ScheduleRowActionsOptions } from "./ScheduleRowActions";
import type { ScheduleListRow } from "./SchedulesList";
import {
  cadenceLabel,
  cadenceMeta,
  memberLabel,
  nextLabel,
  perRunLabel,
  type SchedulesT,
  scheduleStateMeta,
  stateFor,
} from "./schedules-table-labels";

type TableRowFields = { id: string; nextRunLabel: string | null };
/** `scheduleKind` is the discriminator; DataTable reserves `kind` for row grouping. */
export type RankSchedulesTableRow = ScheduleListRow & TableRowFields & { scheduleKind: "rank" };
export type AiSchedulesTableRow = AiScheduleListRow & TableRowFields & { scheduleKind: "ai" };
export type SchedulesTableRow = RankSchedulesTableRow | AiSchedulesTableRow;

type SchedulesTableColumnsOptions = Omit<ScheduleRowActionsOptions, "aiCanWrite" | "onOpenAi"> & {
  t: SchedulesT;
  aiCanWrite?: boolean;
  /** Returns the drawer href for an editable AI row, or null when the row is read-only. */
  aiHref?: (row: AiSchedulesTableRow) => string | null;
  onOpenAi?: (row: SchedulesTableRow) => void;
  rankHref: (row: RankSchedulesTableRow) => string;
  showKind?: boolean;
  usage: ReturnType<typeof useNativeUsageFormat>;
  locale: string;
};

const linkClassName =
  "text-[12.5px] font-semibold text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid";

function ScheduleNameLink({ href, name }: Readonly<{ href: string | null; name: string }>) {
  if (!href) return <span className="text-[12.5px] font-semibold text-fg">{name}</span>;
  return (
    <Link className={linkClassName} href={href} onClick={(event) => event.stopPropagation()}>
      {name}
    </Link>
  );
}

export function schedulesTableColumns({
  usage,
  aiCanWrite = false,
  aiHref,
  canUpdate,
  canManage,
  onArchive,
  onOpenAi = () => undefined,
  projectId,
  onTogglePause,
  pendingScheduleId,
  rankHref,
  showKind = false,
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
              <ScheduleNameLink
                href={
                  schedule.scheduleKind === "rank"
                    ? rankHref(schedule)
                    : (aiHref?.(schedule) ?? null)
                }
                name={schedule.name}
              />
              {showKind ? (
                <PillBadge size="xs">
                  {schedule.scheduleKind === "ai" ? t("ai.kindAi") : t("ai.kindRank")}
                </PillBadge>
              ) : null}
              {schedule.archivedAt ? <PillBadge size="xs">{t("archived")}</PillBadge> : null}
              {schedule.scheduleKind === "rank" && schedule.isDefault ? (
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
            {schedule.scheduleKind === "rank" &&
            schedule.memberMarketCount !== undefined &&
            schedule.memberDeviceCount !== undefined ? (
              <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                {t("list.memberMeta", {
                  devices: schedule.memberDeviceCount,
                  markets: schedule.memberMarketCount,
                })}
              </span>
            ) : null}
            {schedule.scheduleKind === "rank" && schedule.sharedTag ? (
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
      cell: ({ row }) => {
        const schedule = row.original;
        // AI schedules carry no stored per-run estimate; preview prices them on demand.
        if (schedule.scheduleKind === "ai")
          return (
            <span className="block font-sans text-[12px] font-semibold tabular-nums text-fg">
              -
            </span>
          );
        return (
          <div>
            <span className="block font-sans text-[12px] font-semibold tabular-nums text-fg">
              {schedule.archivedAt
                ? "-"
                : schedule.nativeEstimate
                  ? `~${usage.format(schedule.nativeEstimate)}`
                  : perRunLabel(schedule.perRunCents, locale)}
            </span>
            {!schedule.archivedAt ? (
              <span className="mt-0.5 block text-[10px] text-fg-muted">{t("list.perRun")}</span>
            ) : null}
          </div>
        );
      },
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
            {nextLabel(schedule, t)}
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
      cell: ({ row }) => (
        <ScheduleRowActions
          row={row.original}
          aiCanWrite={aiCanWrite}
          canManage={canManage}
          canUpdate={canUpdate}
          onArchive={onArchive}
          onOpenAi={onOpenAi}
          onTogglePause={onTogglePause}
          pendingScheduleId={pendingScheduleId}
          projectId={projectId}
          t={t}
        />
      ),
      enableSorting: false,
      header: t("actions"),
      id: "actions",
      meta: { align: "end", lockResize: true, title: t("actions") },
      minSize: 132,
      size: 140,
    },
  ];
}
