import type { DateDisplayContext } from "@/lib/dates/format";
import { describe, expect, it } from "vitest";
import { displayTime, duration } from "./AdminPrimitives";

const context: DateDisplayContext = {
  dateFormat: "day_first",
  locale: "en-GB",
  timeZone: "UTC",
};

const t = ((key: string, values?: { value: number }) => {
  if (key === "values.unavailable") return "-";
  if (!values) return key;
  if (key === "duration.milliseconds") return `${values.value} ms`;
  if (key === "duration.seconds") return `${values.value.toFixed(1)} s`;
  return `${values.value.toFixed(1)} min`;
}) as Parameters<typeof duration>[1];

describe("AdminPrimitives formatting", () => {
  it("renders unavailable timestamps as a translated unavailable value", () => {
    expect(displayTime(null, context, "-")).toBe("-");
  });

  it("formats timestamps with explicit date order, timezone, and seconds", () => {
    expect(displayTime("2026-07-17T12:34:56.000Z", context, "-")).toBe("17 Jul 2026, 12:34:56");
  });

  it("renders unavailable durations as a translated unavailable value", () => {
    expect(duration(null, t)).toBe("-");
  });

  it("formats durations through ICU numeric arguments", () => {
    expect(duration(499.5, t)).toBe("500 ms");
    expect(duration(1_500, t)).toBe("1.5 s");
    expect(duration(90_000, t)).toBe("1.5 min");
  });
});
