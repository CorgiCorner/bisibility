import type {
  DefinitionFreshnessPorts,
  DefinitionSource,
} from "@/lib/measurement-definitions/model";
import { nextCronRun } from "@/lib/rank-check/cron";
import {
  itemNotBefore,
  type PlannerScheduleCadence,
  plannedOccurrenceForKey,
  plannedOccurrences,
} from "@/lib/rank-check/planner/occurrence";

/** Root derivative source additions must be persisted semantic intent, not observed history. */
type CalendarSchedule = NonNullable<DefinitionSource["policy"]["keywordSchedule"]> & {
  calendarAnchor?: string | null;
};
type CalendarDefaults = NonNullable<DefinitionSource["policy"]["defaults"]> & {
  calendarAnchor?: string | null;
};
type CalendarAssigned = NonNullable<DefinitionSource["policy"]["checkSchedule"]> & {
  publicId?: string;
};
type CalendarSource = Omit<DefinitionSource, "policy"> & {
  policy: Omit<DefinitionSource["policy"], "keywordSchedule" | "defaults" | "checkSchedule"> & {
    keywordSchedule: CalendarSchedule | null;
    defaults: CalendarDefaults | null;
    checkSchedule: CalendarAssigned | null;
  };
};
export type CalendarHostConfiguration = Readonly<{
  /** No default: Root's versioned freshness registry must deliberately adopt these semantics. */
  basis: "successor-own-slots-v1";
  configurationRevision: string;
  /** Compatibility input; unassigned rank targets now always use manual freshness. */
  legacyExecutionEngine: "legacy_compute" | "dispatcher";
}>;
// Search budget only, not freshness/TTL. Calendar planner scans38 dates; custom cron searches at most366 days.
const PLANNER_SEARCH_DAYS = 366;
const DAY_MS = 86_400_000;
function validInterval(first: Date | null, second: Date | null) {
  if (!first || !second) return null;
  const value = second.getTime() - first.getTime();
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function nextPlannerNominal(schedule: PlannerScheduleCadence, from: Date) {
  const horizon = new Date(from.getTime() + PLANNER_SEARCH_DAYS * DAY_MS);
  const usesCron =
    schedule.frequency === "custom_cron" ||
    ((schedule.frequency === "weekly" || schedule.frequency === "monthly") &&
      schedule.cronExpression !== null);
  if (usesCron) {
    if (!schedule.cronExpression) return null;
    // Seek the two required slots through the actual planner recurrence. Never enumerate a year of minute cron tasks.
    const plannedFor = nextCronRun(schedule.cronExpression, from, schedule.timezone);
    return plannedFor > from && plannedFor <= horizon
      ? plannedOccurrenceForKey(schedule, plannedFor.toISOString())
      : null;
  }
  return (
    plannedOccurrences(schedule, from, horizon)
      .filter((item) => item.plannedFor > from)
      .sort((a, b) => a.plannedFor.getTime() - b.plannedFor.getTime())[0] ?? null
  );
}
function assignedInterval(source: CalendarSource, asOf: Date) {
  const saved = source.policy.checkSchedule;
  if (
    !saved?.enabled ||
    saved.archivedAt ||
    !saved.publicId ||
    saved.frequency === "manual" ||
    saved.frequency === "paused"
  )
    return null;
  const cadence: PlannerScheduleCadence = {
    cronExpression: saved.cronExpression,
    frequency: saved.frequency,
    jitterMinutes: saved.jitterMinutes,
    publicId: saved.publicId,
    timeOfDay: saved.timeOfDay,
    timezone: saved.timezone ?? source.policy.defaults?.timezone ?? "UTC",
  };
  const first = nextPlannerNominal(cadence, asOf);
  const second = first ? nextPlannerNominal(cadence, first.plannedFor) : null;
  if (!first || !second) return null;
  // Use the actual planner's phase+jitter for each cycle, never nominal24h/7d as a TTL.
  return validInterval(
    itemNotBefore(first, cadence, source.keywordId, first.plannedFor),
    itemNotBefore(second, cadence, source.keywordId, second.plannedFor),
  );
}
/** Only current persisted source supplied by the authorized head reader. No SQL/network/schedule writes here. */
export function hostCalendarFreshnessPorts(
  config: CalendarHostConfiguration,
): DefinitionFreshnessPorts {
  if (config.basis !== "successor-own-slots-v1" || !config.configurationRevision)
    throw new Error("An explicit host calendar policy is required.");
  return {
    cadenceIntervalMs: async (_tx, original, asOf) => {
      const source = original as CalendarSource;
      if (
        source.policy.config?.freshness.configurationRevision !== config.configurationRevision ||
        !Number.isFinite(asOf.getTime())
      )
        return null;
      try {
        return source.policy.checkSchedule ? assignedInterval(source, asOf) : null;
      } catch {
        return null;
      } // Calendar parse/range failure only; no database/provider call exists inside this catch.
    },
  };
}
