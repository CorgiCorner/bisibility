import type { projectDefaultsSchema } from "@/lib/schemas/project";
import {
  DEFAULT_SERP_DEPTH,
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/markets";
import type { DefaultsData } from "@/lib/settings/options";
import type { z } from "zod";

export type TrackingDefaultsForm = z.infer<typeof projectDefaultsSchema>;

export function trackingFormDefaults(
  defaults: DefaultsData,
  projectId: string,
): TrackingDefaultsForm {
  return {
    city: defaults.city,
    country: normalizeSerpMarketName(defaults.country) ?? DEFAULT_SERP_MARKET,
    cronExpression: defaults.schedule.cron_expression ?? "0 6 * * *",
    device: defaults.device.toLowerCase() === "mobile" ? "mobile" : "desktop",
    frequency: defaults.schedule.frequency,
    jitterMinutes: defaults.schedule.jitter_minutes,
    locationKey: defaults.locationKey || undefined,
    projectId,
    serpDepth: (defaults.serpDepth ?? DEFAULT_SERP_DEPTH) as SerpDepth,
    serpStopOnMatch: resolveSerpStopOnMatch(defaults.serpStopOnMatch),
    timezone: defaults.schedule.timezone,
  };
}
