"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { useToast } from "@/components/ui/toast-context";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import { type SchedulesTableRow, schedulesTableColumns } from "./schedules-table-columns";

type ScheduleFrequency = "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
export type ScheduleListRow = {
  archivedAt?: string | null;
  assignedKeywordCount?: number;
  blocked?: boolean;
  cadenceLabel?: string;
  cadenceMeta?: string;
  cronExpression?: string | null;
  dayOfMonth?: string | null;
  enabled: boolean;
  frequency: ScheduleFrequency;
  isDefault: boolean;
  keywordCount: number;
  memberMeta?: string;
  name: string;
  nextRunLabel?: string | null;
  perRunCents?: number | null;
  publicId: string;
  tagScope?: string | null;
  targetCount?: number | null;
  timeOfDay?: string | null;
  timezone?: string | null;
  weekday?: string | null;
};

type SchedulesListProps = {
  canUpdate: boolean;
  canManage?: boolean;
  status?: "current" | "archived";
  projectId: string;
  projectRef: string;
  schedules: readonly ScheduleListRow[];
};

export function SchedulesList({
  canUpdate,
  canManage = false,
  status = "current",
  projectId,
  projectRef,
  schedules,
}: Readonly<SchedulesListProps>) {
  const router = useRouter();
  const [archiveTarget, setArchiveTarget] = useState<ScheduleListRow | null>(null);
  const { showToast } = useToast();
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const rows = useMemo<readonly SchedulesTableRow[]>(
    () => schedules.map((schedule) => ({ ...schedule, id: schedule.publicId })),
    [schedules],
  );

  const togglePause = useCallback(
    async (row: SchedulesTableRow) => {
      const enabled = row.enabled;
      setPendingScheduleId(row.publicId);
      try {
        const response = await fetch(`/api/check-schedules/${row.publicId}`, {
          body: JSON.stringify({ enabled: !enabled, projectId }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        if (!response.ok) {
          showToast("Could not update the schedule. Please try again.", { severity: "error" });
          return;
        }
        router.refresh();
      } catch {
        showToast("Could not update the schedule. Please try again.", { severity: "error" });
      } finally {
        setPendingScheduleId(null);
      }
    },
    [projectId, router, showToast],
  );

  const columns = useMemo(
    () =>
      schedulesTableColumns({
        canUpdate,
        canManage,
        projectId,
        onArchive: setArchiveTarget,
        onTogglePause: togglePause,
        pendingScheduleId,
        projectRef,
      }),
    [canUpdate, canManage, projectId, pendingScheduleId, projectRef, togglePause],
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="sm">
      <section aria-labelledby="schedules-list-title">
        <TableCardHeader
          titleId="schedules-list-title"
          title={`${schedules.length} ${schedules.length === 1 ? "schedule" : "schedules"}`}
          actions={
            <>
              <MenuSelect
                ariaLabel="Schedule status"
                leadingLabel="Status:"
                value={status}
                options={[
                  { label: "Current", value: "current" },
                  { label: "Archived", value: "archived" },
                ]}
                onChange={(value) =>
                  router.push(
                    `${projectSchedulesPath(projectRef)}${value === "archived" ? "?status=archived" : ""}`,
                  )
                }
              />
              <Button href={projectSchedulesPath(projectRef, "new")} size="sm" variant="secondary">
                New schedule
              </Button>
            </>
          }
        />
        {schedules.length === 0 ? (
          <div className="p-8">
            <EmptyState
              compact
              icon={<CalendarBlank aria-hidden size={22} weight="regular" />}
              title={status === "archived" ? "No archived schedules" : "No schedules yet"}
              description={
                status === "archived"
                  ? "Archived schedules will appear here. Their past runs and results are preserved."
                  : "Keywords are checked only when you launch a run. Create a schedule to check them on a cadence."
              }
            />
          </div>
        ) : (
          <div className="min-w-0 [&>[role=table]]:border-0">
            <DataTable
              ariaLabel="Schedules"
              columns={columns}
              id="schedules-list"
              layout="auto"
              onRowClick={(row) => router.push(projectSchedulesPath(projectRef, row.publicId))}
              onSortingChange={() => undefined}
              rows={rows}
              sorting={null}
            />
          </div>
        )}
        {archiveTarget ? (
          <ArchiveScheduleModal
            key={archiveTarget.publicId}
            projectId={projectId}
            schedule={archiveTarget}
            schedules={schedules}
            onClose={() => setArchiveTarget(null)}
          />
        ) : null}
      </section>
    </Card>
  );
}
