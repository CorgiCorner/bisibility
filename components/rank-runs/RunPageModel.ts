import type { StatusChipPresentation } from "@/components/ui/status-chip-mapping";
import type {
  ItemStatus,
  OperationSnapshot,
  RankCheckOperation,
  RunStatus,
} from "@/lib/rank-check/runs/contract";
import type { RunScheduleTiming } from "@/lib/rank-check/runs/start-facts";
import type { RunPageData, RunPageItem } from "./RunPageTypes";
import { isSkippedOccurrence } from "./runs-format";

export type RunItemFilter = "all" | ItemStatus;

type CounterKind = "cancelled" | "completed" | "deferred" | "failed" | "remaining";
type Counter = { count: number; label: string; note: string };
type RunFact =
  | { kind: "selection"; keywordCount: number; targetCount: number }
  | { kind: "provider"; providerLabel: string | null; state: "chosen_at_launch" | "not_chosen" }
  | {
      costCents: number | null;
      kind: "cost";
      note: "estimate" | "no_rate_yet" | "nothing_billed" | "set_when_planned";
      phase: "cost" | "estimated" | "spent";
    }
  | {
      kind: "first_check";
      nextAt: string | null;
      note: "waiting_for_worker" | "waiting_to_start" | "schedule_timing";
      scheduleTiming: RunScheduleTiming | null;
    }
  | {
      kind: "timing";
      note:
        | "not_finished"
        | "not_started"
        | "scheduled_occurrence"
        | "started"
        | "waiting_to_start";
      now: string;
      phase: "blocked_since" | "duration" | "elapsed" | "starts_in";
      value:
        | { kind: "duration"; finishedAt: string | null; startedAt: string | null }
        | { kind: "instant"; value: string | null };
    };

export type RunPageSummaryLabels = {
  counter: (kind: CounterKind) => Omit<Counter, "count">;
  elapsed: (startedAt: string | null, finishedAt: string | null, now: string) => string;
  fact: (fact: RunFact) => { label: string; note: string; value: string };
  matched: (started: number, total: number) => string;
  progress: (processed: number, total: number) => string;
  runPresentation: (run: RunPageData, skipped: boolean) => StatusChipPresentation;
  selected: (count: number) => string;
  skippedBy: (name: string, date: string) => string;
  skippedExplanation: () => string;
};

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

export function runCounters(run: RunPageData, labels: RunPageSummaryLabels): Counter[] {
  const pending = Math.max(run.counts.total - terminalCount(run), 0);
  return [
    { count: pending, ...labels.counter("remaining") },
    {
      count: run.counts.completed,
      ...labels.counter("completed"),
    },
    {
      count: run.counts.failed,
      ...labels.counter("failed"),
    },
    {
      count: run.counts.deferred,
      ...labels.counter("deferred"),
    },
    {
      count: run.counts.cancelled,
      ...labels.counter("cancelled"),
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
  options: { now: string },
  labels: RunPageSummaryLabels,
) {
  const processed = terminalCount(run);
  const active = isActiveRun(run.status);
  const planned = run.status === "planned" || (run.status === "blocked" && !run.startedAt);
  const waiting = run.status === "queued";
  const beforeStart = planned || waiting;
  const skipped = isSkippedOccurrence(run);
  const started = skipped ? 0 : (run.startedTargets ?? 0);
  const selection = labels.fact({
    kind: "selection",
    keywordCount: run.keywordCount,
    targetCount: run.counts.total,
  });
  const provider = labels.fact({
    kind: "provider",
    providerLabel: skipped ? null : (run.providerLabel ?? null),
    state: skipped || !run.providerLabel ? "not_chosen" : "chosen_at_launch",
  });
  const cost = labels.fact({
    costCents:
      skipped || (beforeStart && run.estimatedCostCents === 0)
        ? null
        : beforeStart
          ? run.estimatedCostCents
          : run.costCents,
    kind: "cost",
    note: skipped
      ? "nothing_billed"
      : beforeStart
        ? run.estimatedCostCents === 0
          ? "no_rate_yet"
          : "set_when_planned"
        : "estimate",
    phase: beforeStart ? "estimated" : active ? "spent" : "cost",
  });
  const timing = waiting
    ? labels.fact({
        kind: "first_check",
        nextAt: run.firstNotBefore ?? run.nextCheckAt,
        note: run.scheduleTiming
          ? "schedule_timing"
          : run.firstNotBefore || run.nextCheckAt
            ? "waiting_to_start"
            : "waiting_for_worker",
        scheduleTiming: run.scheduleTiming ?? null,
      })
    : labels.fact({
        kind: "timing",
        note:
          run.status === "blocked" && run.trigger === "manual"
            ? "waiting_to_start"
            : planned
              ? "scheduled_occurrence"
              : active
                ? run.startedAt
                  ? "started"
                  : "not_started"
                : run.finishedAt
                  ? "started"
                  : "not_finished",
        phase:
          run.status === "blocked" && run.trigger === "manual"
            ? "blocked_since"
            : planned
              ? "starts_in"
              : active
                ? "elapsed"
                : "duration",
        value:
          run.status === "blocked" && run.trigger === "manual"
            ? { kind: "instant", value: run.launchedAt }
            : planned
              ? { kind: "instant", value: run.plannedFor }
              : { finishedAt: run.finishedAt, kind: "duration", startedAt: run.startedAt },
        now: options.now,
      });
  return {
    active,
    cancellable: run.status === "queued" || run.status === "running",
    counters: runCounters(run, labels),
    facts: [selection, provider, cost, timing],
    matchedLine: planned
      ? labels.selected(run.counts.total)
      : labels.matched(started, run.counts.total),
    planned,
    processed,
    progressLabel: labels.progress(processed, run.counts.total),
    runPresentation: labels.runPresentation(run, skipped),
    skipped,
    skippedLine: skipped
      ? labels.skippedBy(run.skippedBy?.name ?? "", run.finishedAt ?? "")
      : labels.skippedExplanation(),
  };
}

export type RunPageSummary = ReturnType<typeof runSummary>;
