import { describe, expect, it } from "vitest";
import { type ScheduleCadenceLabels, scheduleCadenceLabel } from "./cadence-label";

const labels: ScheduleCadenceLabels = {
  custom: (expression) => `Custom - ${expression}`,
  daily: (time) => `Daily, ${time}`,
  every: (interval) => `Every ${interval} · no fixed time`,
  manual: () => "Manual",
  monthly: (day, time) => `Monthly on the ${day}, ${time}`,
  paused: () => "Paused",
  weekday: (day) => day,
  weekly: (day, time) => `${day}, ${time}`,
};

describe("schedules without a fixed time", () => {
  it.each([
    ["daily", "day"],
    ["weekly", "week"],
    ["monthly", "month"],
  ] as const)("names the distributed %s interval", (frequency, interval) => {
    expect(scheduleCadenceLabel({ frequency, timeOfDay: null }, labels)).toBe(
      `Every ${interval} · no fixed time`,
    );
  });
  it("keeps explicit daily times and custom cron", () => {
    expect(scheduleCadenceLabel({ frequency: "daily", timeOfDay: "06:00" }, labels)).toBe(
      "Daily, 06:00",
    );
    expect(
      scheduleCadenceLabel(
        {
          frequency: "custom_cron",
          timeOfDay: null,
          cronExpression: "0 6 * * *",
        },
        labels,
      ),
    ).toBe("Custom - 0 6 * * *");
  });
});
