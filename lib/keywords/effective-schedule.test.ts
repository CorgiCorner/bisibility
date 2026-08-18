import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { describe, expect, it } from "vitest";
import { resolveEffectiveSchedule, summarizeEffectiveSchedules } from "./effective-schedule";

const defaults = {
  frequency: "daily" as const,
  nextCheckAt: new Date("2026-07-20T08:00:00.000Z"),
};

describe("effective keyword schedule", () => {
  it("makes a paused override non-runnable even when it has a stale next time", () => {
    const schedule = resolveEffectiveSchedule(
      { frequency: "paused", nextCheckAt: new Date("2026-07-18T08:00:00.000Z") },
      defaults,
    );

    expect(schedule).toEqual({ frequency: "paused", nextCheckAt: null, runnable: false });
    expect(summarizeEffectiveSchedules([schedule])).toEqual({ nextCheckAt: null });
  });

  it.each(["daily", "weekly"] as const)(
    "realigns a legacy explicit %s override to the stable keyword phase",
    (frequency) => {
      const now = new Date("2026-07-20T09:00:00.000Z");
      const override = {
        frequency,
        nextCheckAt: new Date("2026-07-19T08:00:00.000Z"),
        timezone: "UTC",
      };

      expect(resolveEffectiveSchedule(override, defaults, "keyword_1", now)).toEqual({
        frequency,
        nextCheckAt: computeNextCheckAt(override, now, "keyword_1"),
        runnable: true,
      });
    },
  );

  it.each([
    {
      frequency: "monthly",
      nextCheckAt: new Date("2026-08-15T08:30:00.000Z"),
    },
    {
      cronExpression: "45 6 * * 2",
      frequency: "custom_cron",
      nextCheckAt: new Date("2026-07-21T06:45:00.000Z"),
    },
  ] as const)("preserves the explicit anchor for $frequency schedules", (override) => {
    expect(
      resolveEffectiveSchedule(override, defaults, "keyword_1", new Date("2026-07-20T09:00:00Z")),
    ).toEqual({
      frequency: override.frequency,
      nextCheckAt: override.nextCheckAt,
      runnable: true,
    });
  });

  it("inherits the project default when no keyword override exists", () => {
    const now = new Date("2026-07-20T09:00:00.000Z");
    expect(resolveEffectiveSchedule(null, defaults, "keyword_1", now)).toEqual({
      frequency: "daily",
      nextCheckAt: computeNextCheckAt(defaults, now, "keyword_1"),
      runnable: true,
    });
  });
});
