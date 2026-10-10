"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { type ProjectRunsQuery, updateProjectRunsQuery } from "@/lib/runs/filters";
import type { ProjectRun } from "@/lib/runs/project-run";
import { projectRunTimelineAt, projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useMemo, useState, useTransition } from "react";
import { RunActions } from "./ProjectRunActions";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";
import { progressFor, scopeLabelFor, titleFor } from "./project-runs-table-copy";
import { RunStatusChip } from "./RunStatusChip";
import { RunStatusLegend } from "./RunStatusLegend";
import { RunTimelineSection } from "./RunTimelineSection";
import { RunTimelineTime } from "./RunTimelineTime";
import { RunTitleCell } from "./RunTitleCell";
import { useRunStatusCopy } from "./run-status-copy";

type ProjectRunAction = (input: { projectRef: string; runId: string }) => Promise<void>;

type ProjectRunsTableRow = {
  id: string;
  kind?: "section";
  run: ProjectRunWithOperationSnapshot;
  title: string;
};

type ProjectRunsTableProps = {
  canMutate: boolean;
  onDelete?: ProjectRunAction;
  emptyState: ReactNode;
  onRunNow: ProjectRunAction;
  onSkip: ProjectRunAction;
  projectRef: string;
  rows: readonly ProjectRunWithOperationSnapshot[];
  query?: ProjectRunsQuery;
};

export function ProjectRunsTable({
  canMutate,
  onDelete,
  emptyState,
  onRunNow,
  onSkip,
  projectRef,
  rows,
  query,
}: Readonly<ProjectRunsTableProps>) {
  const t = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const timeline = query?.view === "timeline";
  const statusCopy = useRunStatusCopy();
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
        enableSorting: false,
        cell: ({ row }) => <RunTitleCell run={row.original.run} compact={!isDesktop} />,
        header: () => (
          <span className="inline-flex items-center gap-0.5">
            {t("operation")}
            {!isDesktop ? (
              <RunStatusLegend groups={statusCopy.groups} label={t("statusLegend")} />
            ) : null}
          </span>
        ),
        meta: { flex: 1, pin: "left", title: t("operation") },
        minSize: 210,
        size: 260,
      },
      {
        id: "when",
        accessorFn: (row) => projectRunTimelineAt(row.run),
        cell: ({ row }) => <RunTimelineTime run={row.original.run} />,
        enableSorting: timeline,
        sortDescFirst: true,
        header: timelineT("when"),
        meta: { title: timelineT("when"), sortField: "when" },
        minSize: 166,
        size: 184,
      },
      {
        id: "type",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.run.kind === "rank_check" ? t("rankCheck") : t("searchConsoleImport"),
        header: t("type"),
        meta: { title: t("type") },
        minSize: 150,
        size: 170,
      },
      {
        id: "scope",
        enableSorting: false,
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
        cell: ({ row }) => (
          <span className="grid gap-1">
            <RunStatusChip {...statusCopy.forRun(row.original.run)} />
            {row.original.run.kind === "rank_check" &&
            row.original.run.details.blockedReason === "no_active_keywords" ? (
              <span className="text-[10.5px] text-fg-muted">{timelineT("noActiveKeywords")}</span>
            ) : null}
          </span>
        ),
        enableSorting: false,
        header: () => (
          <span className="inline-flex items-center gap-0.5">
            <span data-replay-label>{t("status")}</span>
            <RunStatusLegend groups={statusCopy.groups} label={t("statusLegend")} />
          </span>
        ),
        meta: { title: t("status") },
        minSize: 168,
        size: 192,
      },
      {
        id: "progress",
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{progressFor(row.original.run, t)}</span>,
        header: t("progress"),
        meta: { align: "end", title: t("progress") },
        minSize: 120,
        size: 140,
      },
      {
        id: "unit",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.run.progress.unit === "days" ? t("finalizedDays") : t("targets"),
        header: t("unit"),
        meta: { title: t("unit") },
        minSize: 118,
        size: 128,
      },
      {
        id: "actions",
        enableSorting: false,
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
      isDesktop,
      mutate,
      onRunNow,
      onSkip,
      pendingRunId,
      onDelete,
      projectRef,
      router,
      statusCopy,
      t,
      timeline,
      timelineT,
    ],
  );

  return (
    <div className="grid min-w-0 gap-2 [&_[data-column-id=actions]]:px-2 [&_[data-column-id=status]]:px-2">
      <DataTable
        bordered={false}
        density={isDesktop ? "standard" : "comfortable"}
        ariaLabel={t("projectRuns")}
        columnPinning={isDesktop ? undefined : { left: [], right: ["actions"] }}
        columnVisibility={
          isDesktop
            ? undefined
            : {
                when: false,
                type: false,
                scope: false,
                status: false,
                progress: false,
                unit: false,
              }
        }
        columns={columns}
        emptyState={emptyState}
        id="project-runs-table"
        onRowClick={(row) => router.push(row.run.href)}
        onSortingChange={(sort) =>
          query &&
          router.push(
            projectRunsPath(
              projectRef,
              updateProjectRunsQuery(query, { order: sort?.direction ?? "default", cursor: null }),
            ),
          )
        }
        renderSection={(row) => <RunTimelineSection run={row.run} order={query?.order} />}
        rows={rows.flatMap((run, index) => {
          const row: ProjectRunsTableRow = { id: run.id, run, title: titleFor(run, t) };
          return timeline &&
            (index === 0 ||
              projectRunTimelineGroup(rows[index - 1]) !== projectRunTimelineGroup(run))
            ? [
                { ...row, id: `section-${projectRunTimelineGroup(run)}`, kind: "section" as const },
                row,
              ]
            : [row];
        })}
        sorting={
          query?.order && query.order !== "default"
            ? { field: "when", direction: query.order }
            : null
        }
        rowClassName={(row) =>
          projectRunTimelineGroup(row.run) === 2 ? "text-fg-muted" : undefined
        }
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
