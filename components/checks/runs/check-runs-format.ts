import type {
  CheckAttempt,
  CheckRange,
  CheckRunFilter,
  CheckRunRow,
  DeferredGroup,
} from "@/lib/checks/contract";
import { centsToDollars } from "@/lib/format/currency";
import { relativePast } from "@/lib/format/relative-time";

const money = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 6,
  minimumFractionDigits: 2,
  style: "currency",
});

export const rangeOptions = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

export const rangeCopy: Record<CheckRange, { caption: string; window: string }> = {
  "24h": { caption: "last 24 hours", window: "in the last 24 hours" },
  "7d": { caption: "last 7 days", window: "in the last 7 days" },
  "30d": { caption: "last 30 days", window: "in the last 30 days" },
};

export function formatMoney(cents: number) {
  return money.format(centsToDollars(cents));
}

export function formatRunCost(run: CheckRunRow) {
  if (run.status === "failed") return "-";
  if (typeof run.costCents === "number") return formatMoney(run.costCents);
  if (typeof run.estimatedCostCents === "number") {
    return `~${formatMoney(run.estimatedCostCents)}`;
  }
  return run.status === "running" ? "~" : "-";
}

export function formatDuration(durationMs: number | null) {
  if (durationMs === null) return null;
  if (durationMs < 1_000) return `${durationMs}ms`;
  if (durationMs < 60_000) {
    const seconds = durationMs / 1_000;
    return `${Number(seconds.toFixed(seconds < 10 ? 1 : 0))}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatElapsed(startedAt: string | null, now: Date) {
  if (!startedAt) return "Running";
  return formatDuration(Math.max(0, now.getTime() - new Date(startedAt).getTime())) ?? "Running";
}

export function formatWhen(run: CheckRunRow, now: Date) {
  return relativePast(new Date(run.checkedAt), now);
}

export const INTERNAL_ERROR_LABEL = "Internal error during check";

// Replace raw internal error shapes with a safe label in the user-facing result cell.
export function isInternalErrorString(error: string): boolean {
  const trimmed = error.trim();
  return (
    trimmed.length > 120 ||
    trimmed.includes("`") ||
    /[\n\r]/.test(trimmed) ||
    /\bprisma\b/i.test(trimmed) ||
    /\binvocation\b/i.test(trimmed) ||
    /\bat\s+\S+\s*\(/.test(trimmed) ||
    /\b\w+Error\b/.test(trimmed)
  );
}

// The short, user-facing label for a stored error. Known infra shapes collapse to
// a neutral label; concise human errors pass through unchanged.
export function presentCheckError(error: string): string {
  return isInternalErrorString(error) ? INTERNAL_ERROR_LABEL : error.trim();
}

export function formatResult(run: CheckRunRow, now: Date) {
  if (run.status === "running") return formatElapsed(run.startedAt, now);
  if (run.status === "failed") {
    if (
      run.error &&
      (/\bstale\b/i.test(run.error) || /time(?:d)?\s*out|timeout/i.test(run.error))
    ) {
      return "Timed out after 15 min";
    }
    return run.error ? presentCheckError(run.error) : "All providers failed";
  }
  return typeof run.position === "number" ? `#${run.position}` : "No position";
}

export function formatAttemptOutcome(attempt: CheckAttempt) {
  const fallback = {
    credentials_unavailable: "Credentials unavailable",
    ok: "Completed",
    provider_failed: "Provider error",
    rate_limited: "Rate limited",
  }[attempt.outcome];
  if (!attempt.detail) return fallback;
  const code = attempt.detail.match(/\b[1-5]\d{2}\b/)?.[0];
  const withoutCode = attempt.detail
    .replace(/\s*\(?[1-5]\d{2}\)?\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const detail = withoutCode
    ? `${withoutCode.slice(0, 1).toUpperCase()}${withoutCode.slice(1)}`
    : fallback;
  return code ? `${detail} (${code})` : detail;
}

export function totalForFilter(filter: CheckRunFilter, counts: CheckRunsViewCounts) {
  if (filter === "all") return counts.runs;
  if (filter === "fallback") return counts.viaFallback;
  return counts[filter];
}

type CheckRunsViewCounts = {
  completed: number;
  deferred: number;
  failed: number;
  running: number;
  runs: number;
  viaFallback: number;
};

function calendarDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(date);
}

export function deferredWindow(group: DeferredGroup, now: Date, timeZone: string) {
  const first = new Date(group.firstAt);
  const last = new Date(group.lastAt);
  const date = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone,
  });
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  });
  const today =
    calendarDay(first, timeZone) === calendarDay(now, timeZone) &&
    calendarDay(last, timeZone) === calendarDay(now, timeZone);
  if (today) return `today ${time.format(first)}-${time.format(last)}`;
  return `${date.format(first)}, ${time.format(first)} - ${date.format(last)}, ${time.format(last)}`;
}
