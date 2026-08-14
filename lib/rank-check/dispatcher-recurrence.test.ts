import {
  computeDispatcherNextCheckAt,
  deterministicJitterSeconds,
  dispatcherNextCheckAtMatchesRecurrence,
  intervalPhaseSeconds,
  nextThreeCronRuns,
} from "@/lib/rank-check/dispatcher-recurrence";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("dispatcher recurrence", () => {
  it("advances daily and weekly schedules from stable local keyword phases", () => {
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

  it("keeps a daily keyword phase at the same Warsaw wall-clock time across DST", () => {
    const schedule = {
      frequency: "daily" as const,
      jitterMinutes: 0,
      timezone: "Europe/Warsaw",
    };
    const previous = new Date("2026-03-28T04:50:18.000Z");
    const next = computeDispatcherNextCheckAt(schedule, "keyword_1", previous);

    expect(next.toISOString()).toBe("2026-03-29T03:50:18.000Z");
    expect(next.getTime() - previous.getTime()).toBe(23 * 60 * 60 * 1_000);
  });

  it("keeps a weekly keyword phase at the same Warsaw weekday and time across DST", () => {
    const schedule = {
      frequency: "weekly" as const,
      jitterMinutes: 0,
      timezone: "Europe/Warsaw",
    };
    const previous = new Date("2026-03-22T04:50:18.000Z");
    const next = computeDispatcherNextCheckAt(schedule, "keyword_1", previous);

    expect(next.toISOString()).toBe("2026-03-29T03:50:18.000Z");
    expect(next.getTime() - previous.getTime()).toBe(167 * 60 * 60 * 1_000);
  });

  it("moves a stable daily phase through the spring-forward gap without skipping a day", () => {
    const schedule = {
      frequency: "daily" as const,
      jitterMinutes: 0,
      timezone: "Europe/Warsaw",
    };
    const gapRun = computeDispatcherNextCheckAt(
      schedule,
      "dst_3857",
      new Date("2026-03-28T02:00:00.000Z"),
    );

    expect(gapRun.toISOString()).toBe("2026-03-29T01:30:01.000Z");
    expect(computeDispatcherNextCheckAt(schedule, "dst_3857", gapRun).toISOString()).toBe(
      "2026-03-30T00:30:01.000Z",
    );
  });

  it("uses one stable weekly occurrence during the repeated fall-back hour", () => {
    const schedule = {
      frequency: "weekly" as const,
      jitterMinutes: 0,
      timezone: "Europe/Warsaw",
    };
    const repeatedHourRun = computeDispatcherNextCheckAt(
      schedule,
      "weekly_dst_446",
      new Date("2026-10-24T01:00:00.000Z"),
    );

    expect(repeatedHourRun.toISOString()).toBe("2026-10-25T00:30:39.000Z");
    expect(
      computeDispatcherNextCheckAt(schedule, "weekly_dst_446", repeatedHourRun).toISOString(),
    ).toBe("2026-11-01T01:30:39.000Z");
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

  it("returns the next three custom cron runs in the dispatcher's timezone", () => {
    const input = {
      cronExpression: "15 6 * * 1",
      from: new Date("2026-07-27T04:16:00.000Z"),
      timezone: "Europe/Warsaw",
    };
    const runs = nextThreeCronRuns(input);

    expect(runs.map((run) => run.toISOString())).toEqual([
      "2026-08-03T04:15:00.000Z",
      "2026-08-10T04:15:00.000Z",
      "2026-08-17T04:15:00.000Z",
    ]);
    expect(
      computeDispatcherNextCheckAt(
        { ...input, frequency: "custom_cron", jitterMinutes: 0 },
        "keyword_1",
        input.from,
      ),
    ).toEqual(runs[0]);
  });

  it("returns deterministic next-three cron previews", () => {
    const input = {
      cronExpression: "0 */4 * * *",
      from: new Date("2026-01-01T01:15:00.000Z"),
      timezone: "UTC",
    };

    expect(nextThreeCronRuns(input)).toEqual(nextThreeCronRuns(input));
    expect(nextThreeCronRuns(input).map((run) => run.toISOString())).toEqual([
      "2026-01-01T04:00:00.000Z",
      "2026-01-01T08:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
    ]);
  });

  it("rejects a persisted nextCheckAt after recurrence inputs change", () => {
    const keywordId = "keyword_recurrence_change";
    const from = new Date("2026-07-29T12:00:00.000Z");
    const daily = { frequency: "daily" as const, jitterMinutes: 0, timezone: "UTC" };
    const nextCheckAt = computeDispatcherNextCheckAt(daily, keywordId, from);

    expect(dispatcherNextCheckAtMatchesRecurrence(daily, keywordId, nextCheckAt, from)).toBe(true);
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
        from,
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
    const from = new Date("2026-07-28T00:00:00.000Z");
    const schedule = { frequency: "daily" as const, jitterMinutes: 60, timezone: "UTC" };
    expect(computeDispatcherNextCheckAt(schedule, "keyword_1", from)).not.toEqual(
      computeDispatcherNextCheckAt(schedule, "keyword_2", from),
    );
    expect(deterministicJitterSeconds("keyword_1", 60)).toBe(
      deterministicJitterSeconds("keyword_1", 60),
    );
    expect(deterministicJitterSeconds("keyword_1", 60)).toBeLessThanOrEqual(3_600);
  });
});
