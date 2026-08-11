import { normalizeSchedule } from "@/lib/actions/_schedule";
import { describe, expect, it } from "vitest";

type CustomCronInput = {
  cronExpression: string;
  frequency: "custom_cron";
  jitterMinutes: number;
  timezone: string;
};

function customCronInput(overrides: Partial<CustomCronInput> = {}): CustomCronInput {
  return {
    cronExpression: "0 * * * *",
    frequency: "custom_cron",
    jitterMinutes: 0,
    timezone: "UTC",
    ...overrides,
  };
}

describe("normalizeSchedule custom cron guard", () => {
  const from = new Date("2026-01-01T01:15:00.000Z");

  it("rejects malformed custom cron expressions with one validation error", () => {
    expect(() =>
      normalizeSchedule(customCronInput({ cronExpression: "not a cron" }), from),
    ).toThrow("Custom cron schedules require a valid cron expression.");
  });

  it("reports an invalid custom cron timezone separately from cron syntax", () => {
    expect(() => normalizeSchedule(customCronInput({ timezone: "not-a-timezone" }), from)).toThrow(
      "Custom cron schedules require a valid time zone.",
    );
  });

  it("rejects custom cron schedules that run more often than hourly", () => {
    expect(() =>
      normalizeSchedule(customCronInput({ cronExpression: "*/30 * * * *" }), from),
    ).toThrow("Custom cron schedules must run at least one hour apart.");
  });

  it("accepts a custom cron schedule that runs once per hour", () => {
    expect(normalizeSchedule(customCronInput(), from)).toMatchObject({
      cronExpression: "0 * * * *",
      frequency: "custom_cron",
      nextCheckAt: new Date("2026-01-01T02:00:00.000Z"),
      timezone: "UTC",
    });
  });
});
