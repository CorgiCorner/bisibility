import { describe, expect, it } from "vitest";
import { scheduleCadenceLabel } from "./cadence-label";

describe("schedules without a fixed time", () => {
  it.each([
    ["daily", "day"],
    ["weekly", "week"],
    ["monthly", "month"],
  ] as const)("names the distributed %s interval", (frequency, interval) => {
    expect(scheduleCadenceLabel({ frequency, timeOfDay: null })).toBe(
      `Every ${interval} · no fixed time`,
    );
  });
  it("keeps explicit daily times and custom cron", () => {
    expect(scheduleCadenceLabel({ frequency: "daily", timeOfDay: "06:00" })).toBe("Daily, 06:00");
    expect(
      scheduleCadenceLabel({
        frequency: "custom_cron",
        timeOfDay: null,
        cronExpression: "0 6 * * *",
      }),
    ).toBe("Custom - 0 6 * * *");
  });
});
