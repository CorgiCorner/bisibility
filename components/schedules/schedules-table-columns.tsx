import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { PillBadge } from "@/components/ui/Pill";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { scheduleCadenceLabel } from "@/lib/schedules/cadence-label";
import Link from "next/link";
import { RestoreScheduleButton, ScheduleArchiveMenu } from "./ScheduleLifecycleActions";
import type { ScheduleListRow } from "./SchedulesList";

export type SchedulesTableRow = ScheduleListRow & { id: string };

type SchedulesTableColumnsOptions = {
  canUpdate: boolean;
  canManage?: boolean;
  onArchive?: (row: SchedulesTableRow) => void;
  projectId?: string;
  onTogglePause: (row: SchedulesTableRow) => void;
  pendingScheduleId: string | null;
  projectRef: string;
};

type ScheduleState = "blocked" | "paused";

const scheduleStateMeta = {
  blocked: { label: "Next run blocked - monthly limit", tone: "text-fg-muted" },
  paused: { label: "Paused", tone: "text-fg-muted" },
} satisfies Record<ScheduleState, { label: string; tone: string }>;

function stateFor(row: SchedulesTableRow): ScheduleState | null {
  if (row.archivedAt) return null;
  if (!row.enabled || row.frequency === "paused") return "paused";
  return row.blocked ? "blocked" : null;
}

function memberLabel(row: SchedulesTableRow) {
  if (row.archivedAt) return "No assigned keywords";
  if (row.targetCount === null || row.targetCount === undefined) {
    return `${row.keywordCount.toLocaleString("en-US")} keywords`;
  }
  const scope = row.memberMeta ? ` in ${row.memberMeta}` : "";
  return `${row.keywordCount.toLocaleString("en-US")} keywords${scope} = ${row.targetCount.toLocaleString("en-US")} checks a run`;
}

function perRunLabel(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "-";
  return `~${new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100)}`;
}

function pauseTitle(enabled: boolean) {
  return enabled
    ? "Stops all future runs of this schedule. To skip only the next one, use Skip once with the Upcoming filter in Runs."
    : "Resumes the cadence. The next run is scheduled from now, not backfilled.";
}

export function schedulesTableColumns({
  canUpdate,
  canManage,
  onArchive,
  projectId,
  onTogglePause,
  pendingScheduleId,
  projectRef,
}: Readonly<SchedulesTableColumnsOptions>): readonly DataTableColumn<SchedulesTableRow>[] {
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
              {schedule.archivedAt ? <PillBadge size="xs">Archived</PillBadge> : null}
              {schedule.isDefault ? (
                <PillBadge
                  size="xs"
                  title="New keywords join this schedule unless you pick another one."
                >
                  Default
                </PillBadge>
              ) : null}
            </div>
            {state ? (
              <span className={`mt-0.5 block text-[11px] ${scheduleStateMeta[state].tone}`}>
                {scheduleStateMeta[state].label}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: "Schedule",
      id: "schedule",
      meta: { flex: 2, title: "Schedule" },
      minSize: 184,
      size: 240,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">
              {schedule.cadenceLabel ?? scheduleCadenceLabel(schedule)}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
              {schedule.cadenceMeta ?? schedule.timezone ?? "Uses project time zone"}
            </span>
          </div>
        );
      },
      enableSorting: false,
      header: "Cadence",
      id: "cadence",
      meta: { flex: 1, title: "Cadence" },
      minSize: 160,
      size: 192,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">{memberLabel(schedule)}</span>
            {schedule.tagScope ? (
              <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-fg-muted">
                {schedule.tagScope}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: "Members",
      id: "members",
      meta: { flex: 2, title: "Members" },
      minSize: 192,
      size: 240,
    },
    {
      accessorKey: "perRunCents",
      cell: ({ row }) => (
        <div>
          <span className="block font-sans text-[12px] font-semibold tabular-nums text-fg">
            {row.original.archivedAt ? "-" : perRunLabel(row.original.perRunCents)}
          </span>
          {!row.original.archivedAt ? (
            <span className="mt-0.5 block text-[10px] text-fg-muted">per run</span>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: "Per run",
      id: "per-run",
      meta: { title: "Per run" },
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
      header: "Next",
      id: "next",
      meta: { title: "Next" },
      minSize: 120,
      size: 140,
    },
    {
      cell: ({ row }) => {
        const schedule = row.original;
        const pauseLabel = schedule.enabled ? "Pause" : "Resume";
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
                title={pauseTitle(schedule.enabled)}
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
      header: "Actions",
      id: "actions",
      meta: { align: "end", lockResize: true, title: "Actions" },
      minSize: 132,
      size: 140,
    },
  ];
}
