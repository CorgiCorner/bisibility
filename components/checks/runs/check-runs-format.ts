import type {
  CheckAttempt,
  CheckRange,
  CheckRunFilter,
  CheckRunRow,
  DeferredGroup,
} from "@/lib/checks/contract";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateRange } from "@/lib/dates/format";
import { centsToDollars } from "@/lib/format/currency";
import type { useTranslations } from "next-intl";

export type CheckRunsTranslations = ReturnType<typeof useTranslations<"projectRankTracker.checks">>;

type FormatContext = {
  locale: string;
  t: CheckRunsTranslations;
};

export const rangeValues = ["24h", "7d", "30d"] as const;

const rangeCaptionKeys = {
  "24h": "range24hCaption",
  "30d": "range30dCaption",
  "7d": "range7dCaption",
} as const satisfies Record<CheckRange, "range24hCaption" | "range7dCaption" | "range30dCaption">;

const rangeWindowKeys = {
  "24h": "range24hWindow",
  "30d": "range30dWindow",
  "7d": "range7dWindow",
} as const satisfies Record<CheckRange, "range24hWindow" | "range7dWindow" | "range30dWindow">;

export function rangeCaption(range: CheckRange, t: CheckRunsTranslations) {
  return t(rangeCaptionKeys[range]);
}

export function rangeWindow(range: CheckRange, t: CheckRunsTranslations) {
  return t(rangeWindowKeys[range]);
}

export function formatCount(count: number, { locale }: Pick<FormatContext, "locale">) {
  return new Intl.NumberFormat(locale).format(count);
}

export function formatMoney(cents: number, { locale }: Pick<FormatContext, "locale">) {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(centsToDollars(cents));
}

export function formatRunCost(run: CheckRunRow, context: FormatContext) {
  if (run.status === "failed") return context.t("notAvailable");
  if (typeof run.costCents === "number") return formatMoney(run.costCents, context);
  if (typeof run.estimatedCostCents === "number") {
    return context.t("estimatedCost", { amount: formatMoney(run.estimatedCostCents, context) });
  }
  return run.status === "running" ? context.t("estimatedOnly") : context.t("notAvailable");
}

export function formatDuration(durationMs: number | null, context: Pick<FormatContext, "t">) {
  if (durationMs === null) return null;
  if (durationMs < 1_000) return context.t("durationMilliseconds", { count: durationMs });
  if (durationMs < 60_000) {
    const seconds = durationMs / 1_000;
    return context.t("durationSeconds", { count: Number(seconds.toFixed(seconds < 10 ? 1 : 0)) });
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return seconds > 0
    ? context.t("durationMinutesSeconds", { minutes, seconds })
    : context.t("durationMinutes", { count: minutes });
}

export function formatElapsed(
  startedAt: string | null,
  now: Date,
  context: Pick<FormatContext, "t">,
) {
  if (!startedAt) return context.t("running");
  return (
    formatDuration(Math.max(0, now.getTime() - new Date(startedAt).getTime()), context) ??
    context.t("running")
  );
}

export function formatWhen(run: CheckRunRow, now: Date, context: Pick<FormatContext, "t">) {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(run.checkedAt).getTime()) / 60_000),
  );
  if (minutes < 1) return context.t("justNow");
  if (minutes < 60) return context.t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return context.t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? context.t("yesterday") : context.t("daysAgo", { count: days });
}

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

export function presentCheckError(error: string, t: CheckRunsTranslations): string {
  return isInternalErrorString(error) ? t("internalError") : error.trim();
}

export function formatResult(run: CheckRunRow, now: Date, context: FormatContext) {
  if (run.status === "running") return formatElapsed(run.startedAt, now, context);
  if (run.status === "failed") return context.t("allProvidersFailed");
  return typeof run.position === "number"
    ? context.t("position", { position: run.position })
    : context.t("noPosition");
}

function claimsAttemptSuccess(detail: string) {
  return /^(?:ok|completed|success|successful|succeeded)[.!]?$/i.test(detail.trim());
}

export function formatAttemptOutcome(
  attempt: CheckAttempt,
  context: Pick<FormatContext, "t">,
  failedRun = false,
) {
  if (failedRun && attempt.outcome === "ok") return context.t("providerError");
  const fallback = {
    credentials_unavailable: context.t("credentialsUnavailable"),
    ok: context.t("completed"),
    provider_failed: context.t("providerError"),
    rate_limited: context.t("rateLimited"),
  }[attempt.outcome];
  if (!attempt.detail || (attempt.outcome !== "ok" && claimsAttemptSuccess(attempt.detail))) {
    return fallback;
  }
  const code = attempt.detail.match(/\b[1-5]\d{2}\b/)?.[0];
  const withoutCode = attempt.detail
    .replace(/\s*\(?[1-5]\d{2}\)?\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const detail = withoutCode
    ? `${withoutCode.slice(0, 1).toUpperCase()}${withoutCode.slice(1)}`
    : fallback;
  return code ? context.t("detailWithCode", { code, detail }) : detail;
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
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function clock(date: Date, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function deferredWindow(
  group: DeferredGroup,
  now: Date,
  timeZone: string,
  dateDisplay: DateDisplayContext,
  context: FormatContext,
) {
  const first = new Date(group.firstAt);
  const last = new Date(group.lastAt);
  const firstDay = calendarDay(first, timeZone);
  const lastDay = calendarDay(last, timeZone);
  const today = firstDay === calendarDay(now, timeZone) && lastDay === calendarDay(now, timeZone);
  if (today) {
    return context.t("deferredToday", {
      end: clock(last, timeZone, context.locale),
      start: clock(first, timeZone, context.locale),
    });
  }
  return context.t("deferredRange", {
    end: `${formatDisplayDateRange(lastDay, lastDay, dateDisplay)}, ${clock(last, timeZone, context.locale)}`,
    start: `${formatDisplayDateRange(firstDay, firstDay, dateDisplay)}, ${clock(first, timeZone, context.locale)}`,
  });
}
