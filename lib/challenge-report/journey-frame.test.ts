import { expect, it } from "vitest";
import { journeyFrameMessage } from "./journey-frame";

it("keeps legacy work-day frames and labels new frames as check-ins", () => {
  expect(journeyFrameMessage({ calendarDays: 34, workDays: 30 })).toEqual({
    key: "journeyFrame",
    values: { calendarDays: 34, workDays: 30 },
  });
  expect(journeyFrameMessage({ calendarDays: 30, checkIns: 12, workDays: 4 })).toEqual({
    key: "journeyFrameCheckIns",
    values: { calendarDays: 30, checkIns: 12 },
  });
});
