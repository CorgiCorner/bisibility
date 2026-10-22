import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import {
  itemNotBefore,
  type PlannerScheduleCadence,
  plannedOccurrences,
  usesCronOccurrences,
} from "@/lib/rank-check/planner/occurrence";
import { nextCanonicalCronRun, previousCronRun } from "@/lib/rank-check/previous-cron";

export type KeywordScheduleMembership = {
  archivedAt?: Date | null;
  cronExpression?: string | null;
  enabled?: boolean;
  frequency?: RankCheckFrequency;
  jitterMinutes?: number;
  publicId: string;
  timeOfDay?: string | null;
  timezone?: string | null;
};

/** Project defaults suggest settings; only membership authorizes recurring checks. */
export function keywordMembershipSchedule(
  membership: KeywordScheduleMembership | null | undefined,
  keywordId: string,
  projectTimezone = "UTC",
  now = new Date(),
  calendarCache?: Map<string, ReturnType<typeof plannedOccurrences>>,
) {
  const timezone = membership?.timezone ?? projectTimezone;
  const manual = {
    cronExpression: null,
    frequency: "manual" as RankCheckFrequency,
    jitterMinutes: 0,
    nextCheckAt: null as Date | null,
    timezone,
  };
  if (!membership || membership.archivedAt || !membership.frequency) return manual;
  const cadence = {
    cronExpression: membership.cronExpression ?? null,
    frequency: membership.frequency,
    jitterMinutes: membership.jitterMinutes ?? 0,
    publicId: membership.publicId,
    timeOfDay: membership.timeOfDay ?? null,
    timezone,
  };
  if (!membership.enabled) return { ...manual, frequency: "paused" as RankCheckFrequency };
  if (cadence.frequency === "manual" || cadence.frequency === "paused")
    return { ...manual, frequency: cadence.frequency };
  const key = JSON.stringify(cadence);
  let occurrences = calendarCache?.get(key);
  if (!occurrences) {
    occurrences = membershipOccurrences(cadence, now);
    calendarCache?.set(key, occurrences);
  }
  const nextCheckAt =
    occurrences
      .map((occurrence) => itemNotBefore(occurrence, cadence, keywordId, new Date(0)))
      .filter((slot) => slot >= now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { ...cadence, nextCheckAt };
}

function membershipOccurrences(cadence: PlannerScheduleCadence, now: Date) {
  if (usesCronOccurrences(cadence)) {
    if (!cadence.cronExpression) return [];
    const next = nextCanonicalCronRun(cadence.cronExpression, now, cadence.timezone);
    if (!next) return [];
    const previous = previousCronRun(cadence.cronExpression, now, cadence.timezone);
    const following = nextCanonicalCronRun(cadence.cronExpression, next, cadence.timezone);
    const rows = [];
    if (previous)
      rows.push({
        plannedFor: previous,
        intervalMs: next.getTime() - previous.getTime(),
        occurrenceKey: previous.toISOString(),
      });
    if (following)
      rows.push({
        plannedFor: next,
        intervalMs: following.getTime() - next.getTime(),
        occurrenceKey: next.toISOString(),
      });
    return rows;
  }
  // The active weekly/monthly interval can be anchored before today. A second bounded
  // forward walk is needed because the planner calendar itself walks at most 38 days.
  const days = cadence.frequency === "daily" ? 2 : cadence.frequency === "weekly" ? 8 : 35;
  const previous = plannedOccurrences(
    cadence,
    new Date(now.getTime() - days * 86_400_000),
    now,
  ).filter((row) => row.plannedFor.getTime() + row.intervalMs > now.getTime());
  const future = plannedOccurrences(cadence, now, new Date(now.getTime() + 38 * 86_400_000));
  return [
    ...new Map([...previous, ...future].map((row) => [row.plannedFor.toISOString(), row])).values(),
  ];
}

/** Share a frozen clock and calendar across one authorized projection; never cache across requests. */
export function createKeywordMembershipProjector(now = new Date()) {
  const cache = new Map<string, ReturnType<typeof plannedOccurrences>>();
  return (
    membership: KeywordScheduleMembership | null | undefined,
    keywordId: string,
    timezone?: string,
  ) => keywordMembershipSchedule(membership, keywordId, timezone, now, cache);
}
