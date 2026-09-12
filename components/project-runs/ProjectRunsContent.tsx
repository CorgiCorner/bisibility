"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { searchConsolePath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ProjectRunsQuery } from "@/lib/runs/filters";
import type { ProjectRun } from "@/lib/runs/project-run";
import type { ProjectRunsApiResponse } from "@/lib/runs/project-runs-api";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import { ProjectRunsFilters } from "./ProjectRunsFilters";
import { ProjectRunsTable } from "./ProjectRunsTable";
import { ProjectRunsTabs } from "./ProjectRunsTabs";
import { applyOperationSnapshotToRuns } from "./project-runs-presentation";

type ProjectRunAction = (input: { projectRef: string; runId: string }) => Promise<void>;

type ProjectRunsContentProps = {
  canMutate: boolean;
  canDelete?: boolean;
  deleteAction?: ProjectRunAction;
  operations: readonly OperationSnapshot[];
  page: ProjectRunsApiResponse;
  projectRef: string;
  query: ProjectRunsQuery;
  runNowAction: ProjectRunAction;
  skipAction: ProjectRunAction;
};

type ProjectRunsLoadErrorProps = {
  projectRef: string;
  query?: ProjectRunsQuery;
  stale: boolean;
};

function EmptyRuns({
  projectRef,
  query,
}: Readonly<{
  projectRef: string;
  query: ProjectRunsQuery;
}>) {
  const clearFiltersHref = projectRunsPath(projectRef, { view: query.view });
  const historyHref = projectRunsPath(projectRef, { source: query.source });
  const schedulesHref = projectSchedulesPath(projectRef);

  if (query.view === "planned" && query.source === "search_console") {
    return (
      <EmptyState
        description="Search Console imports do not have schedules."
        icon={<ListChecks size={22} weight="regular" />}
        title="No upcoming Search Console runs"
      />
    );
  }
  if (query.view === "planned") {
    return (
      <EmptyState
        action={
          <Button href={schedulesHref} size="sm" variant="secondary">
            Manage schedules
          </Button>
        }
        description="Scheduled rank checks appear here before they start."
        icon={<ListChecks size={22} weight="regular" />}
        title="No upcoming runs"
      />
    );
  }
  if (query.status === "active") {
    return (
      <EmptyState
        action={
          <Button href={historyHref} size="sm" variant="secondary">
            View run history
          </Button>
        }
        description="Review run history or choose another status to find completed work."
        icon={<ListChecks size={22} weight="regular" />}
        title="No runs in progress"
      />
    );
  }
  if (query.source === "search_console") {
    return (
      <EmptyState
        action={
          <Button href={searchConsolePath(projectRef)} size="sm" variant="secondary">
            Open Search Console
          </Button>
        }
        description="Import Search Console data to keep its run history here."
        icon={<ListChecks size={22} weight="regular" />}
        title="No Search Console runs yet"
      />
    );
  }
  if (query.source !== "all" || query.status !== "all") {
    return (
      <EmptyState
        action={
          <Button href={clearFiltersHref} size="sm" variant="secondary">
            Clear filters
          </Button>
        }
        description="Change or clear the filters to see other runs."
        icon={<ListChecks size={22} weight="regular" />}
        title="No matching runs"
      />
    );
  }
  return (
    <EmptyState
      description="Rank checks and Search Console history imports will appear here."
      icon={<ListChecks size={22} weight="regular" />}
      title="No runs yet"
    />
  );
}

export function ProjectRunsLoadError({
  projectRef,
  query,
  stale,
}: Readonly<ProjectRunsLoadErrorProps>) {
  return (
    <div className="grid gap-4">
      <ProjectRunsTabs active="runs" projectRef={projectRef} query={query} />
      <section
        className="rounded-card border border-border bg-bg-elev px-4 py-10 text-center"
        role="alert"
      >
        <h1 className="m-0 text-[17px] font-semibold text-fg">
          {stale ? "This Runs page is stale" : "Runs could not be loaded"}
        </h1>
        <p className="mx-auto mb-4 mt-2 max-w-lg text-[12.5px] text-fg-muted">
          {stale
            ? "The cursor no longer matches these filters. Return to the first page to continue."
            : "Try again. If the problem continues, return to the first page."}
        </p>
        <Button
          href={projectRunsPath(projectRef, { ...query, cursor: null })}
          size="sm"
          variant="secondary"
        >
          Return to first page
        </Button>
      </section>
    </div>
  );
}

export function ProjectRunsContent({
  canMutate,
  canDelete = false,
  deleteAction,
  operations,
  page,
  projectRef,
  query,
  runNowAction,
  skipAction,
}: Readonly<ProjectRunsContentProps>) {
  // The API schema validates this transport shape; R1's presentation type carries its stricter ID brands.
  const rows = applyOperationSnapshotToRuns(page.runs as unknown as ProjectRun[], operations);
  const nextHref = page.nextCursor
    ? projectRunsPath(projectRef, { ...query, cursor: page.nextCursor })
    : null;

  return (
    <section
      className="grid min-w-0 gap-4"
      aria-label={query.view === "planned" ? "Upcoming runs" : "Runs"}
    >
      <ProjectRunsTabs active="runs" projectRef={projectRef} query={query} />
      <Card className="min-w-0 overflow-hidden p-0 [&_[role=table]]:border-0" size="sm">
        <TableCardHeader
          className="border-b border-border"
          titleId="runs-list-title"
          title={`${page.counts.total.toLocaleString("en-US")} ${page.counts.total === 1 ? "run" : "runs"}`}
          actions={<ProjectRunsFilters projectRef={projectRef} query={query} />}
        />
        <ProjectRunsTable
          canMutate={canMutate}
          onDelete={canDelete ? deleteAction : undefined}
          emptyState={<EmptyRuns projectRef={projectRef} query={query} />}
          onRunNow={runNowAction}
          onSkip={skipAction}
          projectRef={projectRef}
          rows={rows}
        />
      </Card>
      {nextHref ? (
        <div className="flex justify-end">
          <Button href={nextHref} size="sm" variant="secondary">
            Next page
          </Button>
        </div>
      ) : null}
    </section>
  );
}
