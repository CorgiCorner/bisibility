"use client";
import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { useToast } from "@/components/ui/toast-context";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ScheduleListRow } from "@/lib/schedules/rank-list-row";
import type { DataSyncKind } from "@/lib/schedules/types";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { AiArchiveScheduleModal } from "./AiArchiveScheduleModal";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import { type AiSchedulesController, aiScheduleHref } from "./ai-schedule-rows";
import type { SaveDataSyncState } from "./DataSyncScheduleSwitch";
import type { ReadOnlySchedule } from "./ReadOnlyScheduleCell";
import { SchedulesListActions } from "./SchedulesListActions";
import { nextRunLabel } from "./schedule-next-run";
import { requestScheduleState } from "./schedule-state-request";
import {
  type AiSchedulesTableRow,
  type SchedulesTableRow,
  schedulesTableColumns,
} from "./schedules-table-columns";
import { UnifiedScheduleTable } from "./UnifiedScheduleTable";
import { ScheduleReviewCancelled, useScheduleSpendReview } from "./useScheduleSpendReview";

export type { ScheduleListRow } from "@/lib/schedules/rank-list-row";

type SchedulesListProps = {
  /** AI schedules and their per-kind write rule; omitted when AI tracking is unavailable. */
  ai?: AiSchedulesController;
  canUpdate: boolean;
  /** Data syncs whose switch this viewer may use; empty keeps every switch disabled. */
  canUpdateSyncs?: readonly DataSyncKind[];
  canManage?: boolean;
  status?: "current" | "archived";
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
  saveDataSyncState?: SaveDataSyncState;
  readOnlySchedules?: readonly ReadOnlySchedule[];
};

export function SchedulesList({
  ai,
  canUpdate,
  canUpdateSyncs = [],
  canManage = false,
  status = "current",
  projectId,
  projectRef,
  schedules,
  readOnlySchedules,
  saveDataSyncState,
}: Readonly<SchedulesListProps>) {
  const t = useTranslations("projectRuns.schedules");
  const usage = useNativeUsageFormat();
  const locale = useLocale();
  const router = useRouter();
  const {
    run: reviewSpend,
    dialog: reviewDialog,
    isActive: reviewActive,
  } = useScheduleSpendReview(projectId);
  const [archiveTarget, setArchiveTarget] = useState<SchedulesTableRow | null>(null);
  const { showToast } = useToast();
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const rows = useMemo<readonly SchedulesTableRow[]>(
    () => [
      ...schedules.map((schedule) => ({
        ...schedule,
        scheduleKind: "rank" as const,
        id: `rank:${schedule.publicId}`,
        nextRunLabel: nextRunLabel(
          schedule.nextRunAt,
          schedule.timezone,
          locale,
          t,
          schedule.timeOfDay === null && ["daily", "weekly", "monthly"].includes(schedule.frequency)
            ? schedule.frequency === "daily"
              ? "day"
              : "interval"
            : false,
        ),
      })),
      ...(ai?.rows ?? []).map((schedule) => ({
        ...schedule,
        scheduleKind: "ai" as const,
        id: `ai:${schedule.publicId}`,
        nextRunLabel: nextRunLabel(schedule.nextRunAt, schedule.timezone, locale, t),
      })),
    ],
    [ai?.rows, locale, schedules, t],
  );
  const local = readOnlySchedules?.filter((row) => row.group === "checks") ?? [];
  const syncs = readOnlySchedules?.filter((row) => row.group === "data_sync") ?? [];
  const checkCount = rows.length + local.length;
  const aiCanWrite = ai?.canWrite ?? false;
  const aiHref = useCallback(
    (row: AiSchedulesTableRow) =>
      aiCanWrite && !row.archivedAt ? aiScheduleHref(projectRef, row.publicId) : null,
    [aiCanWrite, projectRef],
  );
  const openRow = useCallback(
    (row: SchedulesTableRow) => {
      if (row.scheduleKind === "rank") {
        router.push(projectSchedulesPath(projectRef, row.publicId));
        return;
      }
      const href = aiHref(row);
      if (href) router.push(href);
    },
    [aiHref, projectRef, router],
  );

  const togglePause = useCallback(
    async (row: SchedulesTableRow) => {
      if (reviewActive()) return;
      if (row.scheduleKind === "ai") {
        // Only pausing is direct. Resuming re-enters review, preview and consent in the drawer.
        if (!ai || !row.enabled) return;
        setPendingScheduleId(row.id);
        try {
          await ai.onPause(row);
        } catch {
          showToast(t("list.toggleFailed"), { severity: "error" });
        } finally {
          setPendingScheduleId(null);
        }
        return;
      }
      const enabled = row.enabled;
      setPendingScheduleId(row.id);
      try {
        await reviewSpend(
          {
            op: "state",
            id: row.publicId,
            state: enabled ? "paused" : "active",
            command: { kind: "rank", projectPublicId: projectId },
          },
          (review) => requestScheduleState(projectId, row.publicId, !enabled, review),
        );
        router.refresh();
      } catch (error) {
        if (error instanceof ScheduleReviewCancelled) return;
        showToast(t("list.toggleFailed"), { severity: "error" });
      } finally {
        setPendingScheduleId(null);
      }
    },
    [ai, projectId, router, showToast, t, reviewSpend, reviewActive],
  );

  const columns = useMemo(
    () =>
      schedulesTableColumns({
        usage,
        aiCanWrite,
        aiHref,
        canUpdate,
        canManage,
        projectId,
        onArchive: setArchiveTarget,
        onOpenAi: openRow,
        onTogglePause: togglePause,
        pendingScheduleId,
        rankHref: (row) => projectSchedulesPath(projectRef, row.publicId),
        showKind: Boolean(ai),
        locale,
        t,
      }),
    [
      ai,
      aiCanWrite,
      aiHref,
      canUpdate,
      canManage,
      locale,
      openRow,
      projectId,
      pendingScheduleId,
      projectRef,
      t,
      togglePause,
      usage,
    ],
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="sm">
      {reviewDialog}
      <section aria-labelledby="schedules-list-title">
        <TableCardHeader
          className={checkCount === 0 ? "border-b border-border" : undefined}
          titleId="schedules-list-title"
          title={
            readOnlySchedules ? t("unified.checks") : t("scheduleCount", { count: rows.length })
          }
          actions={
            <SchedulesListActions
              ai={ai}
              canUpdate={canUpdate}
              projectRef={projectRef}
              status={status}
            />
          }
        />
        {checkCount === 0 ? (
          <div className="p-8">
            <EmptyState
              compact
              icon={<CalendarBlank aria-hidden size={22} weight="regular" />}
              title={status === "archived" ? t("empty.archivedTitle") : t("empty.currentTitle")}
              description={
                status === "archived"
                  ? t("empty.archivedDescription")
                  : t("empty.currentDescription")
              }
            />
          </div>
        ) : (
          <div className="min-w-0">
            {readOnlySchedules ? (
              <UnifiedScheduleTable
                rows={rows}
                schedules={local}
                columns={columns}
                group="checks"
                onRowClick={openRow}
              />
            ) : (
              <DataTable
                bordered={false}
                ariaLabel={t("schedules")}
                columns={columns}
                id="schedules-list"
                layout="auto"
                onRowClick={openRow}
                onSortingChange={() => undefined}
                rows={rows}
                sorting={null}
              />
            )}
          </div>
        )}
        {syncs.length > 0 ? (
          <section aria-labelledby="schedules-sync-title">
            <TableCardHeader
              titleId="schedules-sync-title"
              title={t("unified.data_sync")}
              actions={null}
            />
            <UnifiedScheduleTable
              rows={[]}
              schedules={syncs}
              columns={columns}
              group="data_sync"
              syncAccess={{ canUpdateSyncs, projectId, saveState: saveDataSyncState }}
            />
          </section>
        ) : null}
        {archiveTarget?.scheduleKind === "rank" ? (
          <ArchiveScheduleModal
            key={archiveTarget.id}
            projectId={projectId}
            schedule={archiveTarget}
            schedules={schedules}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
        {archiveTarget?.scheduleKind === "ai" && ai ? (
          <AiArchiveScheduleModal
            key={archiveTarget.id}
            schedule={archiveTarget}
            onArchive={ai.onArchive}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
      </section>
    </Card>
  );
}
