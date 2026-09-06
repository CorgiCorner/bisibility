import { describe, expect, it } from "vitest";
import type { KeywordScheduleMigrationInput, LegacyScheduleValue } from "./migrate";
import {
  deriveScheduleTimeOfDay,
  planProjectScheduleMigration,
  scheduleJitterMode,
} from "./migrate";

const defaultSchedule: LegacyScheduleValue = {
  cronExpression: null,
  frequency: "daily",
  jitterMinutes: 60,
  timezone: "UTC",
};

function scheduledKeywords(
  prefix: string,
  count: number,
  schedule: LegacyScheduleValue,
): KeywordScheduleMigrationInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    schedule,
  }));
}

describe("keyword schedule migration planner", () => {
  it("groups the complete migration fixture by cadence signature", () => {
    const daily = Array.from({ length: 25 }, (_, index) => ({
      id: `daily-${index}`,
      schedule: {
        ...defaultSchedule,
        jitterMinutes: index < 13 ? 30 : 60,
      },
    }));
    const weekly = scheduledKeywords("weekly", 25, {
      cronExpression: "ignored stale value",
      frequency: "weekly",
      jitterMinutes: 15,
      timezone: "Europe/Warsaw",
    });
    const monthly = scheduledKeywords("monthly", 25, {
      cronExpression: null,
      frequency: "monthly",
      jitterMinutes: 45,
      timezone: "UTC",
    });
    const custom = scheduledKeywords("custom", 25, {
      cronExpression: "30 6 * * *",
      frequency: "custom_cron",
      jitterMinutes: 10,
      timezone: "UTC",
    });
    const inherited = Array.from({ length: 12 }, (_, index) => ({
      id: `inherited-${index}`,
      schedule: null,
    }));
    const paused = scheduledKeywords("paused", 5, {
      cronExpression: null,
      frequency: "paused",
      jitterMinutes: 60,
      timezone: "UTC",
    });
    const keywords = [...daily, ...weekly, ...monthly, ...custom, ...inherited, ...paused];

    const schedules = planProjectScheduleMigration({
      alreadyHasDefault: false,
      defaultSchedule,
      keywords,
    });

    expect(schedules.map((schedule) => schedule.name)).toEqual([
      "Daily",
      "Weekly",
      "Monthly",
      "Custom - 30 6 * * * 06:30",
    ]);
    expect(schedules).toHaveLength(4);
    expect(schedules.find((schedule) => schedule.name === "Daily")).toMatchObject({
      cronExpression: null,
      isDefault: true,
      jitterMinutes: 60,
      timeOfDay: null,
      timezone: "UTC",
    });
    expect(schedules.find((schedule) => schedule.name === "Weekly")?.jitterMinutes).toBe(15);
    expect(schedules.find((schedule) => schedule.name === "Monthly")?.jitterMinutes).toBe(45);
    expect(schedules.find((schedule) => schedule.name.startsWith("Custom"))).toMatchObject({
      jitterMinutes: 10,
      timeOfDay: "06:30",
    });

    const memberships = new Set(schedules.flatMap((schedule) => schedule.keywordIds));
    expect(memberships.size).toBe(112);
    expect(paused.map((keyword) => keyword.id).filter((id) => memberships.has(id))).toEqual([]);
  });

  it("returns no writes when the project already has a default", () => {
    expect(
      planProjectScheduleMigration({
        alreadyHasDefault: true,
        defaultSchedule,
        keywords: [{ id: "keyword-1", schedule: null }],
      }),
    ).toEqual([]);
  });

  it("derives only single-valued cron times and resolves jitter ties", () => {
    expect(deriveScheduleTimeOfDay("custom_cron", "30 6 * * *")).toBe("06:30");
    expect(deriveScheduleTimeOfDay("custom_cron", "0,30 6 * * *")).toBeNull();
    expect(deriveScheduleTimeOfDay("daily", "30 6 * * *")).toBeNull();
    expect(scheduleJitterMode([60, 30])).toBe(30);
  });
});
