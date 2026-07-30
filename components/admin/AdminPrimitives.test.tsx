import { describe, expect, it } from "vitest";
import { displayTime, duration } from "./AdminPrimitives";

describe("AdminPrimitives formatting", () => {
  it("renders unavailable timestamps as a hyphen", () => {
    expect(displayTime(null)).toBe("-");
  });

  it("formats real timestamps", () => {
    const value = "2026-07-17T12:34:56.000Z";
    const expected = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "UTC",
      timeStyle: "medium",
    }).format(new Date(value));

    expect(displayTime(value)).toBe(expected);
  });

  it("renders unavailable durations as a hyphen", () => {
    expect(duration(null)).toBe("-");
  });

  it("formats durations in milliseconds, seconds, and minutes", () => {
    expect(duration(499.5)).toBe("500 ms");
    expect(duration(1_500)).toBe("1.5 s");
    expect(duration(90_000)).toBe("1.5 min");
  });
});
