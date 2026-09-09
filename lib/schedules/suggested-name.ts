type ScheduleNameCadence = {
  cronExpression: string;
  dayOfMonth: string;
  frequency: string;
  timeOfDay: string;
  weekday: string;
};

export function suggestedScheduleName(cadence: ScheduleNameCadence) {
  const time = cadence.timeOfDay || "No fixed time";
  switch (cadence.frequency) {
    case "weekly":
      return `Weekly · ${cadence.weekday.slice(0, 3)} ${time}`;
    case "monthly":
      return `Monthly · ${cadence.dayOfMonth} ${time}`;
    case "custom_cron":
      return `Custom · ${cadence.cronExpression.trim()}`.slice(0, 80);
    default:
      return `Daily ${time}`;
  }
}

export function scheduleNameAfterChange(
  currentName: string,
  before: ScheduleNameCadence,
  after: ScheduleNameCadence,
) {
  return currentName === suggestedScheduleName(before) ? suggestedScheduleName(after) : currentName;
}
