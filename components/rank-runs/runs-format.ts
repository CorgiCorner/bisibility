import type { DateFormat } from "@/lib/dates/format";
import { selectionTableLabel } from "@/lib/rank-check/runs/selection-label";
import type { RankRunRecord } from "./runs-types";

const triggerLabels = {
  api: "API",
  manual: "Manual run",
  retry: "Retry",
  scheduled: "Scheduled",
} as const;

export function countWithNoun(value: number, noun: string): string {
  const count = value.toLocaleString("en-US");
  return `${count} ${value === 1 ? noun : `${noun}s`}`;
}

export function isSkippedOccurrence(
  run: Pick<RankRunRecord, "finishedAt" | "launchedAt" | "status">,
) {
  return run.status === "cancelled" && run.launchedAt === null && run.finishedAt !== null;
}

function plannedDateParts(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
}

function plannedDayKey(value: string, timeZone: string) {
  const parts = plannedDateParts(value, timeZone);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function plannedRunDayKey(value: string | null, timeZone: string) {
  return value ? plannedDayKey(value, timeZone) : "unscheduled";
}

export function formatPlannedDay(value: string | null, dateFormat: DateFormat, timeZone: string) {
  if (!value) return "Unscheduled";
  const parts = plannedDateParts(value, timeZone);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  const key = `${part("year")}-${part("month")}-${part("day")}`;
  if (dateFormat === "iso") return key;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone }).format(
    new Date(value),
  );
  return dateFormat === "day_first"
    ? `${Number(part("day"))} ${month} ${part("year")}`
    : `${month} ${Number(part("day"))}, ${part("year")}`;
}

export function formatDuration(run: RankRunRecord) {
  if (!run.startedAt) return "-";
  if (!run.finishedAt) return "In progress";
  const milliseconds = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
  return `${Math.round(milliseconds / 60_000)}m`;
}

export function formatElapsed(
  startedAt: string | null,
  finishedAt: string | null,
  now: string,
): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt ?? now).getTime();
  const seconds = Math.floor((end - start) / 1_000);
  if (!Number.isFinite(seconds) || seconds < 0) return "-";

  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min ${remainingSeconds} s`;
  if (minutes > 0) return `${minutes} min ${remainingSeconds} s`;
  return `${remainingSeconds} s`;
}

export function runCounts(run: RankRunRecord) {
  if (isSkippedOccurrence(run)) {
    return `0 / ${run.counts.total.toLocaleString("en-US")} targets`;
  }
  const { cancelled, completed, deferred, failed, total } = run.counts;
  const processed = completed + deferred + failed + cancelled;
  return `${processed.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} targets`;
}

export function selectionLabel(run: RankRunRecord) {
  return selectionTableLabel(run.selectionKind);
}

export function triggerLabel(run: RankRunRecord) {
  return triggerLabels[run.trigger];
}
