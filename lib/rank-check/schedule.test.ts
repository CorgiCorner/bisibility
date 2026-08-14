import { describe, expect, it } from "vitest";
import { computeNextCheckAt, isScheduledFrequency } from "./schedule";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function zonedClockParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    weekday: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;

  return {
    day: Number(value("day")),
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

describe("isScheduledFrequency", () => {
  it("recognizes only frequencies that create scheduled runs", () => {
    expect(["daily", "weekly", "monthly", "custom_cron"].every(isScheduledFrequency)).toBe(true);
    expect(["manual", "paused", "unknown"].some(isScheduledFrequency)).toBe(false);
  });
});

describe("computeNextCheckAt", () => {
  it("runs scheduled frequencies and returns null only for manual and paused", () => {
    const from = new Date("2026-01-01T06:00:00.000Z");

    expect(computeNextCheckAt({ frequency: "paused", jitterMinutes: 0 }, from)).toBeNull();
    expect(computeNextCheckAt({ frequency: "manual", jitterMinutes: 0 }, from)).toBeNull();
    expect(computeNextCheckAt({ frequency: "daily", jitterMinutes: 0 }, from)?.toISOString()).toBe(
      "2026-01-02T06:00:00.000Z",
    );
    expect(computeNextCheckAt({ frequency: "weekly", jitterMinutes: 0 }, from)?.toISOString()).toBe(
      "2026-01-08T06:00:00.000Z",
    );
    expect(
      computeNextCheckAt(
        { frequency: "custom_cron", cronExpression: "0 7 * * *", jitterMinutes: 0 },
        from,
      )?.toISOString(),
    ).toBe("2026-01-01T07:00:00.000Z");
  });

  it("uses UTC when timezone is omitted or null", () => {
    const from = new Date("2026-01-01T06:00:00.000Z");

    expect(
      computeNextCheckAt(
        { frequency: "daily", timezone: undefined, jitterMinutes: 0 },
        from,
      )?.toISOString(),
    ).toBe("2026-01-02T06:00:00.000Z");
    expect(
      computeNextCheckAt(
        { frequency: "weekly", timezone: null, jitterMinutes: 0 },
        from,
      )?.toISOString(),
    ).toBe("2026-01-08T06:00:00.000Z");
  });

  it("keeps daily wall-clock time across New York spring-forward", () => {
    const timezone = "America/New_York";
    const from = new Date("2026-03-07T14:30:00.000Z");
    const next = computeNextCheckAt({ frequency: "daily", timezone, jitterMinutes: 0 }, from);

    expect(next?.toISOString()).toBe("2026-03-08T13:30:00.000Z");
    expect(zonedClockParts(next as Date, timezone)).toEqual({
      day: 8,
      weekday: "Sun",
      hour: 9,
      minute: 30,
    });
    expect((next as Date).getTime() - from.getTime()).toBe(23 * HOUR_MS);
  });

  it("keeps daily wall-clock time across New York fall-back", () => {
    const timezone = "America/New_York";
    const from = new Date("2026-10-31T13:30:00.000Z");
    const next = computeNextCheckAt({ frequency: "daily", timezone, jitterMinutes: 0 }, from);

    expect(next?.toISOString()).toBe("2026-11-01T14:30:00.000Z");
    expect(zonedClockParts(next as Date, timezone)).toEqual({
      day: 1,
      weekday: "Sun",
      hour: 9,
      minute: 30,
    });
    expect((next as Date).getTime() - from.getTime()).toBe(25 * HOUR_MS);
  });

  it("keeps weekly weekday and wall-clock time in Warsaw", () => {
    const timezone = "Europe/Warsaw";
    const from = new Date("2026-03-25T09:15:00.000Z");
    const next = computeNextCheckAt({ frequency: "weekly", timezone, jitterMinutes: 0 }, from);

    expect(zonedClockParts(from, timezone)).toEqual({
      day: 25,
      weekday: "Wed",
      hour: 10,
      minute: 15,
    });
    expect(next?.toISOString()).toBe("2026-04-01T08:15:00.000Z");
    expect(zonedClockParts(next as Date, timezone)).toEqual({
      day: 1,
      weekday: "Wed",
      hour: 10,
      minute: 15,
    });
  });

  it("runs monthly from January 15 to February 15 at the same wall-clock time", () => {
    const from = new Date("2026-01-15T06:30:00.000Z");

    expect(
      computeNextCheckAt({ frequency: "monthly", timezone: "UTC", jitterMinutes: 0 }, from),
    ).toEqual(new Date("2026-02-15T06:30:00.000Z"));
  });

  it("clamps monthly schedules anchored on January 31 to February 28", () => {
    const from = new Date("2026-01-31T06:30:00.000Z");

    expect(
      computeNextCheckAt({ frequency: "monthly", timezone: "UTC", jitterMinutes: 0 }, from),
    ).toEqual(new Date("2026-02-28T06:30:00.000Z"));
  });

  it("keeps the nominal monthly wall-clock time independent of runtime jitter", () => {
    const timezone = "America/New_York";
    const from = new Date("2026-02-15T14:30:00.000Z");
    const next = computeNextCheckAt({ frequency: "monthly", timezone, jitterMinutes: 10 }, from);

    expect(next).toEqual(new Date("2026-03-15T13:30:00.000Z"));
    expect(zonedClockParts(next as Date, timezone)).toMatchObject({ day: 15, hour: 9 });
  });

  it("advances delayed monthly retries from the persisted wall-clock anchor", () => {
    const schedule = {
      frequency: "monthly" as const,
      jitterMinutes: 120,
      nextCheckAt: new Date("2026-02-15T06:00:00.000Z"),
      timezone: "UTC",
    };

    expect(computeNextCheckAt(schedule, new Date("2026-02-15T07:30:00.000Z"))).toEqual(
      new Date("2026-03-15T06:00:00.000Z"),
    );
    expect(computeNextCheckAt(schedule, new Date("2026-02-15T08:45:00.000Z"))).toEqual(
      new Date("2026-03-15T06:00:00.000Z"),
    );
  });

  it("keeps nominal daily times independent of runtime jitter", () => {
    const from = new Date("2026-01-01T06:00:00.000Z");

    expect(
      computeNextCheckAt({ frequency: "daily", timezone: null, jitterMinutes: 10 }, from),
    ).toEqual(new Date("2026-01-02T06:00:00.000Z"));
  });

  it("does not apply interval phases to monthly or custom cron schedules", () => {
    const from = new Date("2026-01-01T05:59:30.000Z");
    const schedules = [
      { frequency: "monthly" as const, timezone: "UTC" },
      { cronExpression: "0 7 * * *", frequency: "custom_cron" as const, timezone: "UTC" },
    ];

    for (const schedule of schedules) {
      expect(computeNextCheckAt(schedule, from, "keyword_1")).toEqual(
        computeNextCheckAt(schedule, from, "keyword_2"),
      );
    }
  });

  it.each(["daily", "weekly"] as const)(
    "anchors the keyword-specific %s phase in the project timezone",
    (frequency) => {
      const from = new Date("2026-07-28T00:00:00.000Z");
      const keywordId = "keyword_1";
      const warsaw = computeNextCheckAt(
        { frequency, timezone: "Europe/Warsaw" },
        from,
        keywordId,
      ) as Date;
      const utc = computeNextCheckAt({ frequency, timezone: "UTC" }, from, keywordId) as Date;

      expect(warsaw).not.toEqual(utc);
      expect(zonedClockParts(warsaw, "Europe/Warsaw")).toMatchObject({
        hour: 5,
        minute: 50,
      });
      expect(zonedClockParts(utc, "UTC")).toMatchObject({ hour: 5, minute: 50 });
    },
  );

  it("keeps monthly and custom cron schedules anchored to wall-clock timezone", () => {
    const monthlyFrom = new Date("2026-03-15T08:30:00.000Z");
    expect(
      computeNextCheckAt({ frequency: "monthly", timezone: "Europe/Warsaw" }, monthlyFrom),
    ).toEqual(new Date("2026-04-15T07:30:00.000Z"));
    expect(computeNextCheckAt({ frequency: "monthly", timezone: "UTC" }, monthlyFrom)).toEqual(
      new Date("2026-04-15T08:30:00.000Z"),
    );

    const cronFrom = new Date("2026-07-28T07:59:00.000Z");
    const cron = { cronExpression: "0 9 * * *", frequency: "custom_cron" as const };
    expect(computeNextCheckAt({ ...cron, timezone: "Europe/Warsaw" }, cronFrom)).toEqual(
      new Date("2026-07-29T07:00:00.000Z"),
    );
    expect(computeNextCheckAt({ ...cron, timezone: "UTC" }, cronFrom)).toEqual(
      new Date("2026-07-28T09:00:00.000Z"),
    );
  });

  it("computes the next 5-field cron run", () => {
    const from = new Date("2026-01-01T05:59:30.000Z");

    expect(
      computeNextCheckAt(
        { frequency: "custom_cron", cronExpression: "*/15 6 * * *", jitterMinutes: 0 },
        from,
      )?.toISOString(),
    ).toBe("2026-01-01T06:00:00.000Z");
  });

  it("supports cron lists, ranges, and day-of-week values", () => {
    const from = new Date("2026-01-04T06:05:00.000Z");

    expect(
      computeNextCheckAt(
        { frequency: "custom_cron", cronExpression: "5,10 6-7 * * 1", jitterMinutes: 0 },
        from,
      )?.toISOString(),
    ).toBe("2026-01-05T06:05:00.000Z");
  });

  it("evaluates cron expressions in the configured timezone", () => {
    const from = new Date("2026-01-01T07:59:00.000Z");

    expect(
      computeNextCheckAt(
        {
          frequency: "custom_cron",
          cronExpression: "0 9 * * *",
          timezone: "Europe/Warsaw",
          jitterMinutes: 0,
        },
        from,
      )?.toISOString(),
    ).toBe("2026-01-01T08:00:00.000Z");
  });
});
