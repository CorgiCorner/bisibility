import { describe, expect, it } from "vitest";
import {
  type ScheduleNameLabels,
  scheduleNameAfterChange,
  suggestedScheduleName,
} from "./suggested-name";

const daily = {
  frequency: "daily",
  timeOfDay: "06:00",
  weekday: "Monday",
  dayOfMonth: "1st",
  cronExpression: "0 6 * * *",
};

// The English catalog values, so the generated names read the way the product ships them.
const english: ScheduleNameLabels = {
  custom: (expression) => `Custom · ${expression}`,
  daily: (time) => `Daily ${time}`,
  monthly: (day, time) => `Monthly · ${day} ${time}`,
  noFixedTime: "No fixed time",
  weekly: (weekday, time) => `Weekly · ${weekday} ${time}`,
};

// A locale whose words and order differ, proving the name is assembled from the catalog only.
const polish: ScheduleNameLabels = {
  custom: (expression) => `Niestandardowy · ${expression}`,
  daily: (time) => `Codziennie ${time}`,
  monthly: (day, time) => `Miesięcznie · ${day} ${time}`,
  noFixedTime: "Bez stałej godziny",
  weekly: (weekday, time) => `Co tydzień · ${weekday} ${time}`,
};

describe("automatic schedule names", () => {
  it("describes monthly, custom and distributed schedules", () => {
    expect(
      suggestedScheduleName({ ...daily, frequency: "monthly", dayOfMonth: "15th" }, english),
    ).toBe("Monthly · 15th 06:00");
    expect(
      suggestedScheduleName(
        { ...daily, frequency: "custom_cron", cronExpression: "0 8 * * 1-5" },
        english,
      ),
    ).toBe("Custom · 0 8 * * 1-5");
    expect(suggestedScheduleName({ ...daily, timeOfDay: "" }, english)).toBe("Daily No fixed time");
  });

  it("builds the name from the caller's locale copy, never an English literal", () => {
    expect(suggestedScheduleName(daily, polish)).toBe("Codziennie 06:00");
    expect(suggestedScheduleName({ ...daily, timeOfDay: "" }, polish)).toBe(
      "Codziennie Bez stałej godziny",
    );
    expect(suggestedScheduleName({ ...daily, frequency: "weekly" }, polish)).toBe(
      "Co tydzień · Mon 06:00",
    );
  });

  it("continues updating automatic names, but preserves a name supplied by the user", () => {
    const weekly = { ...daily, frequency: "weekly" };
    const name = scheduleNameAfterChange("Daily 06:00", daily, weekly, english);
    expect(scheduleNameAfterChange(name, weekly, { ...weekly, timeOfDay: "08:00" }, english)).toBe(
      "Weekly · Mon 08:00",
    );
    expect(scheduleNameAfterChange("Priority keywords", weekly, daily, english)).toBe(
      "Priority keywords",
    );
  });
});
