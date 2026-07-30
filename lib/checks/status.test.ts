import { describe, expect, it } from "vitest";
import {
  checkStatusLabel,
  RANK_CHECK_STATUS,
  RANK_CHECK_STATUS_LABEL,
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
});
