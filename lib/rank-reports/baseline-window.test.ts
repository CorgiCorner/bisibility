import { describe, expect, it } from "vitest";
import { capturedBaselineWindow } from "./baseline-window";

describe("captured baseline window", () => {
  it("keeps a proven zero tolerance and clones the date", () => {
    const before = new Date("2026-10-05T12:00:00Z");
    const window = capturedBaselineWindow(before, 0);
    expect(window).toEqual({ before, notBefore: before });
    expect(window?.before).not.toBe(before);
  });
  it("keeps unknown and unsafe tolerances unavailable", () => {
    const before = new Date("2026-10-05T12:00:00Z");
    for (const value of [null, undefined, -1, NaN, Infinity, 0.5])
      expect(capturedBaselineWindow(before, value)).toBeNull();
    expect(capturedBaselineWindow(before, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
  it("uses the exact retained tolerance without an invented grace interval", () => {
    const window = capturedBaselineWindow(new Date("2026-10-05T12:00:00Z"), 60_000);
    expect(window?.notBefore.toISOString()).toBe("2026-10-05T11:59:00.000Z");
  });
});
