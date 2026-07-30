import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapRankCheckDispatcherWorkflow,
  dispatchDueRankChecksWorkflow,
} from "./rank-check-dispatcher-workflows";

const mocks = vi.hoisted(() => ({
  backfillKeywordDispatchStatesActivity: vi.fn(),
  claimDueRankChecksActivity: vi.fn(),
  compensateFailedRankCheckClaimsActivity: vi.fn(),
  continueAsNew: vi.fn(),
  logInfo: vi.fn(),
  planQueuedRankCheckGroupActivity: vi.fn(),
  startChild: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  continueAsNew: mocks.continueAsNew,
  log: { info: mocks.logInfo },
  ParentClosePolicy: { ABANDON: "ABANDON" },
  proxyActivities: vi.fn(() => ({
    backfillKeywordDispatchStatesActivity: mocks.backfillKeywordDispatchStatesActivity,
    claimDueRankChecksActivity: mocks.claimDueRankChecksActivity,
    compensateFailedRankCheckClaimsActivity: mocks.compensateFailedRankCheckClaimsActivity,
    planQueuedRankCheckGroupActivity: mocks.planQueuedRankCheckGroupActivity,
  })),
  startChild: mocks.startChild,
}));

describe("dispatchDueRankChecksWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimDueRankChecksActivity.mockResolvedValue({
      claimed: 2,
      claimedAt: "2026-07-28T12:00:00.000Z",
      groups: [
        {
          claims: [
            {
              advancedCheckAt: "2026-07-29T12:00:00.000Z",
              dueCheckAt: "2026-07-28T12:00:00.000Z",
              keywordId: "keyword_1",
              stateVersion: "123",
            },
            {
              advancedCheckAt: "2026-07-29T12:00:00.000Z",
              dueCheckAt: "2026-07-28T12:00:00.000Z",
              keywordId: "keyword_2",
              stateVersion: "124",
            },
          ],
          device: "desktop",
          domain: "example.com",
          keywordIds: ["keyword_1", "keyword_2"],
          locationId: "location_1",
          projectId: "project_1",
        },
      ],
      metrics: {
        distinctProjects: 1,
        largestProjectClaim: 2,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: 0,
        outcome: "claimed",
      },
    });
    mocks.backfillKeywordDispatchStatesActivity.mockResolvedValue({
      cursor: "keyword_2",
      done: true,
      seeded: 2,
    });
    mocks.planQueuedRankCheckGroupActivity.mockResolvedValue({
      mode: "legacy",
      reason: "queued_dataforseo_disabled",
    });
    mocks.startChild.mockResolvedValue({});
    mocks.compensateFailedRankCheckClaimsActivity.mockResolvedValue({
      requested: 1,
      restored: 1,
      stale: 0,
    });
  });

  it("starts the existing rank-check workflow once for every claimed keyword", async () => {
    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      claimed: 2,
      skippedRunning: 0,
      started: 2,
    });

    expect(mocks.startChild).toHaveBeenCalledTimes(3);
    expect(mocks.startChild).toHaveBeenNthCalledWith(
      1,
      "bootstrapRankCheckDispatcherWorkflow",
      expect.objectContaining({
        parentClosePolicy: "ABANDON",
        workflowId: "bootstrap-rank-check-dispatcher",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    );
    expect(mocks.startChild).toHaveBeenNthCalledWith(
      2,
      "rankCheckWorkflow",
      expect.objectContaining({
        args: [
          {
            dispatch: {
              scheduleId: "dispatcher-rank-checks",
              scheduledAt: "2026-07-28T12:00:00.000Z",
            },
            keywordId: "keyword_1",
          },
        ],
        parentClosePolicy: "ABANDON",
        typedSearchAttributes: expect.arrayContaining([
          expect.objectContaining({ key: expect.objectContaining({ name: "keywordId" }) }),
          expect.objectContaining({ key: expect.objectContaining({ name: "projectId" }) }),
          expect.objectContaining({ key: expect.objectContaining({ name: "provider" }) }),
        ]),
        workflowId: "rank-check-keyword_1",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    );
  });

  it("starts a fresh healing sweep after an earlier sweep completed", async () => {
    await dispatchDueRankChecksWorkflow();
    await dispatchDueRankChecksWorkflow();

    const bootstrapStarts = mocks.startChild.mock.calls.filter(
      ([workflowType]) => workflowType === "bootstrapRankCheckDispatcherWorkflow",
    );
    expect(bootstrapStarts).toHaveLength(2);
    for (const [, options] of bootstrapStarts) {
      expect(options).toMatchObject({
        workflowId: "bootstrap-rank-check-dispatcher",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      });
    }
  });

  it("continues dispatching when the healing sweep is already running", async () => {
    mocks.startChild.mockRejectedValueOnce({
      name: "WorkflowExecutionAlreadyStartedError",
    });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      claimed: 2,
      started: 2,
    });
    expect(mocks.claimDueRankChecksActivity).toHaveBeenCalledOnce();
  });

  it("can retry from the beginning after a transient seed failure", async () => {
    mocks.backfillKeywordDispatchStatesActivity
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce({ cursor: "keyword_1", done: true, seeded: 1 });

    await expect(bootstrapRankCheckDispatcherWorkflow()).rejects.toThrow(
      "temporary database failure",
    );
    await expect(bootstrapRankCheckDispatcherWorkflow()).resolves.toEqual({
      pages: 1,
      seeded: 1,
    });
    expect(mocks.backfillKeywordDispatchStatesActivity).toHaveBeenLastCalledWith({
      cursor: null,
      pageSize: 200,
    });
  });

  it("treats an already-running rank check as an overlap skip", async () => {
    mocks.startChild
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ name: "WorkflowExecutionAlreadyStartedError" });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      skippedRunning: 1,
      started: 1,
      workflowStartFailures: 0,
    });
    expect(mocks.compensateFailedRankCheckClaimsActivity).not.toHaveBeenCalled();
  });

  it("compensates a definite child-start failure in a separate activity", async () => {
    mocks.startChild
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("child start rejected"))
      .mockResolvedValueOnce({});

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      compensationRestored: 1,
      compensationStale: 0,
      started: 1,
      workflowStartFailures: 1,
    });
    expect(mocks.compensateFailedRankCheckClaimsActivity).toHaveBeenCalledWith({
      claims: [
        {
          advancedCheckAt: "2026-07-29T12:00:00.000Z",
          dueCheckAt: "2026-07-28T12:00:00.000Z",
          keywordId: "keyword_1",
          stateVersion: "123",
        },
      ],
    });
  });

  it("backfills bounded pages while carrying a durable cursor", async () => {
    mocks.backfillKeywordDispatchStatesActivity
      .mockResolvedValueOnce({ cursor: "keyword_200", done: false, seeded: 200 })
      .mockResolvedValueOnce({ cursor: "keyword_250", done: true, seeded: 50 });

    await expect(bootstrapRankCheckDispatcherWorkflow()).resolves.toEqual({
      pages: 2,
      seeded: 250,
    });
    expect(mocks.backfillKeywordDispatchStatesActivity).toHaveBeenNthCalledWith(1, {
      cursor: null,
      pageSize: 200,
    });
    expect(mocks.backfillKeywordDispatchStatesActivity).toHaveBeenNthCalledWith(2, {
      cursor: "keyword_200",
      pageSize: 200,
    });
  });

  it("starts one queued child for 100 DataForSEO keywords", async () => {
    mocks.claimDueRankChecksActivity.mockResolvedValue({
      claimed: 100,
      claimedAt: "2026-07-29T00:00:00.000Z",
      groups: [
        {
          device: "desktop",
          domain: "example.com",
          keywordIds: Array.from({ length: 100 }, (_, index) => `keyword_${index + 1}`),
          locationId: "location_1",
          projectId: "project_1",
        },
      ],
      metrics: {
        distinctProjects: 1,
        largestProjectClaim: 100,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: 0,
        outcome: "claimed",
      },
    });
    mocks.planQueuedRankCheckGroupActivity.mockResolvedValue({
      mode: "queued",
      provider: "dataforseo",
    });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      queuedBatches: 1,
      queuedKeywords: 100,
      started: 0,
    });
    const queuedStarts = mocks.startChild.mock.calls.filter(
      ([workflowType]) => workflowType === "queuedRankCheckBatchWorkflow",
    );
    expect(queuedStarts).toHaveLength(1);
    expect(queuedStarts[0]?.[1]).toMatchObject({
      args: [expect.objectContaining({ keywordIds: expect.any(Array) })],
      workflowId: "queued-rank-check-project_1-location_1-desktop-1785283200000-0",
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    expect(queuedStarts[0]?.[1].args[0].keywordIds).toHaveLength(100);
  });

  it("starts two queued children for 101 DataForSEO keywords", async () => {
    mocks.claimDueRankChecksActivity.mockResolvedValue({
      claimed: 101,
      claimedAt: "2026-07-29T00:00:00.000Z",
      groups: [
        {
          device: "mobile",
          domain: "example.com",
          keywordIds: Array.from({ length: 101 }, (_, index) => `keyword_${index + 1}`),
          locationId: "location_1",
          projectId: "project_1",
        },
      ],
      metrics: {
        distinctProjects: 1,
        largestProjectClaim: 101,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: 0,
        outcome: "claimed",
      },
    });
    mocks.planQueuedRankCheckGroupActivity.mockResolvedValue({
      mode: "queued",
      provider: "dataforseo",
    });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      queuedBatches: 2,
      queuedKeywords: 101,
    });
    const queuedStarts = mocks.startChild.mock.calls.filter(
      ([workflowType]) => workflowType === "queuedRankCheckBatchWorkflow",
    );
    expect(queuedStarts.map((call) => call[1].args[0].keywordIds.length)).toEqual([100, 1]);
  });

  it("keeps multiple location and device groups independently queued", async () => {
    mocks.claimDueRankChecksActivity.mockResolvedValue({
      claimed: 25,
      claimedAt: "2026-07-29T00:00:00.000Z",
      groups: [
        {
          device: "desktop",
          domain: "example.com",
          keywordIds: Array.from({ length: 13 }, (_, index) => `desktop_${index + 1}`),
          locationId: "location_1",
          projectId: "project_1",
        },
        {
          device: "mobile",
          domain: "example.com",
          keywordIds: Array.from({ length: 12 }, (_, index) => `mobile_${index + 1}`),
          locationId: "location_2",
          projectId: "project_1",
        },
      ],
      metrics: {
        distinctProjects: 1,
        largestProjectClaim: 25,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: 0,
        outcome: "claimed",
      },
    });
    mocks.planQueuedRankCheckGroupActivity.mockResolvedValue({
      mode: "queued",
      provider: "dataforseo",
    });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      queuedBatches: 2,
      queuedKeywords: 25,
      started: 0,
    });
    const queuedStarts = mocks.startChild.mock.calls.filter(
      ([workflowType]) => workflowType === "queuedRankCheckBatchWorkflow",
    );
    expect(
      queuedStarts.map((call) => ({
        count: call[1].args[0].keywordIds.length,
        device: call[1].args[0].device,
        locationId: call[1].args[0].locationId,
        workflowId: call[1].workflowId,
      })),
    ).toEqual([
      {
        count: 13,
        device: "desktop",
        locationId: "location_1",
        workflowId: "queued-rank-check-project_1-location_1-desktop-1785283200000-0",
      },
      {
        count: 12,
        device: "mobile",
        locationId: "location_2",
        workflowId: "queued-rank-check-project_1-location_2-mobile-1785283200000-0",
      },
    ]);
  });

  it("durably defers an ineligible queued group without starting paid Live checks", async () => {
    mocks.planQueuedRankCheckGroupActivity.mockResolvedValue({
      mode: "deferred",
      reason: "credentials_unavailable",
    });

    await expect(dispatchDueRankChecksWorkflow()).resolves.toMatchObject({
      queuedBatches: 1,
      queuedKeywords: 2,
      started: 0,
    });
    expect(
      mocks.startChild.mock.calls.filter(([workflowType]) => workflowType === "rankCheckWorkflow"),
    ).toHaveLength(0);
    expect(
      mocks.startChild.mock.calls.find(
        ([workflowType]) => workflowType === "queuedRankCheckBatchWorkflow",
      )?.[1].args[0],
    ).toMatchObject({ preflightDeferredReason: "credentials_unavailable" });
  });
});
