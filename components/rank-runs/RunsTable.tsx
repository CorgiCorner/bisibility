"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import {
  Avatar,
  Button,
  EmptyState,
  IdChip,
  runStatusChipPresentation,
  StatusChip,
  shortId,
  useLiveNow,
} from "@/components/ui";
import { formatDateTimeCurrentYear } from "@/lib/dates/format";
import { relativeFuture } from "@/lib/format/relative-time";
import { blockedRunPresentation } from "@/lib/rank-check/runs/blocked-presentation";
import { rankTrackerRunsPath } from "@/lib/routing/rank-tracker-runs-path";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  countWithNoun,
  formatDuration,
  isSkippedOccurrence,
  runCounts,
  selectionLabel,
  triggerLabel,
} from "./runs-format";
import type { RankRunRecord } from "./runs-types";

type RunsTableProps = {
  emptyActionHref: string;
  projectRef: string;
  rows: readonly RankRunRecord[];
};

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
        <span className="block">{launchedBy(run)}</span>
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

export function RunsTable({ emptyActionHref, projectRef, rows }: Readonly<RunsTableProps>) {
  const dateFormat = useDateFormat();
  const deploymentMode = useDeploymentMode();
  const router = useRouter();
  if (rows.length === 0) {
    return (
      <div className="px-4 py-11">
        <EmptyState
          action={
            <Button href={emptyActionHref} size="sm" variant="secondary">
              Manage schedules
            </Button>
          }
          description="Runs appear here when a run starts - manually, from a schedule, or through the API."
          icon={<ListChecks size={22} weight="regular" />}
          title="No runs yet"
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[1142px] table-fixed border-collapse" aria-label="Runs">
        <thead className="text-left text-[11px] uppercase tracking-[0.5px] text-fg-muted">
          <tr>
            <th className="w-[260px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Run
            </th>
            <th className="w-[170px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Launched by
            </th>
            <th className="w-[190px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Selection
            </th>
            <th className="w-[210px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Progress
            </th>
            <th className="w-[100px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Cost
            </th>
            <th className="w-[148px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Started
            </th>
            <th className="w-[84px] border-b border-border px-3 py-2.5 font-semibold" scope="col">
              Duration
            </th>
            <th
              className="w-[120px] border-b border-border px-3 py-2.5 font-semibold"
              scope="col"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((run) => {
            const status = presentation(run);
            const href = rankTrackerRunsPath(projectRef, run.id);
            const startedAt = run.startedAt;
            const skipped = isSkippedOccurrence(run);
            const planned =
              run.status === "planned" ||
              run.status === "queued" ||
              (run.status === "blocked" && run.startedAt === null);
            const blocked =
              run.status === "blocked"
                ? blockedRunPresentation({
                    budget: run.budget,
                    deploymentMode,
                    reason: run.blockedReason,
                  })
                : null;
            return (
              <tr
                className="border-t border-border text-[12px] hover:bg-bg-sunken/55"
                key={run.id}
                onClick={() => router.push(href)}
              >
                <td className="align-top px-3 py-3">
                  <a
                    className="block w-fit text-[12.5px] font-semibold text-fg no-underline hover:text-accent-text"
                    href={href}
                  >
                    {triggerLabel(run)}
                  </a>
                  <IdChip
                    className="mt-0.5 max-w-full border-border bg-transparent"
                    copyLabel={`Copy run ID ${run.id}`}
                    displayValue={shortId(run.id)}
                    size="xs"
                    value={run.id}
                  />
                </td>
                <td className="align-top px-3 py-3 text-[11.5px] text-fg-muted">
                  <RunActor run={run} />
                </td>
                <td className="align-top px-3 py-3">
                  <span className="block leading-[1.45] text-fg">{selectionLabel(run)}</span>
                  {run.targetCount > run.keywordCount ? (
                    <span className="mt-0.5 block text-[10.5px] text-fg-muted">
                      {countWithNoun(run.keywordCount, "keyword")} ·{" "}
                      {countWithNoun(run.targetCount, "target")}
                    </span>
                  ) : null}
                </td>
                <td className="align-top px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip {...status} />
                    <span className="text-[10.5px] tabular-nums text-fg-muted">
                      {runCounts(run)}
                    </span>
                  </div>
                  <NextCheckLine run={run} />
                  {blocked ? (
                    <span className="mt-1.5 block text-[11px] leading-[1.45] text-fg-muted">
                      {blocked.compact}
                    </span>
                  ) : null}
                </td>
                <td className="align-top px-3 py-3 text-[11px] tabular-nums text-fg">
                  <span className="block">
                    {money(skipped ? 0 : planned ? run.estimatedCostCents : run.costCents)}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-fg-muted">
                    {skipped ? "nothing billed" : planned ? "estimate" : "actual"}
                  </span>
                </td>
                <td className="align-top px-3 py-3 text-[11px] text-fg">
                  {startedAt
                    ? formatDateTimeCurrentYear(new Date(startedAt), dateFormat, new Date())
                    : "Not started"}
                </td>
                <td className="align-top px-3 py-3 text-[11px] tabular-nums text-fg-muted">
                  {formatDuration(run)}
                </td>
                <td className="align-top px-3 py-3 text-right text-[10.5px] text-fg-muted">
                  {run.parentRunId ? (
                    <span title={run.parentRunId}>from {shortId(run.parentRunId)}</span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
