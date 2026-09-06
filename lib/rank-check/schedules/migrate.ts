import { parseCronExpression } from "@/lib/rank-check/cron";

export type MigratedScheduleFrequency =
  | "paused"
  | "manual"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom_cron";

/**
 * A null timeOfDay means the planner derives each item's notBefore from
 * stableIntervalPhaseMs(keywordId), not jitterMinutes.
 */
export type CheckScheduleSignature = {
  cronExpression: string | null;
  frequency: MigratedScheduleFrequency;
  timeOfDay: string | null;
  timezone: string;
};

export type LegacyScheduleValue = {
  cronExpression: string | null;
  frequency: MigratedScheduleFrequency;
  jitterMinutes: number;
  timezone: string;
};

export type KeywordScheduleMigrationInput = {
  id: string;
  schedule: LegacyScheduleValue | null;
};

export type ProjectScheduleMigrationInput = {
  alreadyHasDefault: boolean;
  defaultSchedule: LegacyScheduleValue;
  keywords: readonly KeywordScheduleMigrationInput[];
};

export type PlannedCheckSchedule = CheckScheduleSignature & {
  isDefault: boolean;
  jitterMinutes: number;
  keywordIds: string[];
  name: string;
};

type ScheduleGroup = {
  isDefault: boolean;
  jitterValues: number[];
  keywordIds: string[];
  signature: CheckScheduleSignature;
};

function onlyValue(values: ReadonlySet<number> | null) {
  if (values?.size !== 1) return null;
  return [...values][0] ?? null;
}

export function deriveScheduleTimeOfDay(
  frequency: MigratedScheduleFrequency,
  cronExpression: string | null,
) {
  if (frequency !== "custom_cron" || !cronExpression) return null;
  const parsed = parseCronExpression(cronExpression);
  if (!parsed.ok) return null;
  const minute = onlyValue(parsed.minute);
  const hour = onlyValue(parsed.hour);
  if (minute === null || hour === null) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function scheduleJitterMode(values: readonly number[]) {
  if (values.length === 0) {
    throw new Error("A schedule group must have at least one jitter value.");
  }
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue - rightValue,
  )[0]?.[0] as number;
}

function signatureFor(schedule: LegacyScheduleValue): CheckScheduleSignature {
  const cronExpression = schedule.frequency === "custom_cron" ? schedule.cronExpression : null;
  return {
    cronExpression,
    frequency: schedule.frequency,
    timeOfDay: deriveScheduleTimeOfDay(schedule.frequency, cronExpression),
    timezone: schedule.timezone,
  };
}

function signatureKey(signature: CheckScheduleSignature) {
  return JSON.stringify([signature.frequency, signature.cronExpression, signature.timezone]);
}

function baseScheduleName(signature: CheckScheduleSignature) {
  if (signature.frequency === "custom_cron") {
    const cron = signature.cronExpression ? ` - ${signature.cronExpression}` : "";
    const time = signature.timeOfDay ? ` ${signature.timeOfDay}` : "";
    return `Custom${cron}${time}`;
  }
  return `${signature.frequency[0]?.toUpperCase()}${signature.frequency.slice(1)}`;
}

function addGroupMember(
  groups: Map<string, ScheduleGroup>,
  schedule: LegacyScheduleValue,
  keywordId: string | null,
) {
  const signature = signatureFor(schedule);
  const key = signatureKey(signature);
  let group = groups.get(key);
  if (!group) {
    group = { isDefault: false, jitterValues: [], keywordIds: [], signature };
    groups.set(key, group);
  }
  group.jitterValues.push(schedule.jitterMinutes);
  if (keywordId) group.keywordIds.push(keywordId);
  return group;
}

export function planProjectScheduleMigration(
  input: ProjectScheduleMigrationInput,
): PlannedCheckSchedule[] {
  if (input.alreadyHasDefault) return [];

  const groups = new Map<string, ScheduleGroup>();
  for (const keyword of input.keywords) {
    if (!keyword.schedule) {
      addGroupMember(groups, input.defaultSchedule, keyword.id);
      continue;
    }
    if (["paused", "manual"].includes(keyword.schedule.frequency)) continue;
    addGroupMember(groups, keyword.schedule, keyword.id);
  }

  const defaultSignature = signatureFor(input.defaultSchedule);
  const defaultKey = signatureKey(defaultSignature);
  let defaultGroup = groups.get(defaultKey);
  if (!defaultGroup) {
    defaultGroup = addGroupMember(groups, input.defaultSchedule, null);
  }
  defaultGroup.isDefault = true;

  const usedNames = new Set<string>();
  return [...groups.values()].map((group) => {
    const baseName = baseScheduleName(group.signature);
    const name = usedNames.has(baseName) ? `${baseName} (${group.signature.timezone})` : baseName;
    usedNames.add(name);
    usedNames.add(baseName);
    return {
      ...group.signature,
      isDefault: group.isDefault,
      jitterMinutes: scheduleJitterMode(group.jitterValues),
      keywordIds: group.keywordIds,
      name,
    };
  });
}
