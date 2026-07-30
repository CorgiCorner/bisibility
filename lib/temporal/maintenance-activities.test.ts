import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRankCheckRawPurgeProgressActivity,
  markStaleRunningChecksActivity,
  purgeAuditLogsActivity,
  purgeExpiredSessionsActivity,
  purgeQueuedRankCheckBatchesActivity,
  purgeRankCheckRawPayloadsActivity,
  sendWeeklyReportDigestActivity,
  sweepRankCheckRawPurgeProgressActivity,
  syncPresenceActivity,
  syncSitemapsActivity,
} from "./maintenance-activities";

const mocks = vi.hoisted(() => ({
  activityContext: {
    cancellationSignal: { aborted: false },
    cancelled: Promise.resolve(),
    heartbeat: vi.fn(),
    info: {
      activityId: "activity_1",
      heartbeatDetails: undefined as unknown,
      workflowExecution: { runId: "run_1", workflowId: "workflow_1" },
    },
  },
  cleanupRankCheckRawPurgeProgress: vi.fn(),
  markStaleRunningChecks: vi.fn(),
  prisma: {
    project: { findMany: vi.fn() },
  },
  purgeAuditLogs: vi.fn(),
  purgeExpiredSessions: vi.fn(),
  purgeExpiredQueuedRankCheckBatches: vi.fn(),
  purgeRankCheckRawPayloads: vi.fn(),
  sendWeeklyDigestForProject: vi.fn(),
  sweepRankCheckRawPurgeProgress: vi.fn(),
  syncPresenceForAllProjects: vi.fn(),
  syncSitemapForAllProjects: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({
  Context: { current: () => mocks.activityContext },
}));
vi.mock("../audit/retention", () => ({ purgeAuditLogs: mocks.purgeAuditLogs }));
vi.mock("../auth/session-retention", () => ({ purgeExpiredSessions: mocks.purgeExpiredSessions }));
vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../rank-check/raw-retention", () => ({
  cleanupRankCheckRawPurgeProgress: mocks.cleanupRankCheckRawPurgeProgress,
  purgeRankCheckRawPayloads: mocks.purgeRankCheckRawPayloads,
  RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY: 10,
}));
vi.mock("../rank-check/stale-checks", () => ({
  markStaleRunningChecks: mocks.markStaleRunningChecks,
}));
vi.mock("../reports/weekly-digest-send", () => ({
  sendWeeklyDigestForProject: mocks.sendWeeklyDigestForProject,
}));
vi.mock("../presence/sync", () => ({
  syncPresenceForAllProjects: mocks.syncPresenceForAllProjects,
}));
vi.mock("../rank-check/raw-retention-fences", () => ({
  sweepRankCheckRawPurgeProgress: mocks.sweepRankCheckRawPurgeProgress,
}));
vi.mock("../rank-check/queued-retention", () => ({
  purgeExpiredQueuedRankCheckBatches: mocks.purgeExpiredQueuedRankCheckBatches,
}));
vi.mock("../sitemap/sync", () => ({
  syncSitemapForAllProjects: mocks.syncSitemapForAllProjects,
}));

describe("maintenance activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityContext.cancellationSignal.aborted = false;
    mocks.activityContext.cancelled = Promise.resolve();
    mocks.activityContext.info.activityId = "activity_1";
    mocks.activityContext.info.heartbeatDetails = undefined;
    mocks.activityContext.info.workflowExecution.runId = "run_1";
    mocks.activityContext.info.workflowExecution.workflowId = "workflow_1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("serializes the audit purge summary's Date to an ISO string", async () => {
    mocks.purgeAuditLogs.mockResolvedValue({
      cutoff: new Date("2026-03-22T00:00:00.000Z"),
      deleted: 7,
      retentionDays: 90,
    });

    await expect(purgeAuditLogsActivity()).resolves.toEqual({
      cutoff: "2026-03-22T00:00:00.000Z",
      deleted: 7,
      retentionDays: 90,
    });
  });

  it("serializes the raw payload purge summary's nullable Date", async () => {
    mocks.purgeRankCheckRawPayloads.mockResolvedValue({
      batchCount: 2,
      batchSize: 1000,
      cutoff: new Date("2026-04-29T00:00:00.000Z"),
      hasMore: true,
      retentionDays: 90,
      updated: 1007,
    });

    await expect(purgeRankCheckRawPayloadsActivity()).resolves.toEqual({
      batchCount: 2,
      batchSize: 1000,
      cutoff: "2026-04-29T00:00:00.000Z",
      hasMore: true,
      progressId: expect.stringMatching(/^[a-f0-9]{64}$/),
      retentionDays: 90,
      updated: 1007,
    });
    const options = mocks.purgeRankCheckRawPayloads.mock.calls[0]?.[0];
    expect(options.maxBatches).toBeGreaterThan(0);
    expect(options.progressId).toMatch(/^[a-f0-9]{64}$/);
    await options.onBatchCompleted({
      batchCount: 1,
      cutoff: new Date("2026-04-29T00:00:00.000Z"),
      retentionDays: 90,
      updated: 1000,
    });
    expect(mocks.activityContext.heartbeat).toHaveBeenCalledWith({
      batchCount: 1,
      cutoff: "2026-04-29T00:00:00.000Z",
      retentionDays: 90,
      updated: 1000,
    });
  });

  it("observes cancellation between raw-purge batches", async () => {
    const cancellation = new Error("activity cancelled");
    mocks.activityContext.cancellationSignal.aborted = true;
    mocks.activityContext.cancelled = Promise.reject(cancellation);
    mocks.purgeRankCheckRawPayloads.mockImplementation(async (options) => {
      await options.onBatchCompleted({
        batchCount: 1,
        cutoff: new Date("2026-04-29T00:00:00.000Z"),
        retentionDays: 90,
        updated: 1000,
      });
      return {
        batchCount: 1,
        batchSize: 1000,
        cutoff: new Date("2026-04-29T00:00:00.000Z"),
        hasMore: true,
        retentionDays: 90,
        updated: 1000,
      };
    });

    await expect(purgeRankCheckRawPayloadsActivity()).rejects.toBe(cancellation);
  });

  it("uses stable execution progress and ignores stale heartbeat counts", async () => {
    mocks.activityContext.info.heartbeatDetails = {
      batchCount: 2,
      cutoff: "2026-04-29T00:00:00.000Z",
      retentionDays: 90,
      updated: 2000,
    };
    mocks.purgeRankCheckRawPayloads.mockResolvedValue({
      batchCount: 3,
      batchSize: 1000,
      cutoff: new Date("2026-04-29T00:00:00.000Z"),
      hasMore: false,
      retentionDays: 90,
      updated: 2007,
    });

    await purgeRankCheckRawPayloadsActivity();

    expect(mocks.purgeRankCheckRawPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        cutoff: undefined,
        progressId: expect.stringMatching(/^[a-f0-9]{64}$/),
        retentionDays: undefined,
      }),
    );
    const firstProgressId = mocks.purgeRankCheckRawPayloads.mock.calls[0]?.[0].progressId;
    await purgeRankCheckRawPayloadsActivity();
    expect(mocks.purgeRankCheckRawPayloads.mock.calls[1]?.[0].progressId).toBe(firstProgressId);

    mocks.activityContext.info.workflowExecution.runId = "run_2";
    await purgeRankCheckRawPayloadsActivity();
    expect(mocks.purgeRankCheckRawPayloads.mock.calls[2]?.[0].progressId).not.toBe(firstProgressId);

    mocks.activityContext.info.workflowExecution.runId = "run_1";
    mocks.activityContext.info.activityId = "activity_2";
    await purgeRankCheckRawPayloadsActivity();
    expect(mocks.purgeRankCheckRawPayloads.mock.calls[3]?.[0].progressId).not.toBe(firstProgressId);
  });

  it("clears a committed result through the dedicated cleanup activity", async () => {
    mocks.cleanupRankCheckRawPurgeProgress.mockResolvedValue({ cleared: 1 });

    await expect(
      cleanupRankCheckRawPurgeProgressActivity({ progressId: "d".repeat(64) }),
    ).resolves.toEqual({ cleared: 1 });
    expect(mocks.cleanupRankCheckRawPurgeProgress).toHaveBeenCalledWith("d".repeat(64));
  });

  it("serializes the independent progress-fence sweep cutoff", async () => {
    mocks.sweepRankCheckRawPurgeProgress.mockResolvedValue({
      cutoff: new Date("2026-07-21T12:00:00.000Z"),
      deleted: 503,
      deletePages: 2,
      fenceRetentionDays: 7,
      hasMore: false,
      pageSize: 500,
      scrubbed: 2,
      scrubPages: 1,
    });

    await expect(sweepRankCheckRawPurgeProgressActivity()).resolves.toEqual({
      cutoff: "2026-07-21T12:00:00.000Z",
      deleted: 503,
      deletePages: 2,
      fenceRetentionDays: 7,
      hasMore: false,
      pageSize: 500,
      scrubbed: 2,
      scrubPages: 1,
    });
  });

  it("serializes the session purge summary's Date to an ISO string", async () => {
    mocks.purgeExpiredSessions.mockResolvedValue({
      cutoff: new Date("2026-06-20T00:00:00.000Z"),
      sessionsDeleted: 4,
      verificationsDeleted: 2,
    });

    await expect(purgeExpiredSessionsActivity()).resolves.toEqual({
      cutoff: "2026-06-20T00:00:00.000Z",
      sessionsDeleted: 4,
      verificationsDeleted: 2,
    });
    expect(mocks.purgeExpiredSessions).toHaveBeenCalledOnce();
    expect(mocks.purgeExpiredSessions.mock.calls[0]).toEqual([]);
  });

  it("purges one queued-ledger page without depending on new submissions", async () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "0");
    mocks.purgeExpiredQueuedRankCheckBatches.mockResolvedValue({
      deleted: 100,
      hasMore: true,
      pageSize: 100,
    });

    await expect(purgeQueuedRankCheckBatchesActivity()).resolves.toEqual({
      deleted: 100,
      hasMore: true,
      pageSize: 100,
    });
    expect(mocks.purgeExpiredQueuedRankCheckBatches).toHaveBeenCalledWith(expect.any(Date));
  });

  it("serializes the stale running-check sweep summary's Date to an ISO string", async () => {
    mocks.markStaleRunningChecks.mockResolvedValue({
      cutoff: new Date("2026-01-01T06:05:00.000Z"),
      failed: 3,
      olderThanMinutes: 15,
      queuedBatches: 25,
      queuedFailed: 1,
      queuedFailureBatchIds: ["batch_failed"],
      queuedHasMore: true,
      queuedNextCursor: {
        id: "batch_last",
        queueDeadlineAt: new Date("2026-01-01T06:00:00.000Z"),
      },
      queuedPending: 2,
      queuedSweepAt: new Date("2026-01-01T06:20:00.000Z"),
      queuedTerminal: 22,
    });

    await expect(markStaleRunningChecksActivity()).resolves.toEqual({
      cutoff: "2026-01-01T06:05:00.000Z",
      failed: 3,
      olderThanMinutes: 15,
      queuedBatches: 25,
      queuedFailed: 1,
      queuedFailureBatchIds: ["batch_failed"],
      queuedHasMore: true,
      queuedNextCursor: {
        id: "batch_last",
        queueDeadlineAt: "2026-01-01T06:00:00.000Z",
      },
      queuedPending: 2,
      queuedSweepAt: "2026-01-01T06:20:00.000Z",
      queuedTerminal: 22,
    });
  });

  it("aggregates weekly digest counts and isolates per-project errors", async () => {
    const now = new Date("2026-07-06T06:15:00.000Z");
    const error = new Error("send failed");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.project.findMany.mockResolvedValue([
      { id: "project_1" },
      { id: "project_2" },
      { id: "project_3" },
    ]);
    mocks.sendWeeklyDigestForProject
      .mockResolvedValueOnce({
        failedChecksCount: 0,
        recipients: 1,
        status: "sent",
        topMovers: 1,
      })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ reason: "no_activity", status: "skipped" });

    await expect(sendWeeklyReportDigestActivity()).resolves.toEqual({
      projects: 3,
      sent: 1,
      skipped: 2,
    });

    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(mocks.sendWeeklyDigestForProject).toHaveBeenNthCalledWith(1, "project_1", now);
    expect(mocks.sendWeeklyDigestForProject).toHaveBeenNthCalledWith(2, "project_2", now);
    expect(mocks.sendWeeklyDigestForProject).toHaveBeenNthCalledWith(3, "project_3", now);
    expect(console.error).toHaveBeenCalledWith("[reports] weekly digest failed", {
      error,
      projectId: "project_2",
    });
  });

  it("delegates sitemap sync activity to the shared all-project sync", async () => {
    const now = new Date("2026-07-04T04:45:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.syncSitemapForAllProjects.mockResolvedValue({
      baselined: 1,
      changed: 2,
      failed: 0,
      projects: 3,
      pruned: 4,
      skipped: 0,
      unchanged: 0,
    });

    await expect(syncSitemapsActivity()).resolves.toMatchObject({ projects: 3, pruned: 4 });
    expect(mocks.syncSitemapForAllProjects).toHaveBeenCalledWith(now);
  });

  it("delegates presence sync activity to the shared all-project sync", async () => {
    const now = new Date("2026-07-04T03:45:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.syncPresenceForAllProjects.mockResolvedValue({
      checked: 2,
      deferred: 0,
      failed: 0,
      projects: 1,
      signals: 1,
      skipped: 0,
      urls: 2,
    });

    await expect(syncPresenceActivity()).resolves.toMatchObject({ checked: 2, signals: 1 });
    expect(mocks.syncPresenceForAllProjects).toHaveBeenCalledWith(now);
  });
});
