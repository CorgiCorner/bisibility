import { trackingPriceBound } from "@/lib/ai-tracking/admission/pricing";
import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { recurringQuoteCents } from "@/lib/local-monitor-recurring/cost";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { countCronRuns, cronHasCalendarRestriction } from "@/lib/rank-check/cron-count";
import type { PlannerScheduleCadence } from "@/lib/rank-check/planner/occurrence";
import { scheduleProviderId } from "@/lib/rank-check/schedules/provider-policy";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/constants";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_WINDOW_DAYS = 30;
/** Custom crons are counted across this sample, then scaled to REVIEW_WINDOW_DAYS. */
const REVIEW_SAMPLE_DAYS = 365;
/** Four years, so a Feb 29 or any yearly date is inside the sample. */
const REVIEW_HORIZON_DAYS = 1461;
const DAILY_RUNS_PER_30_DAYS = 30;
/** A 365-day sample contains 365/7 weeks, so 30 days contain 30/7 weekly runs. */
const WEEKLY_RUNS_PER_30_DAYS = 30 / 7;
const MONTHLY_RUNS_PER_30_DAYS = (DAILY_RUNS_PER_30_DAYS * 12) / 365;
const CRON_COUNT_CACHE_LIMIT = 64;
const cronCountCache = new Map<string, number | null>();

function cachedCronRuns(expression: string, start: Date, end: Date, timezone: string) {
  const key = `${expression}\0${timezone}\0${start.getTime()}\0${end.getTime()}`;
  const cached = cronCountCache.get(key);
  if (cached !== undefined) return cached;
  const count = countCronRuns(expression, start, end, timezone);
  cronCountCache.set(key, count);
  if (cronCountCache.size > CRON_COUNT_CACHE_LIMIT) {
    const oldest = cronCountCache.keys().next().value;
    if (oldest !== undefined) cronCountCache.delete(oldest);
  }
  return count;
}

export type ReviewFrequency = PlannerScheduleCadence["frequency"];

export type ReviewCadence = {
  archived: boolean;
  cronExpression: string | null;
  enabled: boolean;
  frequency: ReviewFrequency;
  jitterMinutes: number;
  publicId: string;
  serpDepth: number | null;
  timeOfDay: string | null;
  timezone: string;
};

/** Next UTC midnight, then 30 days. Hour-shifted daily crons land on the same dates. */
export function reviewWindow(now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { start: new Date(start), end: new Date(start + REVIEW_WINDOW_DAYS * DAY_MS) };
}

function sampleStart(now: Date, windowStart?: Date) {
  return windowStart ?? reviewWindow(now).start;
}

/**
 * Runs per 30 days. Daily is 30, weekly is 30/7, and monthly is 30 * 12 / 365.
 * Weekly uses the same 365-day denominator as a counted cron (365/7 weeks).
 * A custom cron is counted across the next 365 days and scaled by 30/365.
 * Zero means the cron does not match in that year.
 */
export function reviewOccurrences(
  cadence: ReviewCadence,
  now: Date,
  windowStart?: Date,
): number | null {
  if (
    cadence.frequency === "manual" ||
    cadence.frequency === "paused" ||
    !cadence.enabled ||
    cadence.archived
  ) {
    return 0;
  }
  if (cadence.frequency === "daily") return DAILY_RUNS_PER_30_DAYS;
  if (cadence.frequency === "weekly") return WEEKLY_RUNS_PER_30_DAYS;
  if (cadence.frequency === "monthly") return MONTHLY_RUNS_PER_30_DAYS;
  const start = sampleStart(now, windowStart);
  if (cadence.frequency !== "custom_cron" || !cadence.cronExpression) return null;
  const count = cachedCronRuns(
    cadence.cronExpression,
    start,
    new Date(start.getTime() + REVIEW_SAMPLE_DAYS * DAY_MS),
    cadence.timezone || "UTC",
  );
  if (count === null) return null;
  return (count * REVIEW_WINDOW_DAYS) / REVIEW_SAMPLE_DAYS;
}

/**
 * Runs a cadence can have in one 30-day review window.
 * A named frequency is not pinned to a civil day. Daily fires every day of the
 * window, so it is 30..30. Weekly fires on one weekday, and 30 days is four
 * weeks plus two days, so it is 4..5. Monthly fires on one month-day. Month
 * lengths are 28 to 31 days, so a movable month-day occurs once or twice in
 * the window: 1..2. A pinned month-day can miss the window when the gap is 31
 * days; the named band stays 1..2 because the cadence is not pinned.
 * A custom cron has a fixed expression, so both bounds are its exact count.
 */
const NAMED_WINDOW_BOUNDS: Partial<Record<ReviewFrequency, { max: number; min: number }>> = {
  daily: { max: DAILY_RUNS_PER_30_DAYS, min: DAILY_RUNS_PER_30_DAYS },
  monthly: { max: 2, min: 1 },
  weekly: { max: 5, min: 4 },
};
const NAMED_FREQUENCIES = new Set<ReviewFrequency>(["daily", "monthly", "weekly"]);
/** One firing in the 365-day sample, scaled onto the 30-day rate. */
const SAMPLE_FIRING_SLACK = REVIEW_WINDOW_DAYS / REVIEW_SAMPLE_DAYS;
/** Float rounding allowance when a scaled run difference is compared with one whole firing. */
const WHOLE_FIRING_TOLERANCE = 1e-9;

export function reviewWindowRunBounds(
  cadence: ReviewCadence | null | undefined,
  now: Date,
  windowStart?: Date,
): { max: number; min: number } | null {
  if (!cadence || !cadenceIsActive(cadence)) return { max: 0, min: 0 };
  const named = NAMED_WINDOW_BOUNDS[cadence.frequency];
  if (named) return named;
  const exact = reviewWindowRuns(cadence, now, windowStart);
  if (exact === null) return null;
  return { max: exact, min: exact };
}

function boundedCost(runs: number, price: number) {
  return Number((price * runs).toFixed(6));
}

/** True only when the after side's cheapest window still costs more than the before side's fullest window. */
export function nearTermCostIncreased(
  before: { cadence: ReviewCadence | null | undefined; perRunCents: number | null },
  after: { cadence: ReviewCadence | null | undefined; perRunCents: number | null },
  now: Date,
  windowStart?: Date,
) {
  if (before.perRunCents === null || after.perRunCents === null) return false;
  if (after.perRunCents <= 0) return false;
  const afterBounds = reviewWindowRunBounds(after.cadence, now, windowStart);
  // A zero minimum cannot exceed a non-negative before side, so the before count can be skipped.
  if (!afterBounds || afterBounds.min === 0) return false;
  const beforeBounds = reviewWindowRunBounds(before.cadence, now, windowStart);
  if (!beforeBounds) return false;
  return (
    boundedCost(afterBounds.min, after.perRunCents) >
    boundedCost(beforeBounds.max, before.perRunCents)
  );
}

/**
 * Ordinary 30-day projection. A named rate is an average (weekly is 30/7) and a
 * matching custom cron counts whole firings, so one weekday is 52 or 53 days in
 * the sample and the scaled rates differ by less than one sample firing. That
 * gap is not a faster schedule; a difference of one whole firing or more is. Two custom crons, and two named frequencies,
 * stay on a strict cents comparison, so one yearly run becoming two still
 * reviews. Five month-days versus weekly is several extra firings and still reviews.
 */
export function projectionCostIncreased(
  before: { cents: number; frequency: ReviewFrequency | null; perRunCents: number; runs: number },
  after: { cents: number; frequency: ReviewFrequency | null; perRunCents: number; runs: number },
) {
  if (before.perRunCents !== after.perRunCents) return after.cents > before.cents;
  if (
    !before.frequency ||
    !after.frequency ||
    NAMED_FREQUENCIES.has(before.frequency) === NAMED_FREQUENCIES.has(after.frequency)
  ) {
    return after.cents > before.cents;
  }
  // Count the difference in whole sample firings. The averaging gap is below one
  // (weekly 365/7 against 53 weekdays is 0.857); one whole extra firing per year,
  // such as eleven month-days becoming monthly, is a real increase and reviews.
  const extraFirings = (after.runs - before.runs) / SAMPLE_FIRING_SLACK;
  return extraFirings > 1 - WHOLE_FIRING_TOLERANCE;
}

/** Runs inside the next 30-day review window. Named cadences reuse reviewOccurrences. */
export function reviewWindowRuns(
  cadence: ReviewCadence | null | undefined,
  now: Date,
  windowStart?: Date,
): number | null {
  if (!cadence || !cadenceIsActive(cadence)) return 0;
  if (cadence.frequency !== "custom_cron") return reviewOccurrences(cadence, now, windowStart);
  if (!cadence.cronExpression) return null;
  const start = sampleStart(now, windowStart);
  return cachedCronRuns(
    cadence.cronExpression,
    start,
    new Date(start.getTime() + REVIEW_WINDOW_DAYS * DAY_MS),
    cadence.timezone || "UTC",
  );
}

/** Four-year custom-cron runs. Unrestricted calendars reuse the 365-day sample. */
export function reviewHorizonRuns(
  cadence: ReviewCadence | null | undefined,
  now: Date,
  windowStart?: Date,
): number | null {
  if (
    !cadence ||
    !cadenceIsActive(cadence) ||
    cadence.frequency !== "custom_cron" ||
    !cadence.cronExpression
  ) {
    return null;
  }
  if (!cronHasCalendarRestriction(cadence.cronExpression)) {
    const runs = reviewOccurrences(cadence, now, windowStart);
    return runs === null ? null : (runs * REVIEW_HORIZON_DAYS) / REVIEW_WINDOW_DAYS;
  }
  const start = sampleStart(now, windowStart);
  return cachedCronRuns(
    cadence.cronExpression,
    start,
    new Date(start.getTime() + REVIEW_HORIZON_DAYS * DAY_MS),
    cadence.timezone || "UTC",
  );
}

export function cadenceIsActive(cadence: ReviewCadence | null) {
  return Boolean(
    cadence?.enabled &&
      !cadence.archived &&
      cadence.frequency !== "manual" &&
      cadence.frequency !== "paused",
  );
}

/** A named policy prices itself. `project` and null use the project's connected provider. */
export function providerForPolicy(
  policy: string | null | undefined,
  projectProvider: string | null,
): string | null {
  if (policy && policy !== "project") return policy;
  return projectProvider;
}

export function rankUnitCents(depth: SerpDepth, providerPolicy: string | null): number | null {
  const providerId = scheduleProviderId(providerPolicy);
  if (!providerId) return null;
  return unitCostCentsFor(
    {
      overrideCents: null,
      providerId,
      rateContext: LIST_PROVIDER_RATE_CONTEXT,
    },
    depth,
  );
}

/** Per-prompt cents for one run. Member count is applied by the projection. */
export function aiUnitCents(
  configurations: readonly SourceConfiguration[],
  now: Date,
): number | null {
  if (configurations.length === 0) return null;
  try {
    return configurations.reduce(
      (sum, configuration) => sum + trackingPriceBound(configuration, now.getTime()) * 100,
      0,
    );
  } catch {
    return null;
  }
}

/** The stored recurring quote is the per-run price. The planner supplies the run count. */
export function localMonitorUnitCents(quote: LocalQuote | null): number | null {
  if (!quote) return null;
  try {
    const cents = Number(recurringQuoteCents(quote));
    return Number.isFinite(cents) && cents >= 0 ? cents : null;
  } catch {
    return null;
  }
}

export function projectMemberCents(
  cadence: ReviewCadence | null,
  members: number,
  unitCents: number | null,
  projectDepth: number,
  now: Date,
  windowStart?: Date,
) {
  if (!cadenceIsActive(cadence) || members <= 0) return { cents: 0, weight: 0 };
  const runs = reviewOccurrences(cadence as ReviewCadence, now, windowStart);
  const depth = resolveSerpDepth((cadence as ReviewCadence).serpDepth ?? projectDepth);
  if (runs === null) return { cents: null, weight: null };
  const weight = runs * pagesPerCheck(depth) * members;
  const cents = unitCents === null ? null : Number((unitCents * members * runs).toFixed(6));
  return { cents, weight };
}
