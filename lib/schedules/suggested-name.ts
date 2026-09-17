type ScheduleNameCadence = {
  cronExpression: string;
  dayOfMonth: string;
  frequency: string;
  timeOfDay: string;
  weekday: string;
};

/**
 * Already-resolved copy for a generated schedule name. The caller builds it from its own
 * catalog, so this module never assembles a reader-facing sentence in English.
 */
export type ScheduleNameLabels = {
  custom: (expression: string) => string;
  daily: (time: string) => string;
  monthly: (day: string, time: string) => string;
  noFixedTime: string;
  weekly: (weekday: string, time: string) => string;
};

export function suggestedScheduleName(cadence: ScheduleNameCadence, labels: ScheduleNameLabels) {
  const time = cadence.timeOfDay || labels.noFixedTime;
  switch (cadence.frequency) {
    case "weekly":
      return labels.weekly(cadence.weekday.slice(0, 3), time);
    case "monthly":
      return labels.monthly(cadence.dayOfMonth, time);
    case "custom_cron":
      return labels.custom(cadence.cronExpression.trim()).slice(0, 80);
    default:
      return labels.daily(time);
  }
}

export function scheduleNameAfterChange(
  currentName: string,
  before: ScheduleNameCadence,
  after: ScheduleNameCadence,
  labels: ScheduleNameLabels,
) {
  return currentName === suggestedScheduleName(before, labels)
    ? suggestedScheduleName(after, labels)
    : currentName;
}
