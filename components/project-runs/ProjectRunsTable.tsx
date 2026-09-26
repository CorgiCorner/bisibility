"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { formatDateTime } from "@/lib/dates/format";
import type { ProjectRun } from "@/lib/runs/project-run";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useMemo, useState, useTransition } from "react";
import { RunActions } from "./ProjectRunActions";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";
import { RunStatusChip } from "./RunStatusChip";
import { RunStatusLegend } from "./RunStatusLegend";
import { useRunStatusCopy } from "./run-status-copy";

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

function progressFor(run: ProjectRun, t: ReturnType<typeof useTranslations<"projectRuns.table">>) {
  const { completed, total } = run.progress;
  if (completed === null || total === null) return t("notAvailable");
  return t("progressValue", { completed, total });
}

function titleFor(run: ProjectRun, t: ReturnType<typeof useTranslations<"projectRuns.table">>) {
  if (run.title.kind === "gsc_import") return t("searchConsoleImport");
  if (run.title.trigger === "api") return t("rankCheckApi");
  if (run.title.trigger === "manual") return t("rankCheckManual");
  if (run.title.trigger === "retry") return t("rankCheckRetry");
  return t("rankCheckScheduled");
}

function scopeLabelFor(
  run: ProjectRun,
  t: ReturnType<typeof useTranslations<"projectRuns.table">>,
) {
  return run.scope.kind === "rank_check"
    ? t("keywordCount", { count: run.scope.keywordCount })
    : t("searchConsole");
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
  const t = useTranslations("projectRuns.table");
  const statusCopy = useRunStatusCopy();
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
          setActionError(t("plannedUpdateFailed"));
        } finally {
          setPendingRunId(null);
        }
      });
    },
    [projectRef, router, t],
  );

  const columns = useMemo<readonly DataTableColumn<ProjectRunsTableRow>[]>(
    () => [
      {
        accessorKey: "title",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span
              className="block truncate font-medium text-fg"
              title={titleFor(row.original.run, t)}
            >
              {titleFor(row.original.run, t)}
            </span>
          </span>
        ),
        header: t("operation"),
        meta: { flex: 1, pin: "left", title: t("operation") },
        minSize: 210,
        size: 260,
      },
      {
        id: "type",
        cell: ({ row }) =>
          row.original.run.kind === "rank_check" ? t("rankCheck") : t("searchConsoleImport"),
        header: t("type"),
        meta: { title: t("type") },
        minSize: 150,
        size: 170,
      },
      {
        id: "scope",
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate text-fg" title={scopeLabelFor(row.original.run, t)}>
              {scopeLabelFor(row.original.run, t)}
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
        header: t("scope"),
        meta: { title: t("scope") },
        minSize: 180,
        size: 230,
      },
      {
        id: "status",
        cell: ({ row }) => <RunStatusChip {...statusCopy.forRun(row.original.run)} />,
        enableSorting: false,
        header: () => (
          <span className="inline-flex items-center gap-0.5">
            <span data-replay-label>{t("status")}</span>
            <RunStatusLegend groups={statusCopy.groups} label={t("statusLegend")} />
          </span>
        ),
        meta: { title: t("status") },
        minSize: 152,
        size: 152,
      },
      {
        id: "progress",
        cell: ({ row }) => <span className="tabular-nums">{progressFor(row.original.run, t)}</span>,
        header: t("progress"),
        meta: { align: "end", title: t("progress") },
        minSize: 120,
        size: 140,
      },
      {
        id: "unit",
        cell: ({ row }) =>
          row.original.run.progress.unit === "days" ? t("finalizedDays") : t("targets"),
        header: t("unit"),
        meta: { title: t("unit") },
        minSize: 118,
        size: 128,
      },
      {
        id: "submitted",
        cell: ({ row }) =>
          formatDateTime(new Date(row.original.run.timestamps.createdAt), dateFormat),
        header: t("submitted"),
        meta: { title: t("submitted") },
        minSize: 166,
        size: 184,
      },
      {
        id: "started",
        cell: ({ row }) => {
          const value = startedAt(row.original.run);
          return value ? formatDateTime(new Date(value), dateFormat) : t("notStarted");
        },
        header: t("started"),
        meta: { title: t("started") },
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
        header: () => <span className="sr-only">{t("actions")}</span>,
        maxSize: 48,
        meta: { align: "end", lockResize: true, pin: "right", title: t("actions") },
        minSize: 48,
        size: 48,
      },
    ],
    [
      canMutate,
      dateFormat,
      mutate,
      onRunNow,
      onSkip,
      pendingRunId,
      onDelete,
      projectRef,
      router,
      statusCopy,
      t,
    ],
  );

  return (
    <div className="grid min-w-0 gap-2 [&_[data-column-id=actions]]:px-2 [&_[data-column-id=status]]:px-2">
      <DataTable
        bordered={false}
        ariaLabel={t("projectRuns")}
        columnPinning={isDesktop ? undefined : { left: [], right: ["actions"] }}
        columns={columns}
        emptyState={emptyState}
        id="project-runs-table"
        onRowClick={(row) => router.push(row.run.href)}
        onSortingChange={() => undefined}
        rows={rows.map((run) => ({ id: run.id, run, title: titleFor(run, t) }))}
        sorting={null}
      />
      {actionError ? (
        <p className="m-0 px-1 text-[12px] text-red-text" role="alert">
          {actionError}
        </p>
      ) : null}
      {pending ? (
        <span className="sr-only" role="status">
          {t("updatingPlannedRun")}
        </span>
      ) : null}
    </div>
  );
}
