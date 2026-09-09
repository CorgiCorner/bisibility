import { describe, expect, it } from "vitest";
import { scheduleNameAfterChange, suggestedScheduleName } from "./suggested-name";

const daily = {
  frequency: "daily",
  timeOfDay: "06:00",
  weekday: "Monday",
  dayOfMonth: "1st",
  cronExpression: "0 6 * * *",
};

describe("automatic schedule names", () => {
  it("describes monthly, custom and distributed schedules", () => {
    expect(suggestedScheduleName({ ...daily, frequency: "monthly", dayOfMonth: "15th" })).toBe(
      "Monthly · 15th 06:00",
    );
    expect(
      suggestedScheduleName({ ...daily, frequency: "custom_cron", cronExpression: "0 8 * * 1-5" }),
    ).toBe("Custom · 0 8 * * 1-5");
    expect(suggestedScheduleName({ ...daily, timeOfDay: "" })).toBe("Daily No fixed time");
  });

  it("continues updating automatic names, but preserves a name supplied by the user", () => {
    const weekly = { ...daily, frequency: "weekly" };
    const name = scheduleNameAfterChange("Daily 06:00", daily, weekly);
    expect(scheduleNameAfterChange(name, weekly, { ...weekly, timeOfDay: "08:00" })).toBe(
      "Weekly · Mon 08:00",
    );
    expect(scheduleNameAfterChange("Priority keywords", weekly, daily)).toBe("Priority keywords");
  });
});
