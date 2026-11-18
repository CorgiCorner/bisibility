import { trackingPriceBound } from "@/lib/ai-tracking/admission/pricing";
import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import { scheduledRunsPerMonth } from "@/lib/cost-estimate/project-estimate";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { ScheduleCadence } from "./types";

export function monthlyScheduleCost(perRunCents: number | null, cadence: ScheduleCadence) {
  const runs = scheduledRunsPerMonth(
    cadence.frequency as RankCheckFrequency,
    cadence.cron_expression,
  );
  return perRunCents === null || runs === null ? null : Number((perRunCents * runs).toFixed(6));
}

export function aiScheduleCost(
  schedule: TrackingScheduleListItem,
  activePromptCount: number,
  now: Date,
) {
  if (activePromptCount === 0) return 0;
  if (!schedule.configurations.length) return null;
  try {
    const perPrompt = schedule.configurations.reduce(
      (sum, configuration) => sum + trackingPriceBound(configuration, now.getTime()) * 100,
      0,
    );
    return monthlyScheduleCost(perPrompt * activePromptCount, {
      frequency: "custom_cron",
      cron_expression: schedule.cron,
      timezone: schedule.timezone,
    });
  } catch {
    return null;
  }
}
