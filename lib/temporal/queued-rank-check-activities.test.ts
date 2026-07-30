import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectQueuedRankCheckBatchActivity,
  persistReadyQueuedRankCheckTasksActivity,
  prepareQueuedRankCheckBatchActivity,
} from "./queued-rank-check-activities";

const mocks = vi.hoisted(() => ({
  activityContext: {
    cancellationSignal: new AbortController().signal,
    cancelled: Promise.resolve(),
    heartbeat: vi.fn(),
  },
  authorize: vi.fn(),
  defer: vi.fn(),
  inspect: vi.fn(),
  persist: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({
  Context: { current: () => mocks.activityContext },
}));
vi.mock("../rank-check/queued-results", () => ({
  persistReadyQueuedRankCheckTasks: mocks.persist,
}));
vi.mock("../rank-check/queued-prepare", () => ({
  prepareQueuedRankCheckBatch: mocks.prepare,
}));
vi.mock("../rank-check/queued-mode", () => ({
  authorizeQueuedRankCheckBatch: mocks.authorize,
}));
vi.mock("../rank-check/queued-lifecycle", () => ({
  deferQueuedRankCheckBatch: mocks.defer,
  queuedBatchProgress: vi.fn(),
}));
vi.mock("../rank-check/queued-inspect", () => ({
  inspectQueuedRankCheckBatch: mocks.inspect,
}));

describe("queued rank-check provider activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityContext.cancellationSignal = new AbortController().signal;
    mocks.activityContext.cancelled = Promise.resolve();
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: true,
      allowPrepare: true,
      allowSubmit: false,
      existingState: "submitted",
      mode: "cutover",
      reason: null,
    });
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 1,
      ready: 0,
      state: "submitted",
      terminal: 0,
    });
    mocks.persist.mockResolvedValue({
      completed: 1,
      failed: 0,
      pending: 0,
      state: "completed",
    });
    mocks.defer.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });
  });

  it("heartbeats and passes Temporal cancellation into readiness inspection", async () => {
    await inspectQueuedRankCheckBatchActivity({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });

    expect(mocks.activityContext.heartbeat).toHaveBeenCalledWith({
      batchId: "batch_1",
      phase: "provider-inspection",
    });
    expect(mocks.inspect).toHaveBeenCalledWith("batch_1", {
      deadlineAt: new Date("2026-07-29T00:15:00.000Z"),
      signal: mocks.activityContext.cancellationSignal,
    });
  });

  it("blocks provider inspection when the batch has not crossed the paid fence", async () => {
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: false,
      allowPrepare: true,
      allowSubmit: false,
      existingState: "prepared",
      mode: "cutover",
      reason: "queued_submission_disabled_in_cutover",
    });

    await expect(
      inspectQueuedRankCheckBatchActivity({
        batchId: "batch_1",
        deadlineAt: "2026-07-29T00:15:00.000Z",
      }),
    ).resolves.toMatchObject({ deadlineReached: true, state: "prepared" });
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.activityContext.heartbeat).not.toHaveBeenCalled();
  });

  it("rechecks cutover mode before queued preparation creates lifecycle rows", async () => {
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: false,
      allowPrepare: false,
      allowSubmit: false,
      existingState: null,
      mode: "cutover",
      reason: "queued_dispatch_disabled_in_cutover",
    });

    await expect(
      prepareQueuedRankCheckBatchActivity({
        batchId: "batch_1",
        claimedAt: "2026-07-29T00:00:00.000Z",
        chunkIndex: 0,
        device: "desktop",
        keywordIds: ["keyword_1"],
        locationId: "location_1",
        projectId: "project_1",
        workflowRunId: "run_1",
      }),
    ).resolves.toMatchObject({ persisted: false, state: "deferred" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("heartbeats immediately and at the named five-second inspection cadence", async () => {
    vi.useFakeTimers();
    let finishInspection: (() => void) | undefined;
    mocks.inspect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInspection = () =>
            resolve({
              ambiguous: 0,
              pending: 1,
              ready: 0,
              state: "submitted",
              terminal: 0,
            });
        }),
    );

    const activity = inspectQueuedRankCheckBatchActivity({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.activityContext.heartbeat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.activityContext.heartbeat).toHaveBeenCalledTimes(4);
    finishInspection?.();
    await activity;
    vi.useRealTimers();
  });

  it("heartbeats and passes Temporal cancellation into result persistence", async () => {
    await persistReadyQueuedRankCheckTasksActivity({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });

    expect(mocks.activityContext.heartbeat).toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledWith("batch_1", {
      deadlineAt: new Date("2026-07-29T00:15:00.000Z"),
      signal: mocks.activityContext.cancellationSignal,
    });
  });

  it("propagates Temporal cancellation through an in-flight persistence attempt", async () => {
    const controller = new AbortController();
    const cancellation = new Error("activity cancelled");
    const cancelled = Promise.reject(cancellation);
    void cancelled.catch(() => undefined);
    mocks.activityContext.cancellationSignal = controller.signal;
    mocks.activityContext.cancelled = cancelled;
    mocks.persist.mockImplementation(
      async (_batchId: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );

    const activity = persistReadyQueuedRankCheckTasksActivity({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });
    await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    await expect(activity).rejects.toBe(cancellation);
    expect(mocks.activityContext.heartbeat).toHaveBeenCalled();
  });
});
