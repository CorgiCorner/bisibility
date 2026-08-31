import { pacificQuotaDayRange } from "@/lib/search-insights/dates";
import { deriveSearchSyncMetrics } from "@/lib/settings/search-sync-metrics-model";
import { describe, expect, it } from "vitest";

describe("deriveSearchSyncMetrics", () => {
  it("uses actual request ledger count and shared remaining plan", () => {
    expect(
      deriveSearchSyncMetrics({
        daysDone: 8,
        daysTotal: 10,
        lastQuotaPausedAt: null,
        planned: true,
        requestsToday: 5,
      }),
    ).toEqual({
      lastQuotaPausedAt: null,
      plannedRemaining: 8,
      requestsToday: 5,
    });
  });
});

describe("pacificQuotaDayRange", () => {
  it("starts at Pacific midnight across daylight saving time", () => {
    expect(pacificQuotaDayRange(new Date("2026-08-28T16:00:00Z"))).toEqual({
      start: new Date("2026-08-28T07:00:00Z"),
      end: new Date("2026-08-29T07:00:00Z"),
    });
    expect(pacificQuotaDayRange(new Date("2026-01-28T16:00:00Z"))).toEqual({
      start: new Date("2026-01-28T08:00:00Z"),
      end: new Date("2026-01-29T08:00:00Z"),
    });
  });
});
