import { describe, expect, it } from "vitest";
import { indexedShare, indexingProgress, inspectionFailuresRetryNextDay } from "./progress-model";

const base = {
  checked: 312,
  dailyLimit: 200,
  estimatedDaysRemaining: 1,
  nextBatchAt: "2026-11-11T08:00:00.000Z",
  total: 469,
};

describe("indexing progress", () => {
  it("shows a fixed daily rate, the next batch and a computable estimate", () => {
    expect(indexingProgress({ ...base, mode: "fixed" })).toEqual({
      kind: "fixed",
      checked: 312,
      dailyLimit: 200,
      daysLeft: 1,
      nextBatchAt: base.nextBatchAt,
      percent: 67,
      total: 469,
    });
  });

  it("omits the estimate when a fixed limit cannot compute one", () => {
    expect(
      indexingProgress({ ...base, estimatedDaysRemaining: null, mode: "fixed" }).kind === "fixed"
        ? indexingProgress({ ...base, estimatedDaysRemaining: null, mode: "fixed" })
        : null,
    ).toMatchObject({ daysLeft: null, kind: "fixed" });
  });

  it("describes available quota without a day count", () => {
    expect(indexingProgress({ ...base, mode: "available_quota" })).toEqual({
      kind: "available_quota",
      checked: 312,
      percent: 67,
      total: 469,
    });
  });

  it("does not present a zero limit or Off as a finished check", () => {
    expect(indexingProgress({ ...base, dailyLimit: 0, mode: "fixed" })).toEqual({
      kind: "limit_zero",
    });
    expect(indexingProgress({ ...base, checked: 0, mode: "off", total: 0 })).toEqual({
      kind: "off",
    });
  });

  it("retries a failed inspection on the next enabled day only", () => {
    expect(inspectionFailuresRetryNextDay("fixed", 200)).toBe(true);
    expect(inspectionFailuresRetryNextDay("available_quota", 0)).toBe(true);
    expect(inspectionFailuresRetryNextDay("fixed", 0)).toBe(false);
    expect(inspectionFailuresRetryNextDay("off", 50)).toBe(false);
  });

  it("leaves the indexed share blank until something has been checked", () => {
    expect(indexedShare(288, 312)).toBeCloseTo(288 / 312);
    expect(indexedShare(0, 0)).toBeNull();
  });
});
