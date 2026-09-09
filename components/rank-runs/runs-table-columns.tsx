"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { PillBadge } from "@/components/ui/Pill";
import { StatusChip } from "@/components/ui/StatusChip";
import { runStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { useLiveNow } from "@/components/ui/useLiveNow";
import type { DateFormat } from "@/lib/dates/format";
import { formatDateTimeCurrentYear } from "@/lib/dates/format";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { relativeFuture } from "@/lib/format/relative-time";
import {
  blockedRunPresentation,
  type ClientDeploymentMode,
} from "@/lib/rank-check/runs/blocked-presentation";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import Link from "next/link";
import {
  countWithNoun,
  formatDuration,
  isSkippedOccurrence,
  runCounts,
  selectionLabel,
  triggerLabel,
} from "./runs-format";
import type { RankRunRecord } from "./runs-types";

type RunsTableColumnsOptions = {
  dateFormat: DateFormat;
  deploymentMode: ClientDeploymentMode;
  projectRef: string;
};

export type RunsTableRow = { id: string; kind: "row"; run: RankRunRecord };

export function rankRunHref(projectRef: string, publicId: string): string {
  return isPublicIdOfType(publicId, "rcr")
    ? projectRunRankCheckPath(projectRef, publicId)
    : projectRunsPath(projectRef);
}

function presentation(run: RankRunRecord) {
  if (isSkippedOccurrence(run)) return { label: "Skipped", tone: "neutral" as const };
  return runStatusChipPresentation(run.status, run.outcome);
}

function launchedBy(run: RankRunRecord) {
  if (run.requestedBy?.name) return run.requestedBy.name;
  return run.trigger === "scheduled"
    ? (run.checkScheduleName ?? "Schedule")
    : run.trigger === "api"
      ? "API"
      : "You";
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function RunActor({ run }: Readonly<{ run: RankRunRecord }>) {
  const skipped = isSkippedOccurrence(run);
  if (!run.requestedBy?.name) {
    return (
      <span className="block" data-testid={`run-actor-${run.id}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          {launchedBy(run)}{" "}
          {run.checkScheduleArchived ? <PillBadge size="xs">Archived</PillBadge> : null}
        </span>
        {skipped ? (
          <span className="mt-0.5 block text-[10.5px] leading-[1.45] text-fg-muted">
            Skipped by {run.skippedBy?.name ?? "a team member"} · never sent
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2" data-testid={`run-actor-${run.id}`}>
      <Avatar
        alt=""
        className="grid h-6 w-6 shrink-0 place-items-center rounded-control bg-bg-sunken text-[9px] font-semibold text-fg-muted"
        initials={run.requestedBy.initials ?? "U"}
        src={run.requestedBy.avatarUrl}
      />
      <span className="truncate" title={run.requestedBy.name}>
        {run.requestedBy.name}
      </span>
    </span>
  );
}

function NextCheckLine({ run }: Readonly<{ run: RankRunRecord }>) {
  const nextCheckAt = run.nextCheckAt;
  const serverNow = run.snapshotAt ?? run.startedAt ?? run.launchedAt ?? nextCheckAt ?? "";
  const now = useLiveNow(
    serverNow,
    (run.status === "running" || run.status === "queued") &&
      Boolean(nextCheckAt) &&
      !run.snapshotAt,
  );

  if ((run.status !== "running" && run.status !== "queued") || !nextCheckAt) return null;
  return (
    <span className="mt-1 block text-[10.5px] text-fg-muted">
      {run.status === "queued" ? "First" : "Next"} check{" "}
      {relativeFuture(new Date(nextCheckAt), new Date(now))}
    </span>
  );
}

export function runsTableColumns({
  dateFormat,
  deploymentMode,
  projectRef,
}: RunsTableColumnsOptions): readonly DataTableColumn<RunsTableRow>[] {
  return [
    {
      accessorFn: (row) => triggerLabel(row.run),
      cell: ({ row }) => {
        const run = row.original.run;
        const href = rankRunHref(projectRef, run.id);
        return (
          <div className="min-w-0">
            <Link
              className="block w-fit text-[12.5px] font-semibold text-fg no-underline hover:text-accent-text"
              href={href}
            >
              {triggerLabel(run)}
            </Link>
            <IdChip
              className="mt-0.5 max-w-full border-border bg-transparent"
              copyLabel={`Copy run ID ${run.id}`}
              size="xs"
              value={run.id}
            />
          </div>
        );
      },
      enableSorting: false,
      header: "Run",
      id: "actions",
      meta: { flex: 1.4, lockResize: true, title: "Run" },
      minSize: 216,
      size: 256,
    },
    {
      accessorFn: (row) => launchedBy(row.run),
      cell: ({ row }) => <RunActor run={row.original.run} />,
      enableSorting: false,
      header: "Launched by",
      id: "launchedBy",
      meta: { flex: 0.4, lockResize: true, title: "Launched by" },
      minSize: 168,
      size: 176,
    },
    {
      accessorFn: (row) => selectionLabel(row.run),
      cell: ({ row }) => {
        const run = row.original.run;
        return (
          <div className="min-w-0">
            <span className="block leading-[1.45] text-fg">{selectionLabel(run)}</span>
            {run.targetCount > run.keywordCount ? (
              <span className="mt-0.5 block text-[10.5px] text-fg-muted">
                {countWithNoun(run.keywordCount, "keyword")} ·{" "}
                {countWithNoun(run.targetCount, "target")}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: "Selection",
      id: "targetSelection",
      meta: { flex: 0.8, lockResize: true, title: "Selection" },
      minSize: 184,
      size: 200,
    },
    {
      accessorFn: (row) => runCounts(row.run),
      cell: ({ row }) => {
        const run = row.original.run;
        const status = presentation(run);
        const blocked =
          run.status === "blocked"
            ? blockedRunPresentation({
                budget: run.budget,
                deploymentMode,
                reason: run.blockedReason,
              })
            : null;
        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip {...status} />
              <span className="text-[10.5px] tabular-nums text-fg-muted">{runCounts(run)}</span>
            </div>
            <NextCheckLine run={run} />
            {blocked ? (
              <span className="mt-1.5 block text-[11px] leading-[1.45] text-fg-muted">
                {blocked.compact}
              </span>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: "Progress",
      id: "progress",
      meta: { flex: 0.9, lockResize: true, title: "Progress" },
      minSize: 200,
      size: 216,
    },
    {
      accessorFn: (row) => row.run.costCents,
      cell: ({ row }) => {
        const run = row.original.run;
        const skipped = isSkippedOccurrence(run);
        const planned =
          run.status === "planned" ||
          run.status === "queued" ||
          (run.status === "blocked" && run.startedAt === null);
        return (
          <div>
            <span className="block">
              {money(skipped ? 0 : planned ? run.estimatedCostCents : run.costCents)}
            </span>
            <span className="mt-0.5 block text-[10.5px] text-fg-muted">
              {skipped ? "nothing billed" : planned ? "estimate" : "actual"}
            </span>
          </div>
        );
      },
      enableSorting: false,
      header: "Cost",
      id: "cost",
      meta: { align: "end", lockResize: true, title: "Cost" },
      minSize: 96,
      size: 104,
    },
    {
      accessorFn: (row) => row.run.startedAt ?? "",
      cell: ({ row }) => {
        const { startedAt } = row.original.run;
        return startedAt
          ? formatDateTimeCurrentYear(new Date(startedAt), dateFormat, new Date())
          : "Not started";
      },
      enableSorting: false,
      header: "Started",
      id: "started",
      meta: { lockResize: true, title: "Started" },
      minSize: 148,
      size: 156,
    },
    {
      accessorFn: (row) => formatDuration(row.run),
      cell: ({ row }) => formatDuration(row.original.run),
      enableSorting: false,
      header: "Duration",
      id: "duration",
      meta: { align: "end", lockResize: true, title: "Duration" },
      minSize: 96,
      size: 100,
    },
    {
      accessorFn: (row) => row.run.parentRunId ?? "",
      cell: ({ row }) =>
        row.original.run.parentRunId ? (
          <span className="inline-flex items-center gap-1">
            from
            <IdChip
              className="border-0 bg-transparent px-0"
              copyLabel="Copy parent run ID"
              size="xs"
              value={row.original.run.parentRunId}
            />
          </span>
        ) : null,
      enableSorting: false,
      header: "",
      id: "relatedRun",
      meta: { flex: 0.3, lockResize: true },
      minSize: 148,
      size: 156,
    },
  ];
}
