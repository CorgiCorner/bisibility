import { describe, expect, it } from "vitest";
import { type DurationLabels, formatDuration } from "./format-duration";

const HOUR = 3_600;
const DAY = 86_400;

const labels: DurationLabels = {
  days: ({ count }) => (count === 1 ? "1 day" : `${count} days`),
  hours: ({ count }) => (count === 1 ? "1 hour" : `${count} hours`),
  minutes: ({ count }) => (count === 1 ? "1 minute" : `${count} minutes`),
  weeks: ({ count }) => (count === 1 ? "1 week" : `${count} weeks`),
};

describe("formatDuration", () => {
  it.each([
    [59 * 60, "59 minutes"],
    [HOUR, "1 hour"],
    [23 * HOUR, "23 hours"],
    [24 * HOUR, "1 day"],
    [13 * DAY + 23 * HOUR, "13 days"],
    [14 * DAY, "2 weeks"],
    [30 * DAY, "30 days"],
    [168 * HOUR, "7 days"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds, labels)).toBe(expected);
  });

  it("rounds a partial minute down", () => {
    expect(formatDuration(59 * 60 + 59, labels)).toBe("59 minutes");
  });
});
