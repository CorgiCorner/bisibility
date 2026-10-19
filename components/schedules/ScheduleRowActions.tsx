import { Button } from "@/components/ui/Button";
import { RestoreScheduleButton, ScheduleArchiveMenu } from "./ScheduleLifecycleActions";
import type { SchedulesTableRow } from "./schedules-table-columns";
import type { SchedulesT } from "./schedules-table-labels";

export type ScheduleRowActionsOptions = {
  aiCanWrite: boolean;
  canManage?: boolean;
  canUpdate: boolean;
  onArchive?: (row: SchedulesTableRow) => void;
  onOpenAi: (row: SchedulesTableRow) => void;
  onTogglePause: (row: SchedulesTableRow) => void;
  pendingScheduleId: string | null;
  projectId?: string;
  t: SchedulesT;
};

/** Per-kind row actions. AI rows never reach rank endpoints, rank restore or keyword moves. */
export function ScheduleRowActions({
  row,
  aiCanWrite,
  canManage,
  canUpdate,
  onArchive,
  onOpenAi,
  onTogglePause,
  pendingScheduleId,
  projectId,
  t,
}: Readonly<ScheduleRowActionsOptions & { row: SchedulesTableRow }>) {
  const pauseLabel = row.enabled ? t("list.pause") : t("list.resume");
  if (row.scheduleKind === "ai") {
    if (row.archivedAt)
      return (
        <span className="text-[11px] text-fg-muted" title={t("ai.archivedReadOnlyHint")}>
          {t("ai.readOnly")}
        </span>
      );
    if (!aiCanWrite) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          aria-label={`${pauseLabel} ${row.name}`}
          disabled={pendingScheduleId === row.id}
          onClick={() => (row.enabled ? onTogglePause(row) : onOpenAi(row))}
          size="xs"
          title={row.enabled ? t("list.pauseTitle") : t("ai.resumeTitle")}
          variant="secondary"
        >
          {pauseLabel}
        </Button>
        {onArchive ? (
          <ScheduleArchiveMenu name={row.name} onArchive={() => onArchive(row)} />
        ) : null}
      </div>
    );
  }
  if (row.archivedAt)
    return canManage && projectId ? (
      <RestoreScheduleButton projectId={projectId} scheduleId={row.publicId} />
    ) : null;
  return (
    <div className="flex items-center justify-end gap-1">
      {canUpdate ? (
        <Button
          aria-label={`${pauseLabel} ${row.name}`}
          disabled={pendingScheduleId === row.id}
          onClick={() => onTogglePause(row)}
          size="xs"
          title={row.enabled ? t("list.pauseTitle") : t("list.resumeTitle")}
          variant="secondary"
        >
          {pauseLabel}
        </Button>
      ) : null}
      {canManage && onArchive ? (
        <ScheduleArchiveMenu name={row.name} onArchive={() => onArchive(row)} />
      ) : null}
    </div>
  );
}
