import { timezoneSelectOptions } from "@/lib/settings/timezones";

export const newScheduleDefaults = {
  frequency: "daily",
  jitterMinutes: 15,
  name: "Daily 06:00",
  timeOfDay: "06:00",
  timezone: null,
} as const;

export function scheduleTimezoneOptions(projectTimezone: string | undefined, selected: string) {
  return [
    {
      label: projectTimezone
        ? `Uses project time zone - ${projectTimezone}`
        : "Uses project time zone",
      value: "",
    },
    ...timezoneSelectOptions(selected || projectTimezone || "UTC"),
  ];
}
