import { describe, expect, it } from "vitest";
import { formatScheduledRun } from "./schedule-phrase";

describe("formatScheduledRun", () => {
  it("combines relative and absolute local time with the supplied timezone", () => {
    expect(
      formatScheduledRun({
        nextRunAt: new Date("2026-08-31T04:00:00.000Z"),
        now: new Date("2026-08-30T17:00:00.000Z"),
        timezone: "Europe/Warsaw",
      }),
    ).toBe("Scheduled - runs tomorrow at 06:00 (Europe/Warsaw)");
  });

  it("does not assume a scheduled run is tonight", () => {
    const phrase = formatScheduledRun({
      nextRunAt: new Date("2026-09-01T04:00:00.000Z"),
      now: new Date("2026-08-30T17:00:00.000Z"),
      timezone: "Europe/Warsaw",
    });
    expect(phrase).toBe("Scheduled - runs in 2 days at 06:00 (Europe/Warsaw)");
    expect(phrase).not.toContain("tonight");
  });
});
