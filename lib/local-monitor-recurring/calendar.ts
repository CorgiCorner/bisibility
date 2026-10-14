import { nextCronRun } from "@/lib/rank-check/cron";
import {
  itemNotBefore,
  type PlannerScheduleCadence,
  plannedOccurrenceForKey,
  plannedOccurrences,
  usesCronOccurrences,
} from "@/lib/rank-check/planner/occurrence";
import { calendarSchema } from "./schema";
export function recurringCadence(input: unknown): PlannerScheduleCadence {
  return calendarSchema.parse(input);
}
/** Same planner calendar/DST kernel; one immutable monitor cohort uses a stable monitor slot. */
export function nextRecurringSlot(calendar: unknown, monitorId: string, after: Date) {
  const cadence = recurringCadence(calendar);
  if (usesCronOccurrences(cadence)) {
    if (!cadence.cronExpression) throw new Error("Missing captured cron.");
    const fire = nextCronRun(cadence.cronExpression, after, cadence.timezone);
    return retainedRecurringSlot(calendar, monitorId, fire.toISOString());
  }
  const rows = plannedOccurrences(cadence, after, new Date(after.getTime() + 38 * 86400000));
  for (const row of rows) {
    const dueAt = itemNotBefore(row, cadence, monitorId, new Date(0));
    if (dueAt > after) return { ...row, dueAt };
  }
  throw new Error("Calendar has no supported next occurrence.");
}
export function retainedRecurringSlot(calendar: unknown, monitorId: string, key: string) {
  const cadence = recurringCadence(calendar),
    row = plannedOccurrenceForKey(cadence, key);
  if (!row) throw new Error("Invalid immutable calendar occurrence.");
  return { ...row, dueAt: itemNotBefore(row, cadence, monitorId, new Date(0)) };
}
