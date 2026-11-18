import { keywordCadenceRequiresReview } from "@/lib/schedules/review-decision-keywords";
import { describe, expect, it, vi } from "vitest";
import { nextCronRun, parseCronExpression, zonedCronParts } from "./cron";
import { countCronRuns, matchesCron, zonedInstant } from "./cron-count";
import * as cronZone from "./cron-zone";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The previous hour-by-minute walk, kept so the day-first count can be compared. */
function countCronRunsLegacy(expression: string, start: Date, end: Date, timezone: string) {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok || parsed.minute === null) return null;
  const minutes = [...parsed.minute];
  const hours = parsed.hour ? [...parsed.hour] : Array.from({ length: 24 }, (_, hour) => hour);
  let count = 0;
  let parts = cronZone.readCronZone(start, timezone);
  for (let guard = 0; guard < 370; guard += 1) {
    let reachedEnd = false;
    for (const hour of hours) {
      for (const minute of minutes) {
        const slot = zonedInstant({ ...parts, hour, minute }, timezone);
        if (slot >= end) {
          reachedEnd = true;
          continue;
        }
        if (slot >= start && matchesCron(parsed, slot, timezone)) count += 1;
      }
    }
    if (reachedEnd) break;
    const next = cronZone.readCronZone(
      new Date(zonedInstant({ ...parts, hour: 12, minute: 0 }, timezone).getTime() + DAY_MS),
      timezone,
    );
    if (next.year === parts.year && next.month === parts.month && next.day === parts.day) break;
    parts = next;
  }
  return count;
}

function window(start: string, days: number) {
  const from = new Date(start);
  return { end: new Date(from.getTime() + days * DAY_MS), start: from };
}

describe("countCronRuns day walk", () => {
  it("reuses exact zone readings without sharing mutable results", () => {
    const date = new Date("2042-06-01T09:17:00.000Z");
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    try {
      const first = cronZone.readCronZone(date, "UTC");
      first.hour = 0;
      expect(cronZone.readCronZone(new Date(date), "UTC")).toMatchObject({
        hour: 9,
        minute: 17,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(cronZone.readCronZone(date, "Asia/Kathmandu")).toMatchObject({
        hour: 15,
        minute: 2,
      });
      expect(cronZone.readCronZone(new Date(date.getTime() + 60_000), "UTC")).toMatchObject({
        hour: 9,
        minute: 18,
      });
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(["UTC", "Europe/Warsaw", "America/New_York", "Asia/Kathmandu", "Australia/Lord_Howe"])(
    "reads the same wall-clock fields as the runtime in %s",
    (timezone) => {
      for (const instant of [
        "2026-12-31T23:59:00.000Z",
        "2026-03-08T07:00:00.000Z",
        "2026-11-01T06:00:00.000Z",
        "2028-02-29T00:00:00.000Z",
      ]) {
        const date = new Date(instant);
        expect(cronZone.readCronZone(date, timezone)).toMatchObject(zonedCronParts(date, timezone));
      }
    },
  );

  it.each([
    ["0 9 * * *", "UTC", "2026-01-01T00:00:00.000Z", 40],
    ["0 9 * * *", "America/New_York", "2026-03-01T05:00:00.000Z", 20],
    ["0 9 * * *", "America/New_York", "2026-10-25T04:00:00.000Z", 16],
    ["30 1 * * *", "America/New_York", "2026-10-25T04:00:00.000Z", 16],
    ["0 9 * * 1-5", "Europe/Warsaw", "2026-03-20T00:00:00.000Z", 21],
    ["0 9 1,7,14,21,28 * *", "UTC", "2026-01-01T00:00:00.000Z", 40],
    ["0 9 * 2-6 *", "UTC", "2026-01-15T00:00:00.000Z", 60],
    ["0 9 29 2 *", "UTC", "2028-02-01T00:00:00.000Z", 40],
    ["0 9 29 2 *", "America/New_York", "2028-02-01T05:00:00.000Z", 40],
    ["0 * 29 2 *", "UTC", "2027-02-01T00:00:00.000Z", 40],
    ["*/5 * * * 1-5", "America/New_York", "2026-03-09T04:00:00.000Z", 7],
    ["*/5 * * * 1-5", "UTC", "2024-02-26T00:00:00.000Z", 7],
    ["0 9 * * *", "Asia/Kathmandu", "2026-06-01T00:15:00.000Z", 21],
    ["0 9 * * *", "Australia/Lord_Howe", "2026-04-01T13:00:00.000Z", 14],
    ["0 9 * * *", "Australia/Lord_Howe", "2026-10-01T13:00:00.000Z", 14],
    ["30 23 * * *", "America/Santiago", "2026-04-01T03:00:00.000Z", 10],
    ["0 9 1-7 * 1", "UTC", "2026-01-01T00:00:00.000Z", 90],
    ["0 9 1,15 * 1", "UTC", "2026-01-01T00:00:00.000Z", 120],
    ["0 9 * * *", "America/New_York", "2026-01-01T05:00:00.000Z", 365],
  ])("%s in %s matches the slot walk", (expression, timezone, start, days) => {
    const range = window(start, days);
    expect(countCronRuns(expression, range.start, range.end, timezone)).toBe(
      countCronRunsLegacy(expression, range.start, range.end, timezone),
    );
  });

  it("counts the missing spring-forward hour as 39 runs", () => {
    const range = window("2026-03-01T05:00:00.000Z", 20);
    expect(countCronRuns("0 2,3 * * *", range.start, range.end, "America/New_York")).toBe(39);
  });

  it("skips the Pyongyang gap after 23:00 on 2018-05-04", () => {
    const start = new Date("2018-05-03T14:00:00.000Z");
    const end = new Date("2018-05-06T00:00:00.000Z");
    expect(countCronRuns("45 23 * * *", start, end, "Asia/Pyongyang")).toBe(2);
    expect(countCronRuns("0 23 * * *", start, end, "Asia/Pyongyang")).toBe(3);
  });

  it("normalizes weekday 7 to Sunday", () => {
    const parsed = parseCronExpression("0 9 * * 7");
    expect(parsed.ok && parsed.weekday && [...parsed.weekday]).toEqual([0]);
    const range = window("2026-01-01T00:00:00.000Z", 21);
    expect(countCronRuns("0 9 * * 7", range.start, range.end, "UTC")).toBe(
      countCronRuns("0 9 * * 0", range.start, range.end, "UTC"),
    );
  });

  it("counts day-of-month and weekday with the runtime AND rule", () => {
    const expression = "0 9 1,15 * 1";
    const range = window("2026-06-01T00:00:00.000Z", 40);
    // Independent UTC oracle: inspect every minute without the runtime zone formatter.
    let runs = 0;
    for (let time = range.start.getTime(); time < range.end.getTime(); time += 60_000) {
      const date = new Date(time);
      if (
        date.getUTCMinutes() === 0 &&
        date.getUTCHours() === 9 &&
        (date.getUTCDate() === 1 || date.getUTCDate() === 15) &&
        date.getUTCDay() === 1
      ) {
        runs += 1;
      }
    }
    expect(runs).toBeGreaterThan(0);
    expect(countCronRuns(expression, range.start, range.end, "UTC")).toBe(runs);
    // The runtime scheduler uses the same AND rule: after Monday 1 June the next run is Monday 15 June,
    // not Monday 8 June as the OR rule would give.
    const first = nextCronRun(expression, new Date(range.start.getTime() - 60_000), "UTC");
    expect(first.toISOString()).toBe("2026-06-01T09:00:00.000Z");
    expect(nextCronRun(expression, first, "UTC").toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("probes a year of weekday steps with a per-day zone budget", () => {
    const start = new Date("2026-11-16T00:00:00.000Z");
    const end = new Date(start.getTime() + 365 * DAY_MS);
    const spy = vi.spyOn(cronZone, "readCronZone");
    try {
      const count = countCronRuns("*/5 * * * 1-5", start, end, "America/New_York");
      expect(count).toBeGreaterThan(0);
      expect(spy.mock.calls.length).toBeLessThan(600);
    } finally {
      spy.mockRestore();
    }
  });

  it("counts a four-year leap cron with the day walk", () => {
    const start = new Date("2026-11-16T00:00:00.000Z");
    const end = new Date(start.getTime() + 1461 * DAY_MS);
    const spy = vi.spyOn(cronZone, "readCronZone");
    try {
      expect(countCronRuns("0 9 29 2 *", start, end, "America/New_York")).toBe(1);
      expect(spy.mock.calls.length).toBeLessThan(40);
    } finally {
      spy.mockRestore();
    }
  });
});

function denseCron(index: number) {
  const skipMinute = index % 60;
  const skipHour = Math.floor(index / 60);
  const minutes = [];
  const hours = [];
  for (let minute = 0; minute < 60; minute += 1) if (minute !== skipMinute) minutes.push(minute);
  for (let hour = 0; hour < 24; hour += 1) if (hour !== skipHour) hours.push(hour);
  return `${minutes.join(",")} ${hours.join(",")} * * *`;
}

describe("keyword cadence bulk gate", () => {
  it("compares 500 distinct miss and non-miss cron pairs within a one-year zone budget", () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    const spy = vi.spyOn(cronZone, "readCronZone");
    try {
      for (let index = 0; index < 500; index += 1) {
        const cronExpression = denseCron(index);
        expect(
          keywordCadenceRequiresReview(
            {
              archivedAt: null,
              cronExpression,
              enabled: true,
              frequency: "custom_cron",
              providerPolicy: "dataforseo",
              serpDepth: 10,
            },
            {
              cronExpression: cronExpression.replace("* * *", "29 2 *"),
              frequency: "custom_cron",
              providerPolicy: "dataforseo",
            },
            10,
            now,
          ),
        ).toBe(false);
      }
      expect(spy.mock.calls.length).toBeLessThan(400_000);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);

  it("decides 500 repeated keywords with one zone walk", () => {
    const now = new Date("2026-11-16T12:00:00.000Z");
    const current = {
      archivedAt: null,
      cronExpression: "*/5 * * * 1-5",
      enabled: true,
      frequency: "custom_cron" as const,
      serpDepth: 20,
    };
    const spy = vi.spyOn(cronZone, "readCronZone");
    try {
      for (let index = 0; index < 500; index += 1) {
        expect(
          keywordCadenceRequiresReview(
            current,
            { cronExpression: "*/5 * * * 1-5", frequency: "custom_cron" },
            20,
            now,
          ),
        ).toBe(false);
      }
      expect(spy.mock.calls.length).toBeLessThan(600);
    } finally {
      spy.mockRestore();
    }
  });

  it("counts 500 distinct dense crons in Kathmandu within a per-day zone budget", () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date(start.getTime() + 365 * DAY_MS);
    const spy = vi.spyOn(cronZone, "readCronZone");
    try {
      for (let index = 0; index < 500; index += 1) {
        expect(countCronRuns(denseCron(index), start, end, "Asia/Kathmandu")).toBeGreaterThan(0);
      }
      expect(spy.mock.calls.length).toBeLessThan(400_000);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);
});
