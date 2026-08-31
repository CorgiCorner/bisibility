import { RETENTION_MONTHS } from "@/lib/search-insights/constants";
import { addDays, diffDays, monthsBefore } from "@/lib/search-insights/dates";

export type SearchSyncPace = "gentle" | "normal";
export type SearchSyncRetentionMonths = 3 | 6 | 12 | 16;
export type SearchSyncPreflightPlan = {
  daysTotal: number;
  pace: SearchSyncPace;
  retentionMonths: SearchSyncRetentionMonths;
};
export const SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY = 3;
export const NORMAL_SEARCH_SYNC_REQUEST_SETS_PER_HOUR = 42;
const PLAN_DAYS: Record<SearchSyncRetentionMonths, number> = { 3: 93, 6: 185, 12: 366, 16: 488 };
const REQUEST_BUDGET_FACTOR = 1.3;

export function searchSyncRequestSetsPerHour(pace: SearchSyncPace) {
  return pace === "gentle"
    ? NORMAL_SEARCH_SYNC_REQUEST_SETS_PER_HOUR / 2
    : NORMAL_SEARCH_SYNC_REQUEST_SETS_PER_HOUR;
}

export function plannedRemainingRequests(input: {
  daysDone: number;
  daysTotal: number;
  planned: boolean;
}) {
  const remainingDays = Math.max(0, input.daysTotal - input.daysDone);
  const planningCalls = input.planned ? 0 : 2;
  const knownRequestSets = remainingDays * SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY + planningCalls;
  const plannedRequestBudget = Math.ceil(knownRequestSets * REQUEST_BUDGET_FACTOR);
  return {
    knownRequestSets,
    plannedRequestBudget,
    reserveRequestSets: plannedRequestBudget - knownRequestSets,
  };
}

function roundedRequestLabel(value: number) {
  return Math.round(value / 100) * 100;
}

function durationLabel(hours: number) {
  if (hours < 24) return `about ${Math.round(hours)} hours`;
  const days = hours / 24;
  if (Math.abs(days - Math.round(days)) < 0.15) return `${Math.round(days)} days`;
  return `about ${(Math.round(days * 2) / 2).toLocaleString("en-US")} days`;
}

export function searchSyncPlanSummary(input: {
  pace: SearchSyncPace;
  retentionMonths: SearchSyncRetentionMonths;
}) {
  const daysTotal = PLAN_DAYS[input.retentionMonths];
  const budget = plannedRemainingRequests({ daysDone: 0, daysTotal, planned: false });
  return {
    daysTotal,
    duration: durationLabel(budget.plannedRequestBudget / searchSyncRequestSetsPerHour(input.pace)),
    ...budget,
    requests: `about ${roundedRequestLabel(budget.plannedRequestBudget).toLocaleString("en-US")}`,
    retentionMonths: input.retentionMonths,
  };
}

export function searchSyncPreflightCopy(input: Parameters<typeof searchSyncPlanSummary>[0]) {
  const summary = searchSyncPlanSummary(input);
  return `Importing ${summary.retentionMonths} months takes ${summary.requests} requests to Google, spread over ${summary.duration.startsWith("about ") ? summary.duration : `about ${summary.duration}`}.`;
}

// A single incremental run stays bounded: a worker that was down for a month catches
// up over consecutive runs instead of holding one activity open for hours.
export const MAX_INCREMENTAL_DAYS = 30;

// The freshness fallback can name a not-yet-final boundary, so each advancing sweep rereads a tail.
export const INCREMENTAL_TRAILING_DAYS = 3;

export type BackfillPlan = {
  daysTotal: number;
  earliestTargetDate: string;
};

// The oldest day the provider still serves, measured from the newest finalized day
// rather than from today, so the plan does not shift while the backfill runs.
export function planBackfill(input: {
  firstDataDate?: string;
  newestFinalizedDate: string;
  retentionMonths?: number;
}): BackfillPlan {
  const retentionFloor = monthsBefore(
    input.newestFinalizedDate,
    input.retentionMonths ?? RETENTION_MONTHS,
  );
  const earliestTargetDate =
    input.firstDataDate && input.firstDataDate > retentionFloor
      ? input.firstDataDate
      : retentionFloor;
  return {
    daysTotal: diffDays(earliestTargetDate, input.newestFinalizedDate) + 1,
    earliestTargetDate,
  };
}

// Newest first: the default 28-day view is readable long before the oldest month lands.
export function nextPartitions(input: {
  batchSize: number;
  cursorDate: string;
  earliestTargetDate: string;
}): string[] {
  const days: string[] = [];
  let cursor = input.cursorDate;
  while (days.length < input.batchSize && cursor >= input.earliestTargetDate) {
    days.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

export type DateRange = { end: string; start: string };

// One report carries all dates in a range, so session ingestion walks the same history in
// ranges rather than spending a provider request on every individual day.
export function nextDateRanges(input: {
  batchSize: number;
  cursorDate: string;
  earliestTargetDate: string;
  rangeDays?: number;
}): DateRange[] {
  const ranges: DateRange[] = [];
  const width = input.rangeDays ?? 30;
  let end = input.cursorDate;
  while (ranges.length < input.batchSize && end >= input.earliestTargetDate) {
    const start = addDays(end, -(width - 1));
    ranges.push({
      end,
      start: start < input.earliestTargetDate ? input.earliestTargetDate : start,
    });
    end = addDays(ranges.at(-1)?.start ?? end, -1);
  }
  return ranges;
}

// Oldest first, so a partial catch-up still leaves a contiguous stored range.
export function incrementalDays(input: {
  finalizedThroughDate: string | null;
  newestFinalizedDate: string;
}): string[] {
  if (!input.finalizedThroughDate) return [input.newestFinalizedDate];
  const days: string[] = [];
  const firstNewDay = addDays(input.finalizedThroughDate, 1);
  if (firstNewDay > input.newestFinalizedDate) return days;
  let cursor = addDays(firstNewDay, -(INCREMENTAL_TRAILING_DAYS - 1));
  while (cursor <= input.newestFinalizedDate && days.length < MAX_INCREMENTAL_DAYS) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

// A successful read proves a pause or a failure is over, but the state that follows comes from
// the cursor, never a hardcoded "running": an import whose cursor already walked past the oldest
// target day is completed, and reviving it as "running" would leave the manual sync answering
// "already_running" forever.
// The workflow id survives only while the execution behind it does. A quota pause is a sleeping
// backfill that wakes on its own, so it keeps its id; a failure and a lost authorization both
// closed their execution, and a stored id nothing can resume would block the manual sync forever.
export function resumedImportState(input: {
  cursorDate: string | null;
  earliestTargetDate: string | null;
  pausedReason?: string | null;
  state: string;
}): { pausedReason?: "error"; state?: "completed" | "paused" | "running"; workflowId?: null } {
  if (input.pausedReason === "user") return {};
  if (input.state !== "failed" && input.state !== "paused") return {};
  const backfilled = Boolean(
    input.cursorDate && input.earliestTargetDate && input.cursorDate < input.earliestTargetDate,
  );
  const executionClosed = input.state === "failed" || input.pausedReason === "needs_reauth";
  if (backfilled) {
    return { state: "completed", ...(executionClosed ? { workflowId: null } : {}) };
  }
  // An unfinished import the workflow gave up on has no execution behind it, so it is parked
  // as a pause with its id released: the next render starts a fresh backfill from the cursor,
  // and calling it "running" would show a progress bar nothing is moving.
  if (input.state === "failed") {
    return { pausedReason: "error", state: "paused", workflowId: null };
  }
  return { state: "running", ...(executionClosed ? { workflowId: null } : {}) };
}
