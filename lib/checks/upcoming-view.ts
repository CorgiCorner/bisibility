import { defaultCostPerCheckCents } from "@/lib/rank-check/default-cost";
import { resolveSerpDepth } from "@/lib/serp/markets";
import type { UpcomingBlockReason, UpcomingDayGroup, UpcomingView } from "./contract";

const DAY_MS = 86_400_000;

export type UpcomingScheduleSource = {
  frequency: string;
  keyword: string;
  keywordId: string;
  keywordPublicId: string;
  nextCheckAt: Date;
  serpDepth: number | null;
};

export type UpcomingProviderSource = {
  provider: string;
  providerLabel: string;
};

export type UpcomingViewInput = {
  blockedReason: UpcomingBlockReason | null;
  budgetCapCents: number;
  now: Date;
  projectTimezone: string;
  providers: readonly UpcomingProviderSource[];
  schedules: readonly UpcomingScheduleSource[];
  spentCents: number;
};

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function zonedDay(date: Date, timeZone: string) {
  const { day, month, year } = zonedDateParts(date, timeZone);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dayKey(date: Date, timeZone: string) {
  const { day, month, year } = zonedDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayLabel(date: Date, now: Date, timeZone: string) {
  const offset = zonedDay(date, timeZone) - zonedDay(now, timeZone);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(date);
}

function primaryProvider(providers: readonly UpcomingProviderSource[]) {
  return providers[0] ?? null;
}

export function upcomingProviderSummary(providers: readonly UpcomingProviderSource[]) {
  const primary = primaryProvider(providers);
  if (!primary) return "No provider connected";
  const fallbackCount = Math.max(0, providers.length - 1);
  return fallbackCount > 0
    ? `${primary.providerLabel} +${fallbackCount} fallback`
    : primary.providerLabel;
}

function scheduleCost(
  schedule: UpcomingScheduleSource,
  providers: readonly UpcomingProviderSource[],
) {
  return defaultCostPerCheckCents(
    primaryProvider(providers)?.provider,
    resolveSerpDepth(schedule.serpDepth ?? undefined),
  );
}

function dayGroups(input: UpcomingViewInput): UpcomingDayGroup[] {
  const startDay = zonedDay(input.now, input.projectTimezone);
  const groups = new Map<string, UpcomingDayGroup>();
  const schedules = [...input.schedules].sort(
    (left, right) =>
      left.nextCheckAt.getTime() - right.nextCheckAt.getTime() ||
      left.keyword.localeCompare(right.keyword) ||
      left.keywordPublicId.localeCompare(right.keywordPublicId),
  );

  for (const schedule of schedules) {
    const dayOffset = zonedDay(schedule.nextCheckAt, input.projectTimezone) - startDay;
    if (schedule.nextCheckAt < input.now || dayOffset < 0 || dayOffset > 6) continue;
    const key = dayKey(schedule.nextCheckAt, input.projectTimezone);
    const existing = groups.get(key);
    const sample = {
      frequency: schedule.frequency,
      keyword: schedule.keyword,
      keywordId: schedule.keywordId,
      keywordPublicId: schedule.keywordPublicId,
      nextCheckAt: schedule.nextCheckAt.toISOString(),
    };
    if (!existing) {
      groups.set(key, {
        count: 1,
        estimatedCostCents: scheduleCost(schedule, input.providers),
        key,
        label: dayLabel(schedule.nextCheckAt, input.now, input.projectTimezone),
        samples: [sample],
      });
      continue;
    }
    existing.count += 1;
    existing.estimatedCostCents += scheduleCost(schedule, input.providers);
    if (existing.samples.length < 3) existing.samples.push(sample);
  }

  return [...groups.values()];
}

function next48hCents(input: UpcomingViewInput) {
  const until = input.now.getTime() + 2 * DAY_MS;
  return input.schedules.reduce((sum, schedule) => {
    const scheduledAt = schedule.nextCheckAt.getTime();
    return scheduledAt >= input.now.getTime() && scheduledAt <= until
      ? sum + scheduleCost(schedule, input.providers)
      : sum;
  }, 0);
}

function observedDailySpend(input: UpcomingViewInput) {
  const monthStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1);
  const elapsedDays = Math.max((input.now.getTime() - monthStart) / DAY_MS, 1);
  return Math.max(0, input.spentCents) / elapsedDays;
}

export function buildUpcomingView(input: UpcomingViewInput): UpcomingView {
  const next48h = next48hCents(input);
  const dailyRate = observedDailySpend(input);
  const remaining = Math.max(0, input.budgetCapCents - input.spentCents);
  const capLastsUntil =
    dailyRate > 0
      ? new Date(input.now.getTime() + (remaining / dailyRate) * DAY_MS).toISOString()
      : null;

  return {
    blocked:
      input.blockedReason && input.schedules.length > 0
        ? [{ keywordCount: input.schedules.length, reason: input.blockedReason }]
        : [],
    days: dayGroups(input),
    forecast: {
      capCents: input.budgetCapCents,
      capLastsUntil,
      next48hCents: next48h,
      spentCents: input.spentCents,
    },
    providerSummary: upcomingProviderSummary(input.providers),
    timeZone: input.projectTimezone,
  };
}
