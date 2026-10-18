"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { type ProjectRunsQuery, updateProjectRunsQuery } from "@/lib/runs/filters";
import type { ProjectRun } from "@/lib/runs/project-run";
import { runTimelineSection } from "@/lib/runs/project-run-time-presentation";
import { projectRunTimelineAt, projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useMemo, useState, useTransition } from "react";
import { RunActions } from "./ProjectRunActions";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";
import { titleFor } from "./project-runs-table-copy";
import { RunStatusChip } from "./RunStatusChip";
import { RunStatusLegend } from "./RunStatusLegend";
import { RunStatusSummary } from "./RunStatusSummary";
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
  readAt?: string;
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
  readAt,
}: Readonly<ProjectRunsTableProps>) {
  const t = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const timeline = query?.view === "timeline";
  const statusCopy = useRunStatusCopy();
  const isDesktop = useMediaQuery("(min-width:1280px)");
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
        cell: ({ row }) => (
          <RunTitleCell run={row.original.run} compact={!isDesktop} readAt={readAt} />
        ),
        header: () => (
          <span className="inline-flex items-center gap-0.5">
            {t("operation")}
            {!isDesktop ? (
              <RunStatusLegend groups={statusCopy.groups} label={t("statusLegend")} />
            ) : null}
          </span>
        ),
        meta: { flex: 1, pin: "left", title: t("operation") },
        minSize: 240,
        size: 280,
      },
      {
        id: "when",
        accessorFn: (row) => projectRunTimelineAt(row.run),
        cell: ({ row }) => <RunTimelineTime run={row.original.run} readAt={readAt} />,
        enableSorting: timeline,
        sortDescFirst: true,
        header: timelineT("when"),
        meta: { title: timelineT("when"), sortField: "when" },
        minSize: 224,
        size: 224,
      },
      {
        id: "status",
        cell: ({ row }) => (
          <span className="grid gap-1">
            <RunStatusChip {...statusCopy.forRun(row.original.run)} />
            <RunStatusSummary run={row.original.run} />
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
        minSize: 200,
        size: 240,
      },
      {
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-2">
            {isDesktop &&
            row.original.run.attention &&
            projectRunTimelineGroup(row.original.run) !== 2 ? (
              <Button
                href={row.original.run.href}
                className="whitespace-nowrap"
                size="xs"
                variant="secondary"
              >
                {t("reviewIssue")}
              </Button>
            ) : null}
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
          </span>
        ),
        header: () => <span className="sr-only">{t("actions")}</span>,
        maxSize: isDesktop ? 180 : 48,
        meta: { align: "end", lockResize: true, pin: "right", title: t("actions") },
        minSize: isDesktop ? 180 : 48,
        size: isDesktop ? 180 : 48,
      },
    ],
    [
      canMutate,
      isDesktop,
      readAt,
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
                status: false,
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
        renderSection={(row) => (
          <RunTimelineSection
            run={row.run}
            order={query?.order}
            readAt={readAt}
            attention={query?.status === "attention"}
          />
        )}
        rows={rows.flatMap((run, index) => {
          const row: ProjectRunsTableRow = { id: run.id, run, title: titleFor(run, t) };
          return timeline &&
            (index === 0 ||
              runTimelineSection(rows[index - 1], readAt) !== runTimelineSection(run, readAt))
            ? [
                {
                  ...row,
                  id: `section-${runTimelineSection(run, readAt)}`,
                  kind: "section" as const,
                },
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
          [
            projectRunTimelineGroup(row.run) === 2 ? "text-fg-muted" : "",
            row.kind === "section"
              ? "!h-auto min-h-9 py-2"
              : isDesktop
                ? "!h-auto min-h-[68px] [&>[role=cell]]:py-3"
                : "!h-auto min-h-28 [&>[role=cell]]:py-3",
          ].join(" ")
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
