import type { SettingsSnapshot } from "@/lib/measurement-settings/ui-contracts";
import {
  plannerOwnsAutomaticChecks,
  rankCheckSchedulerMode,
} from "@/lib/rank-check/scheduler-mode";
import { firstSettingsSlot, settingsCadence, settingsOccurrences } from "./calendar";
import type { SettingsSource } from "./source";
/** Pure read projection of the maintained captured calendar. No price/reservation/provider work. */
export function currentSettingsNextRun(
  source: SettingsSource,
  snapshot: SettingsSnapshot,
  asOf: Date,
): NonNullable<SettingsSnapshot["nextRun"]> {
  const timezone = snapshot.schedule?.timezone ?? source.defaults?.timezone ?? "UTC";
  const unknown = { at: null, timezone, basis: "unavailable" as const };
  if (
    !source.schedule ||
    !snapshot.schedule ||
    !plannerOwnsAutomaticChecks(rankCheckSchedulerMode())
  )
    return unknown;
  const draft = snapshot.schedule;
  if (!draft.enabled) return { at: null, timezone, basis: "captured_calendar" };
  const ids = source.targets
    .filter(
      (row) =>
        row.policy.checkSchedule?.id === source.schedule?.id &&
        source.markets.some((market) => market.locationId === row.target.locationId),
    )
    .map((row) => row.keywordId);
  const cadence = settingsCadence(source, snapshot.selection, draft);
  // The existing forecast contract uses this explicit 28-day window; null is not a promise of no future run.
  const rows = settingsOccurrences(cadence, asOf, new Date(asOf.getTime() + 28 * 86_400_000));
  return { at: firstSettingsSlot(rows, cadence, ids, asOf), timezone, basis: "captured_calendar" };
}
