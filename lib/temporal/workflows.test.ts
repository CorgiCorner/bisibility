import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STALE_RUNNING_CHECK_MINUTES } from "../rank-check/stale-window";
import {
  classifyRankCheckExecutionSource,
  markStaleRunningChecksWorkflow,
  processQueuedJobsWorkflow,
  purgeAuditLogsWorkflow,
  purgeExpiredSessionsWorkflow,
  purgeQueuedRankCheckBatchesWorkflow,
  purgeRankCheckRawPayloadsWorkflow,
  QUEUED_FAILURE_BATCH_ID_SAMPLE_LIMIT,
  RANK_CHECK_RAW_PURGE_ACTIVITY_OPTIONS,
  RANK_CHECK_SCHEDULE_TO_START_TIMEOUT_MINUTES,
  rankCheckWorkflow,
  sendWeeklyReportDigestWorkflow,
  syncPresenceWorkflow,
  syncSitemapsWorkflow,
} from "./workflows";

const mocks = vi.hoisted(() => {
  class TestApplicationFailure extends Error {
    constructor(
      message: string,
      readonly type: string,
    ) {
      super(message);
      this.name = "ApplicationFailure";
    }
  }

  const activities = {
    authorizeRankCheckExecutionActivity: vi.fn(),
    cleanupRankCheckRawPurgeProgressActivity: vi.fn(),
    createRunningRankCheckActivity: vi.fn(),
    discardRankCheckActivity: vi.fn(),
    failRankCheckActivity: vi.fn(),
    markStaleRunningChecksActivity: vi.fn(),
    purgeAuditLogsActivity: vi.fn(),
    purgeRankCheckRawPayloadsActivity: vi.fn(),
    purgeExpiredSessionsActivity: vi.fn(),
    purgeQueuedRankCheckBatchesActivity: vi.fn(),
    reconcileAllSchedulesActivity: vi.fn(),
    runRankCheckActivity: vi.fn(),
    sendWeeklyReportDigestActivity: vi.fn(),
    sweepRankCheckRawPurgeProgressActivity: vi.fn(),
    syncPresenceActivity: vi.fn(),
    syncSitemapsActivity: vi.fn(),
  };

  return {
    ApplicationFailure: TestApplicationFailure,
    activities,
    continueAsNew: vi.fn(),
    proxyActivities: vi.fn(() => activities),
    runId: "run_manual_1",
    searchAttributes: new Map<string, unknown>(),
  };
});

vi.mock("@temporalio/workflow", () => ({
  ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: "WAIT_CANCELLATION_COMPLETED" },
  ApplicationFailure: mocks.ApplicationFailure,
  continueAsNew: mocks.continueAsNew,
  proxyActivities: mocks.proxyActivities,
  workflowInfo: vi.fn(() => ({
    runId: mocks.runId,
    typedSearchAttributes: {
      get: (key: { name: string }) => mocks.searchAttributes.get(key.name),
    },
  })),
}));

function activityFailure(type: string, message: string) {
  return Object.assign(new Error("Activity task failed."), {
    cause: new mocks.ApplicationFailure(message, type),
  });
}

describe("retired workflow compatibility", () => {
  it("keeps the retired job processor type in the bundle as a no-op tombstone", async () => {
    await expect(processQueuedJobsWorkflow()).resolves.toBeUndefined();
  });
});

describe("maintenance workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      activity: mocks.activities.purgeAuditLogsActivity,
      expected: { cutoff: "2026-03-22T00:00:00.000Z", deleted: 7, retentionDays: 90 },
      name: "audit purge",
      workflow: purgeAuditLogsWorkflow,
    },
    {
      activity: mocks.activities.purgeExpiredSessionsActivity,
      expected: {
        cutoff: "2026-06-20T00:00:00.000Z",
        sessionsDeleted: 4,
        verificationsDeleted: 2,
      },
      name: "session purge",
      workflow: purgeExpiredSessionsWorkflow,
    },
    {
      activity: mocks.activities.sendWeeklyReportDigestActivity,
      expected: { projects: 3, sent: 2, skipped: 1 },
      name: "weekly report digest",
      workflow: sendWeeklyReportDigestWorkflow,
    },
    {
      activity: mocks.activities.syncSitemapsActivity,
      expected: {
        baselined: 1,
        changed: 2,
        failed: 0,
        projects: 3,
        pruned: 4,
        skipped: 0,
        unchanged: 0,
      },
      name: "sitemap sync",
      workflow: syncSitemapsWorkflow,
    },
    {
      activity: mocks.activities.syncPresenceActivity,
      expected: { checked: 2, failed: 0, projects: 1, signals: 1, skipped: 0, urls: 2 },
      name: "presence sync",
      workflow: syncPresenceWorkflow,
    },
  ])("delegates $name to its activity", async ({ activity, expected, workflow }) => {
    activity.mockResolvedValue(expected);

    await expect(workflow()).resolves.toEqual(expected);

    expect(activity).toHaveBeenCalledOnce();
    expect(activity.mock.calls[0]).toEqual([]);
  });

  it("configures the bounded raw-purge activity with heartbeat cancellation", () => {
    expect(RANK_CHECK_RAW_PURGE_ACTIVITY_OPTIONS).toMatchObject({
      heartbeatTimeout: "1 minute",
      startToCloseTimeout: "5 minutes",
    });
  });

  it("continues stale cleanup with a frozen keyset cursor and aggregates failures", async () => {
    mocks.continueAsNew.mockResolvedValue(undefined);
    mocks.activities.markStaleRunningChecksActivity.mockResolvedValueOnce({
      cutoff: "2026-07-29T07:15:00.000Z",
      failed: 100,
      olderThanMinutes: 15,
      queuedBatches: 25,
      queuedFailed: 1,
      queuedFailureBatchIds: ["batch_failed"],
      queuedHasMore: true,
      queuedNextCursor: {
        id: "batch_025",
        queueDeadlineAt: "2026-07-29T07:00:00.000Z",
      },
      queuedPending: 1,
      queuedSweepAt: "2026-07-29T07:30:00.000Z",
      queuedTerminal: 23,
    });

    await markStaleRunningChecksWorkflow();

    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      failed: 100,
      queuedBatches: 25,
      queuedCursor: {
        id: "batch_025",
        queueDeadlineAt: "2026-07-29T07:00:00.000Z",
      },
      queuedFailed: 1,
      queuedFailureBatchIdSample: ["batch_failed"],
      queuedPending: 1,
      queuedSweepAt: "2026-07-29T07:30:00.000Z",
      queuedTerminal: 23,
    });
    const continuation = mocks.continueAsNew.mock.calls[0]?.[0];
    mocks.continueAsNew.mockClear();
    mocks.activities.markStaleRunningChecksActivity.mockResolvedValueOnce({
      cutoff: "2026-07-29T07:15:00.000Z",
      failed: 4,
      olderThanMinutes: 15,
      queuedBatches: 2,
      queuedFailed: 0,
      queuedFailureBatchIds: [],
      queuedHasMore: false,
      queuedNextCursor: null,
      queuedPending: 0,
      queuedSweepAt: "2026-07-29T07:30:00.000Z",
      queuedTerminal: 2,
    });

    await expect(markStaleRunningChecksWorkflow(continuation)).resolves.toMatchObject({
      failed: 104,
      queuedBatches: 27,
      queuedFailed: 1,
      queuedFailureBatchIdSample: ["batch_failed"],
      queuedPending: 1,
      queuedTerminal: 25,
    });
    expect(mocks.activities.markStaleRunningChecksActivity).toHaveBeenLastCalledWith({
      queuedCursor: {
        id: "batch_025",
        queueDeadlineAt: "2026-07-29T07:00:00.000Z",
      },
      queuedSweepAt: "2026-07-29T07:30:00.000Z",
    });
    expect(mocks.continueAsNew).not.toHaveBeenCalled();
  });

  it("keeps all-failure continuation payloads bounded across many full pages", async () => {
    const pageCount = 40;
    let continuation: Parameters<typeof markStaleRunningChecksWorkflow>[0];
    let finalResult: Awaited<ReturnType<typeof markStaleRunningChecksWorkflow>> | undefined;
    const payloadSizes: number[] = [];
    for (let page = 0; page < pageCount; page += 1) {
      const hasMore = page < pageCount - 1;
      const pageStart = page * 25;
      mocks.activities.markStaleRunningChecksActivity.mockResolvedValueOnce({
        cutoff: "2026-07-29T07:15:00.000Z",
        failed: 0,
        olderThanMinutes: 15,
        queuedBatches: 25,
        queuedFailed: 25,
        queuedFailureBatchIds: Array.from(
          { length: 25 },
          (_, index) => `batch_${String(pageStart + index).padStart(6, "0")}`,
        ),
        queuedHasMore: hasMore,
        queuedNextCursor: hasMore
          ? {
              id: `batch_${String(pageStart + 24).padStart(6, "0")}`,
              queueDeadlineAt: "2026-07-29T07:00:00.000Z",
            }
          : null,
        queuedPending: 0,
        queuedSweepAt: "2026-07-29T07:30:00.000Z",
        queuedTerminal: 0,
      });
      mocks.continueAsNew.mockClear();

      const result = await markStaleRunningChecksWorkflow(continuation);
      if (!hasMore) {
        finalResult = result;
        break;
      }
      continuation = mocks.continueAsNew.mock.calls[0]?.[0];
      payloadSizes.push(JSON.stringify(continuation).length);
    }

    expect(mocks.activities.markStaleRunningChecksActivity).toHaveBeenCalledTimes(pageCount);
    expect(finalResult).toMatchObject({
      queuedBatches: pageCount * 25,
      queuedFailed: pageCount * 25,
      queuedFailureBatchIdSample: expect.any(Array),
    });
    expect(finalResult?.queuedFailureBatchIdSample).toHaveLength(
      QUEUED_FAILURE_BATCH_ID_SAMPLE_LIMIT,
    );
    expect(Math.max(...payloadSizes)).toBeLessThan(1_000);
  });

  it("continues the raw purge in a new run and does not double-count completed chunks", async () => {
    mocks.continueAsNew.mockResolvedValue(undefined);
    mocks.activities.purgeRankCheckRawPayloadsActivity.mockResolvedValueOnce({
      batchCount: 1,
      batchSize: 1000,
      cutoff: "2026-04-29T00:00:00.000Z",
      hasMore: true,
      progressId: "a".repeat(64),
      retentionDays: 90,
      updated: 1000,
    });
    mocks.activities.sweepRankCheckRawPurgeProgressActivity.mockResolvedValue({
      cutoff: "2026-07-21T00:00:00.000Z",
      deleted: 0,
      deletePages: 1,
      fenceRetentionDays: 7,
      hasMore: false,
      pageSize: 500,
      scrubbed: 0,
      scrubPages: 1,
    });

    await purgeRankCheckRawPayloadsWorkflow();

    expect(mocks.activities.sweepRankCheckRawPurgeProgressActivity).toHaveBeenCalledOnce();
    expect(
      mocks.activities.sweepRankCheckRawPurgeProgressActivity.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.activities.purgeRankCheckRawPayloadsActivity.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      batchCount: 1,
      cutoff: "2026-04-29T00:00:00.000Z",
      retentionDays: 90,
      updated: 1000,
    });
    expect(mocks.activities.cleanupRankCheckRawPurgeProgressActivity).toHaveBeenCalledWith({
      progressId: "a".repeat(64),
    });
    const continuation = mocks.continueAsNew.mock.calls[0]?.[0];
    mocks.continueAsNew.mockClear();
    mocks.activities.purgeRankCheckRawPayloadsActivity.mockResolvedValueOnce({
      batchCount: 1,
      batchSize: 1000,
      cutoff: "2026-04-29T00:00:00.000Z",
      hasMore: false,
      progressId: "b".repeat(64),
      retentionDays: 90,
      updated: 7,
    });
    await expect(purgeRankCheckRawPayloadsWorkflow(continuation)).resolves.toEqual({
      batchCount: 2,
      batchSize: 1000,
      cutoff: "2026-04-29T00:00:00.000Z",
      hasMore: false,
      retentionDays: 90,
      updated: 1007,
    });
    expect(mocks.activities.cleanupRankCheckRawPurgeProgressActivity).toHaveBeenLastCalledWith({
      progressId: "b".repeat(64),
    });
    expect(mocks.continueAsNew).not.toHaveBeenCalled();
  });

  it("continues queued-ledger cleanup across bounded activity pages", async () => {
    mocks.continueAsNew.mockResolvedValue(undefined);
    mocks.activities.purgeQueuedRankCheckBatchesActivity.mockResolvedValueOnce({
      deleted: 100,
      hasMore: true,
      pageSize: 100,
    });

    await purgeQueuedRankCheckBatchesWorkflow();

    expect(mocks.continueAsNew).toHaveBeenCalledWith({ deleted: 100 });
    const continuation = mocks.continueAsNew.mock.calls[0]?.[0];
    mocks.continueAsNew.mockClear();
    mocks.activities.purgeQueuedRankCheckBatchesActivity.mockResolvedValueOnce({
      deleted: 5,
      hasMore: false,
      pageSize: 100,
    });
    await expect(purgeQueuedRankCheckBatchesWorkflow(continuation)).resolves.toEqual({
      deleted: 105,
      hasMore: false,
      pageSize: 100,
    });
    expect(mocks.continueAsNew).not.toHaveBeenCalled();
  });
});

describe("rankCheckWorkflow", () => {
  beforeEach(() => {
    mocks.runId = "run_manual_1";
    mocks.searchAttributes.clear();
    mocks.activities.createRunningRankCheckActivity.mockReset();
    mocks.activities.authorizeRankCheckExecutionActivity.mockReset();
    mocks.activities.cleanupRankCheckRawPurgeProgressActivity.mockReset();
    mocks.activities.discardRankCheckActivity.mockReset();
    mocks.activities.failRankCheckActivity.mockReset();
    mocks.activities.markStaleRunningChecksActivity.mockReset();
    mocks.activities.purgeAuditLogsActivity.mockReset();
    mocks.activities.purgeRankCheckRawPayloadsActivity.mockReset();
    mocks.activities.purgeExpiredSessionsActivity.mockReset();
    mocks.activities.purgeQueuedRankCheckBatchesActivity.mockReset();
    mocks.activities.reconcileAllSchedulesActivity.mockReset();
    mocks.activities.runRankCheckActivity.mockReset();
    mocks.activities.sendWeeklyReportDigestActivity.mockReset();
    mocks.activities.sweepRankCheckRawPurgeProgressActivity.mockReset();
    mocks.activities.syncPresenceActivity.mockReset();
    mocks.activities.syncSitemapsActivity.mockReset();
    mocks.activities.createRunningRankCheckActivity.mockResolvedValue({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
    });
    mocks.activities.authorizeRankCheckExecutionActivity.mockImplementation(
      ({ source }: { source: string }) =>
        Promise.resolve({ allowed: true, mode: "legacy", reason: null, source }),
    );
  });

  it("keeps the queue lease shorter than the stale running-check window", () => {
    expect(RANK_CHECK_SCHEDULE_TO_START_TIMEOUT_MINUTES).toBeLessThan(
      DEFAULT_STALE_RUNNING_CHECK_MINUTES,
    );
  });

  it.each([
    [null, null, "manual"],
    ["rank-check-keyword_1", null, "legacy"],
    [null, "dispatcher-rank-checks", "dispatcher"],
    ["rank-check-other", null, "ambiguous"],
    ["rank-check-keyword_1", "dispatcher-rank-checks", "ambiguous"],
  ] as const)(
    "classifies scheduledBy=%s dispatch=%s as %s",
    (scheduledById, dispatchScheduleId, expected) => {
      expect(
        classifyRankCheckExecutionSource({
          dispatchScheduleId,
          keywordId: "keyword_1",
          scheduledById,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ["legacy", "cutover", "rank-check-keyword_1", undefined],
    [
      "dispatcher",
      "legacy",
      undefined,
      {
        scheduleId: "dispatcher-rank-checks",
        scheduledAt: "2026-07-28T12:00:00.000Z",
      },
    ],
  ] as const)(
    "stops a late %s start in %s before creating lifecycle work",
    async (source, mode, scheduledById, dispatch) => {
      if (scheduledById) {
        mocks.searchAttributes.set("TemporalScheduledById", scheduledById);
        mocks.searchAttributes.set(
          "TemporalScheduledStartTime",
          new Date("2026-07-28T12:00:00.000Z"),
        );
      }
      mocks.activities.authorizeRankCheckExecutionActivity.mockResolvedValue({
        allowed: false,
        mode,
        reason: `automatic_${source}_disabled_in_${mode}`,
        source,
      });

      await expect(
        rankCheckWorkflow({ ...(dispatch ? { dispatch } : {}), keywordId: "keyword_1" }),
      ).resolves.toEqual({
        deferred: true,
        keywordId: "keyword_1",
        reason: `automatic_${source}_disabled_in_${mode}`,
      });
      expect(mocks.activities.createRunningRankCheckActivity).not.toHaveBeenCalled();
      expect(mocks.activities.runRankCheckActivity).not.toHaveBeenCalled();
    },
  );

  it("creates a running row before invoking the rank-check activity", async () => {
    mocks.activities.runRankCheckActivity.mockResolvedValue({
      attempts: [],
      checkedAt: "2026-01-01T06:00:00.000Z",
      costCents: 0.1,
      keywordId: "keyword_1",
      position: 4,
      provider: "serpapi",
      rankCheckId: "rank_running_1",
      rankingUrl: "https://example.com/rank",
    });

    await expect(
      rankCheckWorkflow({ depth: 20, keywordId: "keyword_1", providerId: "serpapi" }),
    ).resolves.toMatchObject({ rankCheckId: "rank_running_1", position: 4 });

    expect(mocks.activities.createRunningRankCheckActivity).toHaveBeenCalledWith({
      depth: 20,
      keywordId: "keyword_1",
      providerId: "serpapi",
      scheduleId: null,
      scheduledAt: null,
      trigger: "manual",
      workflowRunId: "run_manual_1",
    });
    expect(mocks.activities.runRankCheckActivity).toHaveBeenCalledWith({
      depth: 20,
      keywordId: "keyword_1",
      providerId: "serpapi",
      rankCheckId: "rank_running_1",
      source: "manual",
    });
  });

  it("persists authoritative Temporal schedule metadata for scheduled runs", async () => {
    const scheduledAt = new Date("2026-01-01T05:59:30.000Z");
    mocks.runId = "run_scheduled_1";
    mocks.searchAttributes.set("TemporalScheduledStartTime", scheduledAt);
    mocks.searchAttributes.set("TemporalScheduledById", "rank-check-keyword_1");
    mocks.activities.runRankCheckActivity.mockResolvedValue({
      attempts: [],
      checkedAt: "2026-01-01T06:00:00.000Z",
      costCents: 0.1,
      keywordId: "keyword_1",
      position: 4,
      provider: "serpapi",
      rankCheckId: "rank_running_1",
      rankingUrl: null,
    });

    await rankCheckWorkflow({ keywordId: "keyword_1" });

    expect(mocks.activities.createRunningRankCheckActivity).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      scheduleId: "rank-check-keyword_1",
      scheduledAt,
      trigger: "scheduled",
      workflowRunId: "run_scheduled_1",
    });
  });

  it("persists dispatcher metadata as a scheduled run without leaking it to the activity", async () => {
    const scheduledAt = new Date("2026-07-28T12:00:00.000Z");
    mocks.runId = "run_dispatched_1";
    mocks.activities.runRankCheckActivity.mockResolvedValue({
      attempts: [],
      checkedAt: "2026-07-28T12:01:00.000Z",
      costCents: 0.1,
      keywordId: "keyword_1",
      position: 4,
      provider: "serpapi",
      rankCheckId: "rank_running_1",
      rankingUrl: null,
    });

    await rankCheckWorkflow({
      dispatch: {
        scheduleId: "dispatcher-rank-checks",
        scheduledAt: scheduledAt.toISOString(),
      },
      keywordId: "keyword_1",
    });

    expect(mocks.activities.createRunningRankCheckActivity).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      scheduleId: "dispatcher-rank-checks",
      scheduledAt,
      trigger: "scheduled",
      workflowRunId: "run_dispatched_1",
    });
    expect(mocks.activities.runRankCheckActivity).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      rankCheckId: "rank_running_1",
      source: "dispatcher",
    });
  });

  it.each([
    ["automatic_execution_disabled", "mode changed", "mode changed"],
    ["provider_rate_limited", "rate limited", "rate limited"],
    ["budget_exhausted", "monthly budget reached", "monthly budget reached"],
    ["project_read_only", "read-only", "Project is in read-only mode."],
  ])("discards the running row when %s defers the check", async (type, message, reason) => {
    mocks.activities.runRankCheckActivity.mockRejectedValue(activityFailure(type, message));

    await expect(rankCheckWorkflow({ keywordId: "keyword_1" })).resolves.toEqual({
      deferred: true,
      keywordId: "keyword_1",
      reason,
    });

    expect(mocks.activities.discardRankCheckActivity).toHaveBeenCalledWith({
      rankCheckId: "rank_running_1",
      reason,
    });
    expect(mocks.activities.failRankCheckActivity).not.toHaveBeenCalled();
  });

  it("marks the running row failed before rethrowing unexpected failures", async () => {
    const error = new Error("provider failed");
    mocks.activities.runRankCheckActivity.mockRejectedValue(error);

    await expect(
      rankCheckWorkflow({ keywordId: "keyword_1", providerId: "serpapi" }),
    ).rejects.toThrow(error);

    expect(mocks.activities.failRankCheckActivity).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      message: "provider failed",
      providerId: "serpapi",
      rankCheckId: "rank_running_1",
    });
    expect(mocks.activities.discardRankCheckActivity).not.toHaveBeenCalled();
  });

  it("marks the reservation failed when the rank-check activity times out in the queue", async () => {
    const error = new Error("Activity schedule-to-start timeout.");
    mocks.activities.runRankCheckActivity.mockRejectedValue(error);

    await expect(rankCheckWorkflow({ keywordId: "keyword_1" })).rejects.toThrow(error);

    expect(mocks.activities.failRankCheckActivity).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      message: "Activity schedule-to-start timeout.",
      providerId: undefined,
      rankCheckId: "rank_running_1",
    });
  });

  it("returns a defined result when a late activity cannot persist over a closed row", async () => {
    mocks.activities.runRankCheckActivity.mockRejectedValue(
      activityFailure(
        "rank_check_closed",
        "Rank check was closed before its result could be persisted.",
      ),
    );

    await expect(rankCheckWorkflow({ keywordId: "keyword_1" })).resolves.toEqual({
      deferred: true,
      keywordId: "keyword_1",
      reason: "Rank check was closed before its result could be persisted.",
    });

    expect(mocks.activities.discardRankCheckActivity).not.toHaveBeenCalled();
    expect(mocks.activities.failRankCheckActivity).not.toHaveBeenCalled();
  });
});
