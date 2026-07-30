export type RankCheckFrequency =
  | "paused"
  | "manual"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom_cron";

export const SCHEDULED_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "custom_cron",
] as const satisfies readonly RankCheckFrequency[];

const scheduledFrequencySet = new Set<string>(SCHEDULED_FREQUENCIES);

export function isScheduledFrequency(
  frequency: string,
): frequency is (typeof SCHEDULED_FREQUENCIES)[number] {
  return scheduledFrequencySet.has(frequency);
}
