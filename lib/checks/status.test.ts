import { describe, expect, it } from "vitest";
import {
  checkStatusLabel,
  comparableCompletedWindow,
  effectiveRequestedDepth,
  RANK_CHECK_STATUS,
  RANK_CHECK_STATUS_LABEL,
  whereComparableTo,
  whereCompletedChecks,
  whereExecutedChecks,
} from "./status";

describe("rank-check status policy", () => {
  it("uses skipped as the deferred UI label", () => {
    expect(checkStatusLabel(RANK_CHECK_STATUS.DEFERRED)).toBe("Skipped");
    expect(RANK_CHECK_STATUS_LABEL).toEqual({
      completed: "Completed",
      deferred: "Skipped",
      failed: "Failed",
      running: "Running",
    });
  });

  it("returns the shared executed-check Prisma fragment", () => {
    expect(whereExecutedChecks()).toEqual({ status: { not: "deferred" } });
  });

  it("returns the shared completed-check Prisma fragment", () => {
    expect(whereCompletedChecks()).toEqual({ status: "completed" });
  });

  it("keeps unknown effective depth unknown", () => {
    expect(effectiveRequestedDepth({ requestedDepth: null })).toBeNull();
    expect(effectiveRequestedDepth({ requestedDepth: 100 })).toBe(100);
  });

  it("builds one comparable-history predicate from known version and depth", () => {
    expect(whereComparableTo({ normalizationVersion: "v1", requestedDepth: 100 })).toEqual({
      normalizationVersion: "v1",
      requestedDepth: 100,
      status: "completed",
    });
  });

  it.each([
    { normalizationVersion: null, requestedDepth: 100 },
    { normalizationVersion: "v1", requestedDepth: null },
    { normalizationVersion: "", requestedDepth: 100 },
  ])("rejects unknown comparison keys: %o", (check) => {
    expect(whereComparableTo(check)).toBeNull();
  });

  it("returns the newest contiguous comparable segment and its visible boundary", () => {
    const window = comparableCompletedWindow([
      { normalizationVersion: "v2", requestedDepth: 100, status: "completed" },
      { normalizationVersion: null, requestedDepth: 100, status: "failed" },
      { normalizationVersion: "v2", requestedDepth: 100, status: "completed" },
      { normalizationVersion: "v1", requestedDepth: 100, status: "completed" },
      { normalizationVersion: "v2", requestedDepth: 100, status: "completed" },
    ]);

    expect(window).toEqual({
      boundary: { normalizationVersion: "v1", requestedDepth: 100, status: "completed" },
      checks: [
        { normalizationVersion: "v2", requestedDepth: 100, status: "completed" },
        { normalizationVersion: "v2", requestedDepth: 100, status: "completed" },
      ],
      hasBoundary: true,
    });
  });

  it("does not mark a window that contains only one comparison contract", () => {
    expect(
      comparableCompletedWindow([
        { normalizationVersion: "v1", requestedDepth: 50, status: "completed" },
        { normalizationVersion: "v1", requestedDepth: 50, status: "completed" },
      ]),
    ).toMatchObject({ hasBoundary: false });
  });
});
