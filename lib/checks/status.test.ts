import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function comparable(normalizationVersion: string, requestedDepth = 100) {
  const scope = { ...fixtureScope, targetId: "target" };
  return recordedFixture(3, {
    normalizationVersion,
    requestedDepth,
    configuredScope: scope,
    effectiveScope: scope,
  });
}

beforeEach(() => vi.setSystemTime(new Date("2026-10-12T12:00:00Z")));

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
    const first = comparable("v2"),
      second = comparable("v2"),
      boundary = comparable("v1");
    const window = comparableCompletedWindow([
      first,
      { ...first, normalizationVersion: null, status: "failed" },
      second,
      boundary,
      comparable("v2"),
    ]);
    expect(window).toEqual({ boundary, checks: [first, second], hasBoundary: true });
  });

  it("does not mark a window that contains only one comparison contract", () => {
    expect(comparableCompletedWindow([comparable("v1", 50), comparable("v1", 50)])).toMatchObject({
      hasBoundary: false,
    });
  });
});
