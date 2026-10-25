import { describe, expect, it } from "vitest";
import { checkWindow, inWindow, persistedWithinCutoff, summaryWritable } from "./window";

const date = (time: string) => new Date(`2026-10-24T${time}Z`);
describe("CN-4/CN-5 UTC windows and persistence cutoff", () => {
  it("uses half-open finish hours and checkedAt fallback", () => {
    const early = { finishedAt: date("06:59:59.999"), checkedAt: date("05:30:00") };
    const window = checkWindow(early);
    expect(window.start).toEqual(date("06:00:00"));
    expect(checkWindow({ ...early, finishedAt: date("07:00:00") }).start).toEqual(date("07:00:00"));
    expect(checkWindow({ ...early, finishedAt: null }).start).toEqual(date("05:00:00"));
    expect(inWindow({ ...early, finishedAt: date("07:00:00") }, window)).toBe(false);
    expect(persistedWithinCutoff(date("07:05:00"), window.end)).toBe(true);
    expect(checkWindow({ ...early, finishedAt: date("07:05:00") }).start).toEqual(date("07:00:00"));
    expect(persistedWithinCutoff(date("07:15:00"), window.end)).toBe(false);
    expect(persistedWithinCutoff(null, window.end)).toBe(false);
  });
  it("writes only after end and strictly before cutoff, skipping outage windows", () => {
    expect(summaryWritable(date("07:00:00"), date("06:59:59.999"))).toBe(false);
    expect(summaryWritable(date("07:00:00"), date("07:00:00"))).toBe(true);
    expect(summaryWritable(date("07:00:00"), date("07:14:59.999"))).toBe(true);
    expect(summaryWritable(date("07:00:00"), date("07:15:00"))).toBe(false);
    expect(summaryWritable(date("07:00:00"), date("08:00:00"))).toBe(false);
  });
});
