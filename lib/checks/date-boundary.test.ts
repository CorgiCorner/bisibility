import { describe, expect, it } from "vitest";
import { checkedAtEndForDate, zonedDateInputValue } from "./date-boundary";

describe("check date boundaries", () => {
  it("formats the request time in the project timezone", () => {
    expect(zonedDateInputValue(new Date("2026-07-24T22:30:00.000Z"), "Europe/Warsaw")).toBe(
      "2026-07-25",
    );
  });

  it("uses the end of the selected project-local day as the inclusive range boundary", () => {
    expect(checkedAtEndForDate("2026-07-24", "Europe/Warsaw")).toBe("2026-07-24T21:59:59.999Z");
    expect(checkedAtEndForDate("2026-01-24", "Europe/Warsaw")).toBe("2026-01-24T22:59:59.999Z");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => checkedAtEndForDate("2026-02-30", "UTC")).toThrow("Choose a valid date.");
  });
});
