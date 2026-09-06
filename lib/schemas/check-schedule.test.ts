import { describe, expect, it } from "vitest";
import { createCheckScheduleSchema, updateCheckScheduleSchema } from "./check-schedule";

const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"b".repeat(24)}`;

describe("check schedule schemas", () => {
  it("parses a named schedule with the shared cadence defaults", () => {
    const result = createCheckScheduleSchema.parse({
      cronExpression: null,
      frequency: "daily",
      name: "Weekdays",
      projectId,
    });

    expect(result).toMatchObject({
      cronExpression: null,
      jitterMinutes: 60,
      name: "Weekdays",
    });
  });

  it("validates custom cron, timezone, and local time", () => {
    expect(() =>
      createCheckScheduleSchema.parse({
        frequency: "custom_cron",
        name: "Custom",
        projectId,
        timeOfDay: "24:15",
        timezone: "Not/A_Timezone",
      }),
    ).toThrow();
  });

  it("requires local schedule times to use 30-minute steps", () => {
    expect(
      createCheckScheduleSchema.safeParse({
        cronExpression: null,
        frequency: "daily",
        name: "Quarter past",
        projectId,
        timeOfDay: "06:15",
      }).error?.issues,
    ).toContainEqual(expect.objectContaining({ message: "Enter a time in 30-minute steps." }));
  });

  it("requires a valid persisted cron for weekly and monthly schedules", () => {
    expect(
      createCheckScheduleSchema.safeParse({
        cronExpression: "0 6 * * 5",
        frequency: "weekly",
        name: "Friday",
        projectId,
        timeOfDay: "06:00",
      }).success,
    ).toBe(true);
    expect(
      createCheckScheduleSchema.safeParse({
        cronExpression: null,
        frequency: "monthly",
        name: "Mid-month",
        projectId,
        timeOfDay: "06:00",
      }).success,
    ).toBe(false);
  });

  it("accepts the enabled toggle in partial updates", () => {
    expect(updateCheckScheduleSchema.parse({ enabled: false, projectId, scheduleId })).toEqual({
      enabled: false,
      projectId,
      scheduleId,
    });
  });

  it("accepts only catalogue providers or the project default policy", () => {
    expect(
      createCheckScheduleSchema.safeParse({
        frequency: "daily",
        name: "Pinned provider",
        projectId,
        providerPolicy: "serpapi",
      }).success,
    ).toBe(true);
    expect(
      createCheckScheduleSchema.safeParse({
        frequency: "daily",
        name: "Project provider",
        projectId,
        providerPolicy: "project",
      }).success,
    ).toBe(true);
    expect(
      createCheckScheduleSchema.safeParse({
        frequency: "daily",
        name: "Typo provider",
        projectId,
        providerPolicy: "serpapii",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields in partial updates", () => {
    expect(
      updateCheckScheduleSchema.safeParse({
        enabeld: false,
        projectId,
        scheduleId,
      }).success,
    ).toBe(false);
  });
});
