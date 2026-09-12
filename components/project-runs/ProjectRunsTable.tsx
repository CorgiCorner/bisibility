"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { runStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { formatDateTime } from "@/lib/dates/format";
import type { ProjectRun } from "@/lib/runs/project-run";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useMemo, useState, useTransition } from "react";
import { RunActions } from "./ProjectRunActions";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";

type ProjectRunAction = (input: { projectRef: string; runId: string }) => Promise<void>;

type ProjectRunsTableRow = { id: string; run: ProjectRunWithOperationSnapshot; title: string };

type ProjectRunsTableProps = {
  canMutate: boolean;
  onDelete?: ProjectRunAction;
  emptyState: ReactNode;
  onRunNow: ProjectRunAction;
  onSkip: ProjectRunAction;
  projectRef: string;
  rows: readonly ProjectRunWithOperationSnapshot[];
};

const gscStatuses = {
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "positive" },
  failed: { label: "Failed", tone: "critical" },
  paused: { label: "Paused", tone: "attention" },
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  status_unavailable: { label: "Status unavailable", tone: "neutral" },
  waiting_for_first_data: { label: "Waiting for first data", tone: "info" },
  waiting_to_resume: { label: "Waiting to resume", tone: "attention" },
} as const;

function statusFor(run: ProjectRunWithOperationSnapshot) {
  if (run.kind === "rank_check") {
    return runStatusChipPresentation(run.details.status, run.details.outcome);
  }
  const fallback =
    gscStatuses[run.lifecycle as keyof typeof gscStatuses] ?? gscStatuses.status_unavailable;
  if (!run.snapshotPresentationTitle || !run.snapshotPresentationTone) return fallback;
  return { label: run.snapshotPresentationTitle, tone: run.snapshotPresentationTone };
}

function progressFor(run: ProjectRun) {
  const { completed, total } = run.progress;
  if (completed === null || total === null) return "Not available";
  return `${completed.toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`;
}

function startedAt(run: ProjectRun) {
  return run.kind === "rank_check" ? run.timestamps.startedAt : run.timestamps.syncStartedAt;
}

export function ProjectRunsTable({
  canMutate,
  onDelete,
  emptyState,
  onRunNow,
  onSkip,
  projectRef,
  rows,
}: Readonly<ProjectRunsTableProps>) {
  const dateFormat = useDateFormat();
  const isDesktop = useMediaQuery("(min-width:1024px)");
  const router = useRouter();
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mutate = useCallback(
    (run: ProjectRun, action: ProjectRunAction) => {
      setActionError(null);
      setPendingRunId(run.id);
      startTransition(async () => {
        try {
          await action({ projectRef, runId: run.id });
          router.refresh();
        } catch {
          setActionError("The planned run could not be updated. Try again.");
        } finally {
          setPendingRunId(null);
        }
      });
    },
    [projectRef, router],
  );

  const columns = useMemo<readonly DataTableColumn<ProjectRunsTableRow>[]>(
    () => [
      {
        accessorKey: "title",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-fg" title={row.original.run.title}>
              {row.original.run.title}
            </span>
          </span>
        ),
        header: "Operation",
        meta: { flex: 1, pin: "left", title: "Operation" },
        minSize: 210,
        size: 260,
      },
      {
        id: "type",
        cell: ({ row }) =>
          row.original.run.kind === "rank_check" ? "Rank check" : "Search Console import",
        header: "Type",
        meta: { title: "Type" },
        minSize: 150,
        size: 170,
      },
      {
        id: "scope",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate text-fg" title={row.original.run.scope.label}>
              {row.original.run.scope.label}
            </span>
            {row.original.run.scope.description ? (
              <span
                className="block truncate text-[10.5px] text-fg-muted"
                title={row.original.run.scope.description}
              >
                {row.original.run.scope.description}
              </span>
            ) : null}
          </span>
        ),
        header: "Scope",
        meta: { title: "Scope" },
        minSize: 180,
        size: 230,
      },
      {
        id: "status",
        cell: ({ row }) => {
          const status = statusFor(row.original.run);
          return <StatusChip label={status.label} tone={status.tone} />;
        },
        header: "Status",
        meta: { title: "Status" },
        minSize: 152,
        size: 152,
      },
      {
        id: "progress",
        cell: ({ row }) => <span className="tabular-nums">{progressFor(row.original.run)}</span>,
        header: "Progress",
        meta: { align: "end", title: "Progress" },
        minSize: 120,
        size: 140,
      },
      {
        id: "unit",
        cell: ({ row }) =>
          row.original.run.progress.unit === "days" ? "Finalized days" : "Targets",
        header: "Unit",
        meta: { title: "Unit" },
        minSize: 118,
        size: 128,
      },
      {
        id: "submitted",
        cell: ({ row }) =>
          formatDateTime(new Date(row.original.run.timestamps.createdAt), dateFormat),
        header: "Submitted",
        meta: { title: "Submitted" },
        minSize: 166,
        size: 184,
      },
      {
        id: "started",
        cell: ({ row }) => {
          const value = startedAt(row.original.run);
          return value ? formatDateTime(new Date(value), dateFormat) : "Not started";
        },
        header: "Started",
        meta: { title: "Started" },
        minSize: 166,
        size: 184,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <RunActions
            canMutate={canMutate}
            onDelete={
              onDelete
                ? async (run) => {
                    await onDelete({ projectRef, runId: run.id });
                    router.refresh();
                  }
                : undefined
            }
            onRunNow={(run) => mutate(run, onRunNow)}
            onSkip={(run) => mutate(run, onSkip)}
            pendingRunId={pendingRunId}
            run={row.original.run}
          />
        ),
        header: () => <span className="sr-only">Actions</span>,
        maxSize: 48,
        meta: { align: "end", lockResize: true, pin: "right", title: "Actions" },
        minSize: 48,
        size: 48,
      },
    ],
    [canMutate, dateFormat, mutate, onRunNow, onSkip, pendingRunId, onDelete, projectRef, router],
  );

  return (
    <div className="grid min-w-0 gap-2 [&_[data-column-id=actions]]:px-2 [&_[data-column-id=status]]:px-2">
      <DataTable
        ariaLabel="Project runs"
        columnPinning={isDesktop ? undefined : { left: [], right: ["actions"] }}
        columns={columns}
        emptyState={emptyState}
        id="project-runs-table"
        onRowClick={(row) => router.push(row.run.href)}
        onSortingChange={() => undefined}
        rows={rows.map((run) => ({ id: run.id, run, title: run.title }))}
        sorting={null}
      />
      {actionError ? (
        <p className="m-0 px-1 text-[12px] text-red-text" role="alert">
          {actionError}
        </p>
      ) : null}
      {pending ? (
        <span className="sr-only" role="status">
          Updating planned run
        </span>
      ) : null}
    </div>
  );
}
