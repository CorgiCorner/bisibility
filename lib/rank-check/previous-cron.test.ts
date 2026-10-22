import { describe, expect, it } from "vitest";
import { nextCanonicalCronRun, previousCronRun } from "./previous-cron";

describe("previous planner cron anchor", () => {
  it("includes the current minute's anchor", () => {
    expect(previousCronRun("0 9 * * *", new Date("2026-10-21T09:10:00Z"), "UTC")).toEqual(
      new Date("2026-10-21T09:00:00Z"),
    );
  });
  it("keeps numeric lists, ranges and wildcard/range steps at their actual times", () => {
    const from = new Date("2026-10-21T09:10:00Z");
    expect(nextCanonicalCronRun("0 9,12 * * 1-5", from, "UTC")).toEqual(
      new Date("2026-10-21T12:00:00Z"),
    );
    expect(nextCanonicalCronRun("*/30 9-17/2 * * *", from, "UTC")).toEqual(
      new Date("2026-10-21T09:30:00Z"),
    );
  });
  it("keeps the planner's AND semantics for day-of-month and weekday", () => {
    expect(previousCronRun("0 9 1 * 1", new Date("2026-10-21T09:10:00Z"), "UTC")).toEqual(
      new Date("2026-06-01T09:00:00Z"),
    );
  });
  it("selects the latest real instant in a repeated DST hour", () => {
    expect(
      previousCronRun("30 2 * * *", new Date("2026-10-25T01:40:00Z"), "Europe/Warsaw"),
    ).toEqual(new Date("2026-10-25T01:30:00Z"));
  });
  it.each([
    "* * *",
    "0 9 * * 5L",
    "0 9 * * MON",
    "0 9 * * 1#2",
    "0/2 9 * * *",
    "0 9 * * 1/2",
    "0 9 * * */2/3",
    "0 0 9 * * *",
  ])("does not reinterpret unsupported existing syntax: %s", (expression) => {
    expect(previousCronRun(expression, new Date("2026-10-21"), "UTC")).toBeNull();
    expect(nextCanonicalCronRun(expression, new Date("2026-10-21"), "UTC")).toBeNull();
  });
  it("finds a sparse prior anchor beyond one year when upcoming occurrences remain valid", () => {
    expect(previousCronRun("0 0 1 2,5,11 1", new Date("2026-10-21T09:10:00Z"), "UTC")).toEqual(
      new Date("2023-05-01T00:00:00Z"),
    );
  });
  it("finds a first and following canonical next anchor beyond the worker's one-year search", () => {
    const from = new Date("2028-10-21T09:10:00Z");
    const expression = "0 0 1 2 1";
    expect(nextCanonicalCronRun(expression, from, "UTC")).toEqual(new Date("2038-02-01T00:00:00Z"));
    expect(nextCanonicalCronRun(expression, new Date("2038-02-01T00:00:00Z"), "UTC")).toEqual(
      new Date("2044-02-01T00:00:00Z"),
    );
  });
  it("uses the earliest real instant when the next local hour repeats", () => {
    expect(
      nextCanonicalCronRun("30 2 * * *", new Date("2026-10-25T00:10:00Z"), "Europe/Warsaw"),
    ).toEqual(new Date("2026-10-25T00:30:00Z"));
    expect(
      nextCanonicalCronRun("30 2 * * *", new Date("2026-10-25T00:40:00Z"), "Europe/Warsaw"),
    ).toEqual(new Date("2026-10-25T01:30:00Z"));
  });
  it("keeps a spring DST gap absent rather than normalizing it into a different hour", () => {
    expect(
      nextCanonicalCronRun("30 2 * * *", new Date("2026-03-29T00:10:00Z"), "Europe/Warsaw"),
    ).toEqual(new Date("2026-03-30T00:30:00Z"));
  });
  it("returns unavailable for OR-accepted but canonical-impossible calendar dates", () => {
    expect(previousCronRun("0 0 31 2 1", new Date("2026-10-21"), "UTC")).toBeNull();
    expect(nextCanonicalCronRun("0 0 31 2 1", new Date("2026-10-21"), "UTC")).toBeNull();
  });
});
