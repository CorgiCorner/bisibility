import { checksPerRun, RUNS_PER_MONTH } from "@/lib/cost-estimate/estimate";
import {
  type ParsedCronExpression,
  parseCronExpression as parseRuntimeCronExpression,
} from "@/lib/rank-check/cron";
import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import type {
  SearchImportQueueFacts,
  SearchImportRuntimeFacts,
} from "@/lib/search-insights/sync/control-model";
import type { SerpDepth } from "@/lib/serp/markets";
import { rankScheduleTiming } from "@/lib/settings/rank-schedule-timing";

export { serpMarketOptions as countryOptions } from "@/lib/serp/markets";

import type { ProviderIconName } from "@/lib/integrations/types";
import type { ProviderTint } from "@/lib/providers/registry";
import type { StatusKind } from "@/lib/ui/status-kind";

export const frequencyOptions = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Manual", value: "manual" },
  { label: "Paused", value: "paused" },
  { label: "Custom cron", value: "custom_cron" },
] as const;

export type RankCheckFrequency = (typeof frequencyOptions)[number]["value"];

export type KeywordSchedule = {
  frequency: RankCheckFrequency;
  cron_expression: string | null;
  timezone: string;
  jitter_minutes: number;
  last_checked_at: string | null;
  next_check_at: string | null;
};

export type DefaultsData = {
  city: string | null;
  country: string;
  device: string;
  keywordCount: number;
  inspectionDailyLimit: number;
  searchSync?: {
    firstDataDate: string | null;
    firstDataDateLabel: string | null;
    lastQuotaPausedAt: string | null;
    pace: "normal" | "gentle";
    newestFinalizedDate: string | null;
    observability?: ImportObservabilityFacts;
    plannedRemaining: number;
    queue?: SearchImportQueueFacts;
    requestsToday: number;
    retentionMonths: 3 | 6 | 12 | 16;
    runtime?: SearchImportRuntimeFacts;
  };
  locationKey: string;
  locationLabel: string;
  locationCount: number;
  serpDepth: SerpDepth;
  serpStopOnMatch: boolean;
  deviceCount: number;
  costPerCheck: number;
  schedule: KeywordSchedule;
  targetUrlCount: number;
};

export type ProviderSummaryData = {
  icon: ProviderIconName;
  logoDomain?: string;
  name: string;
  detail: string;
  status: StatusKind;
  primary?: boolean;
  tint: ProviderTint;
};

export type {
  ProviderAvailabilityData,
  ProviderConnectionUsageData,
  ProviderUsageData,
  ProviderUsageFeature,
  ProviderUsageStat,
} from "./provider-usage-types";

export function getInspectionSchedulePreview(targetUrlCount: number, dailyLimit: number) {
  return {
    daysPerInspection: dailyLimit === 0 ? null : Math.ceil(targetUrlCount / dailyLimit),
    dailyLimit,
    targetUrlCount,
  };
}

export type ParsedCron = ParsedCronExpression;

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseCronExpression(expression: string): ParsedCron {
  return parseRuntimeCronExpression(expression);
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function onlyValue(field: ReadonlySet<number> | null) {
  return field?.size === 1 ? (field.values().next().value ?? null) : null;
}

function cronHumanPreview(parsed: ParsedCron, timezone: string) {
  if (!parsed.ok) {
    return "Cron preview unavailable until the expression is valid.";
  }
  const hour = onlyValue(parsed.hour);
  const minute = onlyValue(parsed.minute);
  const day = onlyValue(parsed.day);
  const weekday = onlyValue(parsed.weekday);
  const simpleDate =
    parsed.month === null &&
    (parsed.day === null || parsed.day.size === 1) &&
    (parsed.weekday === null || parsed.weekday.size === 1) &&
    !(parsed.day && parsed.weekday);
  if (hour == null || minute == null || !simpleDate) {
    return `Runs on the custom cron schedule in ${timezone}.`;
  }
  const time = formatTime(hour, minute);
  if (weekday != null) {
    return `Runs every ${dayNames[weekday]} at ${time} ${timezone}`;
  }
  return day != null
    ? `Runs on day ${day} of each month at ${time} ${timezone}`
    : `Runs every day at ${time} ${timezone}`;
}

function humanPreview(frequency: RankCheckFrequency, parsed: ParsedCron, timezone: string) {
  if (frequency === "daily") {
    return "Every 24 hours per keyword on a stable distributed phase.";
  }
  if (frequency === "weekly") {
    return "Every 7 days per keyword on a stable distributed phase.";
  }
  if (frequency === "monthly") {
    return `Monthly per keyword, anchored to its wall-clock date and time in ${timezone}.`;
  }
  if (frequency === "manual" || frequency === "paused") {
    return "No automatic runs.";
  }
  return cronHumanPreview(parsed, timezone);
}

function zonedRunLabel(run: Date, timezone: string) {
  // SCHEDULE PREVIEW: preserve the compact project-timezone cron label.
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: timezone,
  }).formatToParts(run);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("month")} ${value("day")}, ${value("hour")}:${value("minute")}`;
}

function nextRunLabelsForCron(
  parsed: ParsedCron,
  cronExpression: string,
  referenceIso: string,
  timezone: string,
) {
  if (!parsed.ok) {
    return [];
  }
  let cursor = new Date(referenceIso);
  const runs: string[] = [];

  try {
    while (runs.length < 3) {
      const next = computeNextCheckAt(
        { cronExpression, frequency: "custom_cron", timezone },
        cursor,
      );
      if (!next) break;
      runs.push(zonedRunLabel(next, timezone));
      cursor = next;
    }
  } catch {
    return [];
  }

  return runs;
}

export function runsPerMonth(parsed: ParsedCron, frequency: RankCheckFrequency) {
  if (!parsed.ok) {
    return 0;
  }
  if (frequency === "daily") {
    return RUNS_PER_MONTH.daily;
  }
  if (frequency === "weekly") {
    return RUNS_PER_MONTH.weekly;
  }
  if (frequency === "monthly") {
    return RUNS_PER_MONTH.monthly;
  }

  const runsPerDay = (parsed.minute?.size ?? 60) * (parsed.hour?.size ?? 24);
  let matchingDays: number;
  if (parsed.day === null && parsed.weekday === null) {
    matchingDays = RUNS_PER_MONTH.daily;
  } else if (parsed.day === null) {
    matchingDays = (parsed.weekday?.size ?? 0) * RUNS_PER_MONTH.weekly;
  } else if (parsed.weekday === null) {
    matchingDays = parsed.day.size;
  } else {
    matchingDays = Math.max(
      1,
      Math.round((parsed.day.size * parsed.weekday.size) / dayNames.length),
    );
  }
  const monthShare = (parsed.month?.size ?? 12) / 12;
  return Math.round(runsPerDay * matchingDays * monthShare);
}

export function getRankSchedulePreview(input: {
  cronExpression: string;
  defaults: DefaultsData;
  frequency: RankCheckFrequency;
  referenceIso: string;
  timezone: string;
}) {
  const { cronExpression, defaults, frequency, referenceIso, timezone } = input;
  const parsedCron =
    frequency === "custom_cron" ? parseCronExpression(cronExpression) : ({ ok: false } as const);
  const runChecks = checksPerRun({
    depth: defaults.serpDepth,
    deviceCount: defaults.deviceCount,
    frequency: frequency === "daily" || frequency === "weekly" ? frequency : "monthly",
    keywordCount: defaults.keywordCount,
    locationCount: defaults.locationCount,
  });
  let scheduledRuns: number | null = 0;
  if (frequency === "daily") scheduledRuns = RUNS_PER_MONTH.daily;
  else if (frequency === "weekly") scheduledRuns = RUNS_PER_MONTH.weekly;
  else if (frequency === "monthly") scheduledRuns = RUNS_PER_MONTH.monthly;
  else if (frequency === "custom_cron") {
    scheduledRuns = parsedCron.ok ? runsPerMonth(parsedCron, frequency) : null;
  }
  const monthlyChecks = scheduledRuns == null ? null : runChecks * scheduledRuns;
  const nextRunLabels =
    frequency === "custom_cron"
      ? nextRunLabelsForCron(parsedCron, cronExpression, referenceIso, timezone)
      : [];
  const timing = rankScheduleTiming(frequency, timezone, nextRunLabels);

  return {
    checksPerRun: runChecks,
    humanPreview: humanPreview(frequency, parsedCron, timezone),
    monthlyChecks,
    monthlyCost:
      monthlyChecks == null ? null : `$${(monthlyChecks * defaults.costPerCheck).toFixed(2)}`,
    nextRunLabels,
    parsedCron,
    timing,
  };
}
