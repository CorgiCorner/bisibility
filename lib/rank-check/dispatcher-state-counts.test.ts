import { describe, expect, it, vi } from "vitest";
import { dispatcherStateCountsEqual } from "./dispatcher-state-counts";

vi.mock("server-only", () => ({}));

const counts = {
  eligible: 2n,
  eligibleWithState: 2n,
  gone: 0n,
  ineligible: 0n,
  maxNextCheckAt: new Date("2026-07-30T00:00:00.000Z"),
  minNextCheckAt: new Date("2026-07-29T00:00:00.000Z"),
  missing: 0n,
};

describe("dispatcherStateCountsEqual", () => {
  it("rejects eligibility churn across the bounded recurrence scan", () => {
    expect(dispatcherStateCountsEqual(counts, counts)).toBe(true);
    expect(
      dispatcherStateCountsEqual(counts, {
        ...counts,
        eligible: 3n,
        missing: 1n,
      }),
    ).toBe(false);
  });
});
