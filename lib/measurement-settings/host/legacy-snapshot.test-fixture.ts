import type { SettingsSnapshot } from "@/lib/measurement-settings/ui-contracts";

export const fixtureSnapshot: SettingsSnapshot = {
  revision: 4,
  sourceHash: "b".repeat(64),
  defaultIntent: { geoId: "authorized-city", languageCode: "pl", device: "desktop", depth: 20 },
  scheduleId: `sch_${"c".repeat(24)}`,
  selection: {
    providerId: "dataforseo",
    capabilityVersion: "web-serp-v1",
    surface: "web_serp",
    geoId: "authorized-city",
    languageCode: "pl",
    device: "desktop",
    depth: 20,
  },
  schedule: {
    enabled: true,
    frequency: "daily",
    timezone: "Europe/Warsaw",
    timeOfDay: "09:00",
    weekday: "Monday",
    dayOfMonth: "1st",
    cronExpression: "",
    jitterMinutes: 60,
  },
};
