import type { MeasurementSelection, ScheduleDraft } from "@/lib/measurement-settings/ui-contracts";
import { nextCronRun } from "@/lib/rank-check/cron";
import {
  itemNotBefore,
  type PlannerScheduleCadence,
  plannedOccurrences,
} from "@/lib/rank-check/planner/occurrence";
import { calendarCronExpression } from "@/lib/rank-check/schedule-calendar";
import { updateCheckScheduleSchema } from "@/lib/schemas/check-schedule";
import { SettingsHostError } from "./errors";
import type { SettingsSource } from "./source";

/** Preserve a real legacy phase unless the user explicitly chooses a calendar. */
export function scheduleUpdateInput(
  source: SettingsSource,
  selection: MeasurementSelection,
  draft: ScheduleDraft,
) {
  const before = source.schedule;
  if (!before) throw new SettingsHostError("invalid_settings");
  let cronExpression: string | null =
    draft.frequency === "custom_cron" ? draft.cronExpression : null;
  if (draft.frequency === "weekly" || draft.frequency === "monthly") {
    const selected =
      draft.timeOfDay !== null &&
      (draft.frequency === "weekly" ? draft.weekday !== null : draft.dayOfMonth !== null);
    if (selected)
      cronExpression = calendarCronExpression({
        frequency: draft.frequency,
        timeOfDay: draft.timeOfDay!,
        weekday: draft.weekday ?? "Monday",
        dayOfMonth: draft.dayOfMonth ?? "1st",
      });
    else if (draft.frequency !== before.frequency || draft.timeOfDay !== before.timeOfDay)
      throw new SettingsHostError("invalid_settings");
    else cronExpression = before.cronExpression;
  }
  const previousDepth = before.serpDepth ?? source.defaults?.serpDepth;
  const previousTimezone = before.timezone ?? source.defaults?.timezone ?? "UTC";
  const previousProvider =
    before.providerPolicy && before.providerPolicy !== "project"
      ? before.providerPolicy
      : source.chain[0]?.provider;
  const keepLegacyPhase =
    (draft.frequency === "weekly" || draft.frequency === "monthly") &&
    draft.frequency === before.frequency &&
    cronExpression === null &&
    before.cronExpression === null;
  return updateCheckScheduleSchema.parse({
    projectId: source.project.publicId,
    scheduleId: before.publicId,
    enabled: draft.enabled,
    ...(selection.providerId !== previousProvider ? { providerPolicy: selection.providerId } : {}),
    ...(selection.depth !== previousDepth ? { serpDepth: selection.depth } : {}),
    ...(draft.timezone !== previousTimezone ? { timezone: draft.timezone } : {}),
    timeOfDay: draft.timeOfDay,
    jitterMinutes: draft.jitterMinutes,
    ...(!keepLegacyPhase ? { frequency: draft.frequency, cronExpression } : {}),
  });
}
export function settingsCadence(
  source: SettingsSource,
  selection: MeasurementSelection,
  draft: ScheduleDraft,
): PlannerScheduleCadence {
  const data = scheduleUpdateInput(source, selection, draft);
  const before = source.schedule!;
  return {
    publicId: before.publicId,
    frequency: data.frequency ?? before.frequency,
    cronExpression: data.cronExpression === undefined ? before.cronExpression : data.cronExpression,
    timeOfDay: draft.timeOfDay,
    timezone: draft.timezone,
    jitterMinutes: draft.jitterMinutes,
  };
}
/** Existing planner calendar/phase and item jitter, with a bounded custom-cron walk. */
export function settingsOccurrences(cadence: PlannerScheduleCadence, asOf: Date, end: Date) {
  if (
    cadence.frequency !== "custom_cron" &&
    !((cadence.frequency === "weekly" || cadence.frequency === "monthly") && cadence.cronExpression)
  )
    return plannedOccurrences(cadence, asOf, end);
  if (!cadence.cronExpression) throw new SettingsHostError("source_unavailable");
  const rows: ReturnType<typeof plannedOccurrences> = [];
  let cursor = new Date(asOf.getTime() - 1);
  while (rows.length <= 1_000) {
    const plannedFor = nextCronRun(cadence.cronExpression, cursor, cadence.timezone);
    if (plannedFor > end) return rows;
    const next = nextCronRun(cadence.cronExpression, plannedFor, cadence.timezone);
    if (next <= plannedFor) throw new SettingsHostError("source_unavailable");
    rows.push({
      plannedFor,
      intervalMs: next.getTime() - plannedFor.getTime(),
      occurrenceKey: plannedFor.toISOString(),
    });
    cursor = plannedFor;
  }
  throw new SettingsHostError("source_unavailable");
}
export function firstSettingsSlot(
  rows: ReturnType<typeof settingsOccurrences>,
  cadence: PlannerScheduleCadence,
  ids: readonly string[],
  asOf: Date,
) {
  if (rows.length * ids.length > 250_000) return null;
  let first: Date | null = null;
  for (const row of rows)
    for (const id of ids) {
      const slot = itemNotBefore(row, cadence, id, asOf);
      if (!first || slot < first) first = slot;
    }
  return first?.toISOString() ?? null;
}
