import { RETENTION_MONTHS } from "@/lib/search-insights/constants";
import { dateKey } from "@/lib/search-insights/dates";
import {
  INCREMENTAL_TRAILING_DAYS,
  incrementalDays,
  MAX_INCREMENTAL_DAYS,
  nextDateRanges,
  nextPartitions,
  planBackfill,
  plannedRemainingRequests,
  resumedImportState,
  searchSyncPlanSummary,
  searchSyncRequestSetsPerHour,
} from "@/lib/search-insights/sync/plan";
import { dateFromFrozenNow } from "@/tests/clock";
import { describe, expect, it } from "vitest";

describe("planBackfill", () => {
  it("measures the retention window from the newest finalized day, not from today", () => {
    expect(planBackfill({ newestFinalizedDate: "2026-07-07" })).toEqual({
      daysTotal: 488,
      earliestTargetDate: "2025-03-07",
    });
    expect(RETENTION_MONTHS).toBe(16);
  });

  it("clamps to the last day of a shorter target month", () => {
    expect(planBackfill({ newestFinalizedDate: "2026-03-31", retentionMonths: 1 })).toEqual({
      daysTotal: 32,
      earliestTargetDate: "2026-02-28",
    });
  });

  it("counts a single day when the window collapses onto the newest day", () => {
    expect(planBackfill({ newestFinalizedDate: "2026-06-30", retentionMonths: 0 })).toEqual({
      daysTotal: 1,
      earliestTargetDate: "2026-06-30",
    });
  });
});

describe("searchSyncPlanSummary", () => {
  it.each([
    [16, 488, "1,900"],
    [12, 366, "1,400"],
    [6, 185, "700"],
    [3, 93, "400"],
  ] as const)(
    "budgets %i months without inventing aggregate calls",
    (months, daysTotal, requests) => {
      const summary = searchSyncPlanSummary({ pace: "normal", retentionMonths: months });
      expect(summary.daysTotal).toBe(daysTotal);
      expect(summary.knownRequestSets).toBe(daysTotal * 3 + 2);
      expect(summary.plannedRequestBudget).toBeGreaterThan(summary.knownRequestSets);
      expect(summary.requests).toBe(`about ${requests}`);
    },
  );

  it("derives remaining budget from one source of truth", () => {
    expect(plannedRemainingRequests({ daysDone: 8, daysTotal: 10, planned: true })).toEqual({
      knownRequestSets: 6,
      plannedRequestBudget: 8,
      reserveRequestSets: 2,
    });
    expect(plannedRemainingRequests({ daysDone: 0, daysTotal: 10, planned: false })).toEqual({
      knownRequestSets: 32,
      plannedRequestBudget: 42,
      reserveRequestSets: 10,
    });
  });

  it("makes gentle throughput exactly half normal", () => {
    expect(searchSyncRequestSetsPerHour("gentle")).toBe(searchSyncRequestSetsPerHour("normal") / 2);
  });
});

describe("nextPartitions", () => {
  it("walks backward from the cursor so the newest days land first", () => {
    expect(
      nextPartitions({ batchSize: 3, cursorDate: "2026-07-07", earliestTargetDate: "2025-03-07" }),
    ).toEqual(["2026-07-07", "2026-07-06", "2026-07-05"]);
  });

  it("stops at the earliest target day and includes it", () => {
    expect(
      nextPartitions({ batchSize: 5, cursorDate: "2026-06-02", earliestTargetDate: "2026-06-01" }),
    ).toEqual(["2026-06-02", "2026-06-01"]);
  });

  it("returns nothing once the cursor has passed the earliest target day", () => {
    expect(
      nextPartitions({ batchSize: 5, cursorDate: "2026-05-31", earliestTargetDate: "2026-06-01" }),
    ).toEqual([]);
  });
});

describe("nextDateRanges", () => {
  it("groups the newest dates into thirty-day ranges before walking backward", () => {
    expect(
      nextDateRanges({
        batchSize: 2,
        cursorDate: "2026-07-08",
        earliestTargetDate: "2026-05-01",
      }),
    ).toEqual([
      { end: "2026-07-08", start: "2026-06-09" },
      { end: "2026-06-08", start: "2026-05-10" },
    ]);
  });

  it("clamps its final range to the oldest retained day", () => {
    expect(
      nextDateRanges({
        batchSize: 2,
        cursorDate: "2026-05-09",
        earliestTargetDate: "2026-05-01",
      }),
    ).toEqual([{ end: "2026-05-09", start: "2026-05-01" }]);
  });
});

describe("incrementalDays", () => {
  const newestFinalizedDate = dateKey(dateFromFrozenNow({ days: -2 }));

  it("asks for nothing while the provider has finalized no new day", () => {
    expect(
      incrementalDays({
        finalizedThroughDate: newestFinalizedDate,
        newestFinalizedDate,
      }),
    ).toEqual([]);
  });

  it("rereads a short tail before it walks forward, oldest first", () => {
    expect(
      incrementalDays({
        finalizedThroughDate: "2026-07-05",
        newestFinalizedDate,
      }),
    ).toEqual(["2026-07-04", "2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"]);
    expect(INCREMENTAL_TRAILING_DAYS).toBe(3);
  });

  it("fetches only the newest finalized day when nothing is stored yet", () => {
    expect(incrementalDays({ finalizedThroughDate: null, newestFinalizedDate })).toEqual([
      newestFinalizedDate,
    ]);
  });

  it("bounds one catch-up run so a long outage spreads over consecutive runs", () => {
    const days = incrementalDays({
      finalizedThroughDate: "2026-01-01",
      newestFinalizedDate: "2026-07-07",
    });

    expect(days).toHaveLength(MAX_INCREMENTAL_DAYS);
    expect(days[0]).toBe("2025-12-31");
  });
});

describe("resumedImportState", () => {
  it("leaves a healthy import alone", () => {
    expect(
      resumedImportState({
        cursorDate: "2026-01-01",
        earliestTargetDate: "2025-03-07",
        state: "running",
      }),
    ).toEqual({});
  });

  it("restores a finished backfill that a quota pause interrupted", () => {
    expect(
      resumedImportState({
        cursorDate: "2025-03-06",
        earliestTargetDate: "2025-03-07",
        state: "paused",
      }),
    ).toEqual({ state: "completed" });
  });

  it("resumes an unfinished backfill as running", () => {
    expect(
      resumedImportState({
        cursorDate: "2025-06-01",
        earliestTargetDate: "2025-03-07",
        state: "paused",
      }),
    ).toEqual({ state: "running" });
  });

  it("keeps the workflow id of a backfill that is only sleeping off a quota pause", () => {
    expect(
      resumedImportState({
        cursorDate: "2025-06-01",
        earliestTargetDate: "2025-03-07",
        pausedReason: "rate_limited",
        state: "paused",
      }),
    ).toEqual({ state: "running" });
  });

  it("drops the workflow id of a backfill that a lost authorization closed", () => {
    expect(
      resumedImportState({
        cursorDate: "2025-06-01",
        earliestTargetDate: "2025-03-07",
        pausedReason: "needs_reauth",
        state: "paused",
      }),
    ).toEqual({ state: "running", workflowId: null });
  });

  it("resumes an import paused before the window was planned", () => {
    expect(
      resumedImportState({ cursorDate: null, earliestTargetDate: null, state: "paused" }),
    ).toEqual({ state: "running" });
  });

  it("keeps an import the workflow gave up on paused instead of falsely running", () => {
    // Nothing is executing after a give-up, so a "running" row would show a progress bar
    // that cannot move until a read path re-arms the backfill.
    expect(
      resumedImportState({
        cursorDate: "2025-06-01",
        earliestTargetDate: "2025-03-07",
        state: "failed",
      }),
    ).toEqual({ pausedReason: "error", state: "paused", workflowId: null });
  });

  it("completes a failed import whose cursor already walked past the oldest day", () => {
    expect(
      resumedImportState({
        cursorDate: "2025-03-06",
        earliestTargetDate: "2025-03-07",
        state: "failed",
      }),
    ).toEqual({ state: "completed", workflowId: null });
  });
});
