import { describe, expect, it, vi } from "vitest";
import {
  computeDispatcherNextCheckAt,
  deterministicJitterSeconds,
  dispatcherNextCheckAtMatchesRecurrence,
  intervalPhaseSeconds,
} from "./dispatcher-recurrence";

vi.mock("server-only", () => ({}));

describe("dispatcher recurrence", () => {
  it("advances daily and weekly schedules from stable keyword phases", () => {
    const from = new Date("2026-07-28T12:00:00.000Z");
    const daily = { frequency: "daily" as const, jitterMinutes: 0, timezone: "UTC" };
    const weekly = { frequency: "weekly" as const, jitterMinutes: 0, timezone: "UTC" };

    const dailyNext = computeDispatcherNextCheckAt(daily, "keyword_1", from);
    const weeklyNext = computeDispatcherNextCheckAt(weekly, "keyword_1", from);

    expect(dailyNext).toEqual(computeDispatcherNextCheckAt(daily, "keyword_1", from));
    expect(weeklyNext).toEqual(computeDispatcherNextCheckAt(weekly, "keyword_1", from));
    expect(
      computeDispatcherNextCheckAt(daily, "keyword_1", dailyNext).getTime() - dailyNext.getTime(),
    ).toBe(24 * 60 * 60 * 1_000);
    expect(
      computeDispatcherNextCheckAt(weekly, "keyword_1", weeklyNext).getTime() -
        weeklyNext.getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1_000);
  });

  it("allows a weekly phase within the next day", () => {
    const from = new Date("2026-07-28T12:00:00.000Z");
    const next = computeDispatcherNextCheckAt(
      { frequency: "weekly", jitterMinutes: 0, timezone: "UTC" },
      "keyword_4",
      from,
    );

    expect(next.toISOString()).toBe("2026-07-29T04:12:36.000Z");
    expect(next.getTime() - from.getTime()).toBeLessThan(24 * 60 * 60 * 1_000);
  });

  it("advances monthly schedules from their intent anchor without changing it", () => {
    const schedule = {
      frequency: "monthly" as const,
      jitterMinutes: 0,
      nextCheckAt: new Date("2026-01-31T06:30:00.000Z"),
      timezone: "UTC",
    };

    expect(
      computeDispatcherNextCheckAt(
        schedule,
        "keyword_1",
        new Date("2026-01-31T07:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-02-28T06:30:00.000Z");
    expect(schedule.nextCheckAt.toISOString()).toBe("2026-01-31T06:30:00.000Z");
  });

  it("advances custom cron schedules in their IANA timezone", () => {
    expect(
      computeDispatcherNextCheckAt(
        {
          cronExpression: "15 6 * * 1",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "Europe/Warsaw",
        },
        "keyword_1",
        new Date("2026-07-27T04:16:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-03T04:15:00.000Z");
  });

  it("rejects a persisted nextCheckAt after recurrence inputs change", () => {
    const keywordId = "keyword_recurrence_change";
    const from = new Date("2026-07-29T12:00:00.000Z");
    const daily = { frequency: "daily" as const, jitterMinutes: 0, timezone: "UTC" };
    const nextCheckAt = computeDispatcherNextCheckAt(daily, keywordId, from);

    expect(dispatcherNextCheckAtMatchesRecurrence(daily, keywordId, nextCheckAt)).toBe(true);
    expect(
      dispatcherNextCheckAtMatchesRecurrence(
        {
          cronExpression: "17 3 1 1 *",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "UTC",
        },
        keywordId,
        nextCheckAt,
      ),
    ).toBe(false);
  });

  it("rejects a future occurrence that skips 365 daily periods", () => {
    const referenceAt = new Date("2026-07-29T12:00:00.000Z");
    const schedule = { frequency: "daily" as const, jitterMinutes: 0, timezone: "UTC" };
    const immediate = computeDispatcherNextCheckAt(schedule, "keyword_1", referenceAt);
    const skipped = new Date(immediate.getTime() + 365 * 24 * 60 * 60 * 1_000);

    expect(
      dispatcherNextCheckAtMatchesRecurrence(schedule, "keyword_1", skipped, referenceAt),
    ).toBe(false);
  });

  it("accepts a legitimate overdue occurrence", () => {
    const schedule = { frequency: "daily" as const, jitterMinutes: 0, timezone: "UTC" };
    const generatedAt = new Date("2026-07-01T12:00:00.000Z");
    const overdue = computeDispatcherNextCheckAt(schedule, "keyword_1", generatedAt);

    expect(
      dispatcherNextCheckAtMatchesRecurrence(
        schedule,
        "keyword_1",
        overdue,
        new Date("2026-07-29T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("accepts the immediate next occurrence at the shared reference time", () => {
    const referenceAt = new Date("2026-07-29T12:00:00.000Z");
    const schedule = {
      cronExpression: "15 6 * * 1",
      frequency: "custom_cron" as const,
      jitterMinutes: 30,
      timezone: "Europe/Warsaw",
    };
    const immediate = computeDispatcherNextCheckAt(schedule, "keyword_1", referenceAt);

    expect(
      dispatcherNextCheckAtMatchesRecurrence(schedule, "keyword_1", immediate, referenceAt),
    ).toBe(true);
  });

  it("moves a nonexistent spring-forward wall time through the DST gap", () => {
    expect(
      computeDispatcherNextCheckAt(
        {
          cronExpression: "30 2 * * *",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "Europe/Warsaw",
        },
        "keyword_1",
        new Date("2026-03-28T02:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-03-29T01:30:00.000Z");
  });

  it("uses the first repeated wall time during the fall-back transition", () => {
    expect(
      computeDispatcherNextCheckAt(
        {
          cronExpression: "30 2 * * *",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "Europe/Warsaw",
        },
        "keyword_1",
        new Date("2026-10-24T01:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-10-25T00:30:00.000Z");
  });

  it("spreads keywords deterministically within bounded intervals and jitter", () => {
    const dailySeconds = 24 * 60 * 60;
    const firstPhase = intervalPhaseSeconds("keyword_1", dailySeconds);
    const secondPhase = intervalPhaseSeconds("keyword_2", dailySeconds);

    expect(firstPhase).toBe(intervalPhaseSeconds("keyword_1", dailySeconds));
    expect(firstPhase).toBeGreaterThanOrEqual(0);
    expect(firstPhase).toBeLessThan(dailySeconds);
    expect(secondPhase).not.toBe(firstPhase);
    expect(deterministicJitterSeconds("keyword_1", 60)).toBe(
      deterministicJitterSeconds("keyword_1", 60),
    );
    expect(deterministicJitterSeconds("keyword_1", 60)).toBeLessThanOrEqual(3_600);
  });
});
