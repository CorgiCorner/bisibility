import {
  itemStatusChipPresentation,
  runStatusChipPresentation,
} from "@/components/ui/status-chip-mapping";
import { relativeFuture } from "@/lib/format/relative-time";
import type {
  ItemStatus,
  OperationSnapshot,
  RankCheckOperation,
  RunStatus,
} from "@/lib/rank-check/runs/contract";
import type { RunPageData, RunPageItem } from "./RunPageTypes";
import { countWithNoun, formatElapsed, isSkippedOccurrence } from "./runs-format";

export type RunItemFilter = "all" | ItemStatus;

type Counter = { count: number; label: string; note: string };

const FILTERABLE_ITEM_STATUSES: ItemStatus[] = [
  "running",
  "queued",
  "completed",
  "failed",
  "deferred",
  "cancelled",
  "skipped",
  "blocked",
];

function isActiveRun(status: RunStatus): boolean {
  return status === "queued" || status === "running" || status === "cancelling";
}

function cents(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function timestamp(item: RunPageItem): string {
  return item.finishedAt ?? item.startedAt ?? item.notBefore ?? "";
}

function terminalCount(run: RunPageData): number {
  const { cancelled, completed, deferred, failed } = run.counts;
  return cancelled + completed + deferred + failed;
}

function hasCount(run: RunPageData, status: ItemStatus): boolean {
  if (status === "completed") return run.counts.completed > 0;
  if (status === "failed") return run.counts.failed > 0;
  if (status === "deferred") return run.counts.deferred > 0;
  if (status === "cancelled") return run.counts.cancelled > 0;
  if (status === "skipped") return run.counts.skipped > 0;
  if (!isActiveRun(run.status)) return false;
  if (status === "running") return run.hasRunningTargets === true;
  return status === "queued" && run.counts.total > (run.startedTargets ?? 0) + run.counts.skipped;
}

export function liveRun(run: RunPageData, operations: OperationSnapshot[]): RunPageData {
  const operation = operations.find(
    (candidate): candidate is RankCheckOperation =>
      candidate.kind === "rank_check" && candidate.id === run.id,
  );
  return operation ? { ...run, ...operation } : run;
}

export function runCounters(run: RunPageData): Counter[] {
  const pending = Math.max(run.counts.total - terminalCount(run), 0);
  return [
    { count: pending, label: "Remaining", note: "not terminal" },
    {
      count: run.counts.completed,
      label: itemStatusChipPresentation("completed").label,
      note: "positions written",
    },
    {
      count: run.counts.failed,
      label: itemStatusChipPresentation("failed").label,
      note: "no position written",
    },
    {
      count: run.counts.deferred,
      label: itemStatusChipPresentation("deferred").label,
      note: "retry on the next run",
    },
    {
      count: run.counts.cancelled,
      label: itemStatusChipPresentation("cancelled").label,
      note: "stopped before sending",
    },
  ].filter((counter) => counter.count > 0);
}

export function runFilters(
  run: RunPageData,
): Array<{ count: number | null; value: RunItemFilter }> {
  return [
    { count: run.counts.total, value: "all" as const },
    ...FILTERABLE_ITEM_STATUSES.filter((status) => hasCount(run, status)).map((status) => ({
      count: null,
      value: status,
    })),
  ];
}

export function orderedRunItems(
  items: RunPageItem[],
  filter: RunItemFilter,
  run: RunPageData,
): RunPageItem[] {
  const selected = filter === "all" ? items : items.filter((item) => item.status === filter);
  if (isActiveRun(run.status) && filter === "all") {
    return [...selected].sort(
      (left, right) =>
        timestamp(right).localeCompare(timestamp(left)) || right.id.localeCompare(left.id),
    );
  }
  return [...selected].sort(
    (left, right) =>
      left.keyword.text.localeCompare(right.keyword.text) ||
      left.keyword.location.localeCompare(right.keyword.location) ||
      left.keyword.device.localeCompare(right.keyword.device) ||
      left.id.localeCompare(right.id),
  );
}

export function runSummary(
  run: RunPageData,
  options: { formatInstant: (iso: string) => string; now: string },
) {
  const formatInstant = options.formatInstant;
  const processed = terminalCount(run);
  const active = isActiveRun(run.status);
  const planned = run.status === "planned" || (run.status === "blocked" && !run.startedAt);
  const waiting = run.status === "queued";
  const beforeStart = planned || waiting;
  const skipped = isSkippedOccurrence(run);
  const started = skipped ? 0 : (run.startedTargets ?? 0);
  const selection = `${countWithNoun(run.keywordCount, "keyword")} · ${countWithNoun(run.counts.total, "target")}`;
  return {
    active,
    cancellable: run.status === "queued" || run.status === "running",
    counters: runCounters(run),
    facts: [
      { label: "Selection", note: "", value: selection },
      {
        label: "Provider",
        note: skipped ? "not chosen" : run.providerLabel ? "chosen at launch" : "not chosen yet",
        value: skipped ? "-" : (run.providerLabel ?? "-"),
      },
      {
        label: beforeStart ? "Estimated cost" : active ? "Spent so far" : "Cost",
        note: skipped
          ? "nothing billed"
          : beforeStart
            ? run.estimatedCostCents === 0
              ? "no rate yet"
              : "set when planned"
            : `estimate ${cents(run.estimatedCostCents)}`,
        value:
          skipped || (beforeStart && run.estimatedCostCents === 0)
            ? "-"
            : cents(beforeStart ? run.estimatedCostCents : run.costCents),
      },
      waiting
        ? {
            label: "First check in",
            note: run.scheduleTiming ?? "Waiting to start",
            value:
              (run.firstNotBefore ?? run.nextCheckAt)
                ? relativeFuture(
                    new Date((run.firstNotBefore ?? run.nextCheckAt) as string),
                    new Date(options.now),
                  ).replace(/^in /, "")
                : "Waiting for worker",
          }
        : {
            label:
              run.status === "blocked" && run.trigger === "manual"
                ? "Blocked since"
                : planned
                  ? "Starts in"
                  : active
                    ? "Elapsed"
                    : "Duration",
            note:
              run.status === "blocked" && run.trigger === "manual"
                ? "Waiting to start"
                : planned
                  ? "scheduled occurrence"
                  : active
                    ? run.startedAt
                      ? `Started ${formatInstant(run.startedAt)}`
                      : "Not started"
                    : run.finishedAt
                      ? `Finished ${formatInstant(run.finishedAt)}`
                      : "Not finished",
            value:
              run.status === "blocked" && run.trigger === "manual"
                ? run.launchedAt
                  ? formatInstant(run.launchedAt)
                  : "Not started"
                : planned
                  ? run.plannedFor
                    ? formatInstant(run.plannedFor)
                    : "Not scheduled"
                  : formatElapsed(run.startedAt, run.finishedAt, options.now),
          },
    ],
    matchedLine: planned
      ? `${countWithNoun(run.counts.total, "target")} selected`
      : `${count(started)} of ${count(run.counts.total)} selected targets started`,
    planned,
    processed,
    progressLabel: `${count(processed)} of ${count(run.counts.total)} targets processed`,
    runPresentation: skipped
      ? { label: "Skipped", tone: "neutral" as const }
      : runStatusChipPresentation(run.status, run.outcome),
    skipped,
    skippedLine: skipped
      ? `Skipped by ${run.skippedBy?.name ?? "a team member"} on ${run.finishedAt ? formatInstant(run.finishedAt) : "an unknown date"}`
      : "Skipped targets never reach a provider and cost nothing.",
  };
}

export type RunPageSummary = ReturnType<typeof runSummary>;
