import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE,
  SEARCH_INSIGHTS_RATE_LIMITED_FAILURE,
} from "./search-insights-contract";
import {
  searchInsightsBackfillWorkflow,
  searchInsightsSyncWorkflow,
} from "./search-insights-workflows";

const mocks = vi.hoisted(() => ({
  ApplicationFailure: class ApplicationFailure extends Error {
    constructor(readonly type: string) {
      super(type);
      this.name = "ApplicationFailure";
    }
  },
  backfill: vi.fn(),
  continueAsNew: vi.fn(),
  incremental: vi.fn(),
  milestone: vi.fn(),
  incrementalForAll: vi.fn(),
  markFailed: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  ApplicationFailure: mocks.ApplicationFailure,
  continueAsNew: mocks.continueAsNew,
  proxyActivities: () => ({
    deliverSearchInsightsMilestoneActivity: mocks.milestone,
    markSearchInsightsImportFailedActivity: mocks.markFailed,
    runSearchInsightsBackfillBatchActivity: mocks.backfill,
    runSearchInsightsIncrementalActivity: mocks.incremental,
    runSearchInsightsIncrementalForAllActivity: mocks.incrementalForAll,
  }),
  sleep: mocks.sleep,
}));

const input = { projectId: "project_1", property: "sc-domain:example.com" };

function activityFailure(type: string) {
  return Object.assign(new Error("activity failed"), {
    cause: new mocks.ApplicationFailure(type),
  });
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    batchElapsedMs: 5 * 60_000,
    blocked: false,
    daysProcessed: 7,
    done: false,
    importId: "imp_1",
    nextCursor: "2026-07-01",
    requestSets: 21,
    ...overrides,
  };
}

describe("searchInsightsBackfillWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sleep.mockResolvedValue(undefined);
  });

  it("loops batches until the cursor passes the earliest target day", async () => {
    mocks.backfill
      .mockResolvedValueOnce(batch())
      .mockResolvedValueOnce(batch({ daysProcessed: 3, done: true, nextCursor: null }));

    await expect(searchInsightsBackfillWorkflow(input)).resolves.toEqual({
      days: 10,
      status: "completed",
    });
    expect(mocks.backfill).toHaveBeenCalledTimes(2);
    expect(mocks.backfill).toHaveBeenCalledWith(input);
  });

  it("passes an explicit batch size through to the activity", async () => {
    mocks.backfill.mockResolvedValue(batch({ done: true }));

    await searchInsightsBackfillWorkflow({ ...input, batchSize: 3 });

    expect(mocks.backfill).toHaveBeenCalledWith({ ...input, batchSize: 3 });
  });

  it("paces actual request sets and subtracts activity execution time", async () => {
    mocks.backfill.mockResolvedValueOnce(batch()).mockResolvedValueOnce(batch({ done: true }));
    await searchInsightsBackfillWorkflow({ ...input, requestSetsPerHour: 42 });
    expect(mocks.sleep).toHaveBeenCalledWith(25 * 60_000);
    expect(mocks.sleep).toHaveBeenCalledTimes(1);
  });

  it("waits out a quota pause with a widening backoff instead of failing", async () => {
    mocks.backfill
      .mockRejectedValueOnce(activityFailure(SEARCH_INSIGHTS_RATE_LIMITED_FAILURE))
      .mockRejectedValueOnce(activityFailure(SEARCH_INSIGHTS_RATE_LIMITED_FAILURE))
      .mockRejectedValueOnce(activityFailure(SEARCH_INSIGHTS_RATE_LIMITED_FAILURE))
      .mockResolvedValueOnce(batch({ daysProcessed: 1, done: true }));

    await expect(searchInsightsBackfillWorkflow(input)).resolves.toEqual({
      days: 1,
      status: "completed",
    });
    expect(mocks.sleep.mock.calls.flat()).toEqual(["2 minutes", "4 minutes", "8 minutes"]);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("caps the quota backoff so a paused import still retries within the half hour", async () => {
    mocks.backfill.mockRejectedValue(activityFailure(SEARCH_INSIGHTS_RATE_LIMITED_FAILURE));
    mocks.continueAsNew.mockResolvedValue(undefined);

    await searchInsightsBackfillWorkflow(input);

    expect(mocks.sleep).toHaveBeenCalledTimes(20);
    expect(mocks.sleep.mock.calls.flat().slice(0, 6)).toEqual([
      "2 minutes",
      "4 minutes",
      "8 minutes",
      "16 minutes",
      "30 minutes",
      "30 minutes",
    ]);
  });

  it("stops for a reconnect and leaves the stored days readable", async () => {
    mocks.backfill
      .mockResolvedValueOnce(batch({ daysProcessed: 5 }))
      .mockRejectedValueOnce(activityFailure(SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE));

    await expect(searchInsightsBackfillWorkflow(input)).resolves.toEqual({
      days: 5,
      status: "paused",
    });
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it("does not report a window that never started as completed", async () => {
    mocks.backfill.mockResolvedValueOnce(batch({ blocked: true, daysProcessed: 0, done: false }));

    await expect(searchInsightsBackfillWorkflow(input)).resolves.toEqual({
      days: 0,
      status: "paused",
    });
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("marks the import failed only when an unexpected failure ends the run", async () => {
    mocks.backfill.mockRejectedValueOnce(activityFailure("something_else"));

    await expect(searchInsightsBackfillWorkflow(input)).resolves.toEqual({
      days: 0,
      status: "failed",
    });
    expect(mocks.markFailed).toHaveBeenCalledWith(input);
  });

  it("hands the remaining days to a fresh execution every twenty batches", async () => {
    mocks.backfill.mockResolvedValue(batch({ daysProcessed: 1 }));
    mocks.continueAsNew.mockResolvedValue(undefined);

    await searchInsightsBackfillWorkflow(input);

    expect(mocks.backfill).toHaveBeenCalledTimes(20);
    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      ...input,
      batches: 20,
      days: 20,
      pausedMinutes: 0,
    });
  });

  it("carries the counters forward when a continued run finishes the window", async () => {
    mocks.backfill.mockResolvedValue(batch({ daysProcessed: 4, done: true }));

    await expect(
      searchInsightsBackfillWorkflow({ ...input, batches: 20, days: 140 }),
    ).resolves.toEqual({ days: 144, status: "completed" });
  });
});

describe("searchInsightsSyncWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs one project when the caller names it", async () => {
    mocks.incremental.mockResolvedValue({
      daysProcessed: 1,
      projectId: "project_1",
      status: "synced",
    });

    await expect(searchInsightsSyncWorkflow({ projectId: "project_1" })).resolves.toMatchObject({
      status: "synced",
    });
    expect(mocks.incrementalForAll).not.toHaveBeenCalled();
  });

  it("sweeps every connected project when the schedule fires it", async () => {
    mocks.incrementalForAll.mockResolvedValue({ projects: [] });

    await expect(searchInsightsSyncWorkflow()).resolves.toEqual({ projects: [] });
    expect(mocks.incremental).not.toHaveBeenCalled();
  });
});
