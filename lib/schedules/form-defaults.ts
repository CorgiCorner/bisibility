import { timezoneSelectOptions } from "@/lib/settings/timezones";

export const newScheduleDefaults = {
  frequency: "daily",
  jitterMinutes: 15,
  // The reader-facing name is derived from the catalog by `suggestedScheduleName`, so this
  // module never carries display copy of its own.
  name: "",
  timeOfDay: "06:00",
  timezone: null,
} as const;

/**
 * The caller owns the first option's label so the "uses the project time zone" sentence comes
 * from its own catalog namespace instead of being assembled in English here.
 */
export function scheduleTimezoneOptions(
  projectTimezone: string | undefined,
  selected: string,
  projectTimezoneLabel: string,
) {
  return [
    { label: projectTimezoneLabel, value: "" },
    ...timezoneSelectOptions(selected || projectTimezone || "UTC"),
  ];
}
