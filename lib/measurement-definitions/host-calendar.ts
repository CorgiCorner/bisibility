import type {
  DefinitionFreshnessPorts,
  DefinitionSource,
} from "@/lib/measurement-definitions/model";
import { nextCronRun } from "@/lib/rank-check/cron";
import { computeDispatcherNextCheckAt } from "@/lib/rank-check/dispatcher-recurrence";
import {
  itemNotBefore,
  type PlannerScheduleCadence,
  plannedOccurrenceForKey,
  plannedOccurrences,
} from "@/lib/rank-check/planner/occurrence";
import { computeNextCheckAt, type RankCheckScheduleInput } from "@/lib/rank-check/schedule";

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
  /** Must reflect the actual unassigned execution route; assigned schedules always use the planner. */
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
function legacyInterval(
  source: CalendarSource,
  asOf: Date,
  engine: CalendarHostConfiguration["legacyExecutionEngine"],
) {
  const saved = source.policy.keywordSchedule ?? source.policy.defaults;
  if (!saved || saved.frequency === "manual" || saved.frequency === "paused") return null;
  // computeNextCheckAt otherwise invents a monthly anchor from `from`; dispatcher also requires an anchor.
  if (saved.frequency === "monthly" && !saved.calendarAnchor) return null;
  const schedule: RankCheckScheduleInput = {
    frequency: saved.frequency,
    cronExpression: saved.cronExpression,
    timezone: saved.timezone ?? "UTC",
    jitterMinutes: saved.jitterMinutes,
    nextCheckAt: saved.calendarAnchor ?? undefined,
  };
  const next =
    engine === "dispatcher"
      ? (from: Date) => computeDispatcherNextCheckAt(schedule, source.keywordId, from)
      : (from: Date) => computeNextCheckAt(schedule, from, source.keywordId);
  const first = next(asOf);
  return validInterval(first, first ? next(first) : null);
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
        return source.policy.checkSchedule
          ? assignedInterval(source, asOf)
          : legacyInterval(source, asOf, config.legacyExecutionEngine);
      } catch {
        return null;
      } // Calendar parse/range failure only; no database/provider call exists inside this catch.
    },
  };
}
