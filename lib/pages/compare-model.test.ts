import { describe, expect, it } from "vitest";
import { getCompareForecast } from "./compare-forecast";
import {
  compareGroupMath,
  compareIndexedSeries,
  compareMembership,
  compareVerdict,
  compareWindow,
  defaultCompareAnnotation,
  valuesByDay,
} from "./compare-model";

const window = compareWindow("2026-10-15", "2026-10-28");

describe("compare window", () => {
  it("uses the same number of finalized days before and after the moment", () => {
    expect(window.day).toBe(14);
    expect(window.phase).toBe("monitoring");
    expect(window.after).toHaveLength(14);
    expect(window.before).toHaveLength(14);
    expect(window.after[0]).toBe("2026-10-15");
    expect(window.after.at(-1)).toBe("2026-10-28");
    expect(window.before[0]).toBe("2026-10-01");
    expect(window.before.at(-1)).toBe("2026-10-14");
  });

  it("caps the window at 28 days and marks it finished", () => {
    const finished = compareWindow("2026-09-01", "2026-10-28");
    expect(finished.day).toBe(28);
    expect(finished.phase).toBe("finished");
    expect(finished.after).toHaveLength(28);
    expect(finished.after[0]).toBe("2026-09-01");
    expect(finished.after.at(-1)).toBe("2026-09-28");
  });

  it("does not open a window before the moment or without a finalized day", () => {
    expect(compareWindow("2026-11-01", "2026-10-28").day).toBe(0);
    expect(compareWindow("2026-10-15", null)).toEqual({
      after: [],
      before: [],
      day: 0,
      moment: "2026-10-15",
      phase: "monitoring",
    });
  });
});

describe("default compare annotation", () => {
  const annotations = [
    { dateKey: "2026-11-10", id: "today" },
    { dateKey: "2026-11-08", id: "aged" },
    { dateKey: "2026-10-01", id: "older" },
  ];

  it("prefers the newest annotation that is at least one finalized day old", () => {
    expect(defaultCompareAnnotation(annotations, "2026-11-09")?.id).toBe("aged");
    expect(defaultCompareAnnotation(annotations, "2026-11-10")?.id).toBe("today");
    expect(defaultCompareAnnotation(annotations, "2026-11-07")?.id).toBe("older");
  });

  it("keeps a named annotation and falls back to the newest when none is old enough", () => {
    expect(defaultCompareAnnotation(annotations, "2026-11-09", "today")?.id).toBe("today");
    expect(defaultCompareAnnotation(annotations, "2026-11-09", "missing")?.id).toBe("aged");
    expect(
      defaultCompareAnnotation([{ dateKey: "2026-11-10", id: "today" }], "2026-11-09")?.id,
    ).toBe("today");
    expect(defaultCompareAnnotation(annotations, null)?.id).toBe("today");
    expect(defaultCompareAnnotation([], "2026-11-09")).toBeNull();
  });
});

describe("compare groups", () => {
  it("drops pages that belong to both tags", () => {
    expect(compareMembership(["/a", "/shared", "/b"], ["/shared", "/c"])).toEqual({
      changed: ["/a", "/b"],
      completeOverlap: false,
      overlap: ["/shared"],
      unchanged: ["/c"],
    });
    expect(compareMembership(["/shared"], ["/shared"]).completeOverlap).toBe(true);
  });

  it("hides a percent when the baseline is under 20 a day", () => {
    const values = valuesByDay([
      { day: "2026-10-01T00:00:00.000Z", value: 10 },
      { day: "2026-10-15", value: 40 },
    ]);
    const thin = compareGroupMath({ pageCount: 2, values, window });
    expect(thin.before).toBe(10);
    expect(thin.lowVolume).toBe(true);
    expect(thin.percent).toBeNull();
    expect(compareVerdict(14, thin, { percent: 6 })).toEqual({ kind: "not_enough" });
  });

  it("keeps monitoring until day 7 and then reports the gap in points", () => {
    const changed = compareGroupMath({
      pageCount: 6,
      values: valuesByDay([
        { day: "2026-10-01", value: 280 },
        { day: "2026-10-15", value: 336 },
      ]),
      window,
    });
    const unchanged = { percent: 6 };
    expect(changed.percent).toBe(20);
    expect(compareVerdict(6, changed, unchanged)).toEqual({ kind: "monitoring" });
    expect(compareVerdict(7, changed, unchanged)).toEqual({ kind: "points", points: 14 });
  });

  it("indexes each group to its own baseline average", () => {
    const series = compareIndexedSeries({
      changed: valuesByDay([
        { day: "2026-10-01", value: 100 },
        { day: "2026-10-15", value: 120 },
      ]),
      changedBaseline: 1400,
      unchanged: valuesByDay([
        { day: "2026-10-01", value: 100 },
        { day: "2026-10-15", value: 100 },
      ]),
      unchangedBaseline: 1400,
      window,
    });
    expect(series).toHaveLength(28);
    expect(series[0]).toEqual({ changed: 100, day: "2026-10-01", unchanged: 100 });
    expect(series[14]).toEqual({ changed: 120, day: "2026-10-15", unchanged: 100 });
    expect(series[1]?.changed).toBe(0);
  });
});

describe("compare forecast", () => {
  it("returns no band and no numbers in this version", async () => {
    await expect(
      getCompareForecast({
        history: [{ day: "2026-10-01", value: 20 }],
        horizonDays: 14,
      }),
    ).resolves.toBeNull();
  });
});
