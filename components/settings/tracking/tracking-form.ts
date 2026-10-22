import type { projectDefaultsSchema } from "@/lib/schemas/project";
import {
  DEFAULT_SERP_DEPTH,
  resolveEffectiveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/constants";
import type { DefaultsData } from "@/lib/settings/options";
import type { z } from "zod";

export type TrackingDefaultsForm = z.infer<typeof projectDefaultsSchema>;

export function trackingFormDefaults(
  defaults: DefaultsData,
  projectId: string,
): TrackingDefaultsForm {
  return {
    city: defaults.city,
    country: defaults.locationLabel,
    cronExpression: defaults.schedule.cron_expression,
    device: defaults.device.toLowerCase() === "mobile" ? "mobile" : "desktop",
    frequency: defaults.schedule.frequency,
    jitterMinutes: defaults.schedule.jitter_minutes,
    locationKey: defaults.locationKey,
    projectId,
    serpDepth: (defaults.serpDepth ?? DEFAULT_SERP_DEPTH) as SerpDepth,
    serpStopOnMatch: resolveEffectiveSerpStopOnMatch(
      defaults.serpStopOnMatch,
      defaults.serpDepth ?? DEFAULT_SERP_DEPTH,
    ),
    timezone: defaults.schedule.timezone,
  };
}
