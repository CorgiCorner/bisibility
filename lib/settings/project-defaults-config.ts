import type { ProjectDefaults } from "@/lib/generated/prisma/client";

export function projectDefaultsConfig(defaults: ProjectDefaults) {
  return {
    city: defaults.city,
    country: defaults.country,
    cronExpression: defaults.cronExpression,
    device: defaults.device,
    frequency: defaults.frequency,
    inspectionDailyLimit: defaults.inspectionDailyLimit,
    jitterMinutes: defaults.jitterMinutes,
    locationKey: defaults.locationKey,
    serpDepth: defaults.serpDepth,
    serpStopOnMatch: defaults.serpStopOnMatch,
    timezone: defaults.timezone,
  };
}

export function publicProjectDefaults(defaults: ProjectDefaults, projectId: string) {
  return { ...projectDefaultsConfig(defaults), projectId };
}
