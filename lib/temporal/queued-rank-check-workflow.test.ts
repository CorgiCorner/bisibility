import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queuedRankCheckBatchWorkflow } from "./queued-rank-check-workflow";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  continueAsNew: vi.fn(),
  inspect: vi.fn(),
  persist: vi.fn(),
  prepare: vi.fn(),
  progress: vi.fn(),
  proxies: [] as unknown[],
  sleep: vi.fn(),
  submit: vi.fn(),
  timeout: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: "WAIT_CANCELLATION_COMPLETED" },
  CancellationScope: { nonCancellable: (operation: () => unknown) => operation() },
  continueAsNew: mocks.continueAsNew,
  isCancellation: vi.fn(() => false),
  proxyActivities: vi.fn((options) => {
    mocks.proxies.push(options);
    if (options.startToCloseTimeout === "45 seconds") {
      return { submitQueuedRankCheckBatchActivity: mocks.submit };
    }
    if (options.startToCloseTimeout === "2 minutes") {
      return { persistReadyQueuedRankCheckTasksActivity: mocks.persist };
    }
    if (options.startToCloseTimeout === "1 minute" && options.heartbeatTimeout === "15 seconds") {
      return { inspectQueuedRankCheckBatchActivity: mocks.inspect };
    }
    return {
      authorizeQueuedRankCheckBatchActivity: mocks.authorize,
      prepareQueuedRankCheckBatchActivity: mocks.prepare,
      queuedRankCheckBatchProgressActivity: mocks.progress,
      timeoutQueuedRankCheckBatchActivity: mocks.timeout,
    };
  }),
  sleep: mocks.sleep,
  workflowInfo: vi.fn(() => ({
    runId: "run_1",
    workflowId: "queued-rank-check-project-location-desktop-1-0",
  })),
}));

const input = {
  claimedAt: "2026-07-29T00:00:00.000Z",
  chunkIndex: 0,
  device: "desktop",
  keywordIds: ["keyword_1", "keyword_2"],
  locationId: "location_1",
  projectId: "project_1",
};

describe("queuedRankCheckBatchWorkflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:05:00.000Z"));
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: true,
      allowPrepare: true,
      allowSubmit: true,
      existingState: null,
      mode: "dispatcher",
      reason: null,
    });
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-29T00:00:00.000Z",
      state: "prepared",
    });
    mocks.submit.mockResolvedValue({ state: "submitted" });
    mocks.progress.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 0,
      ready: 2,
      state: "ready",
      terminal: 0,
    });
    mocks.persist.mockResolvedValue({
      completed: 2,
      failed: 0,
      pending: 0,
      state: "completed",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses a Temporal timer between readiness checks", async () => {
    mocks.inspect
      .mockResolvedValueOnce({
        ambiguous: 0,
        pending: 2,
        ready: 0,
        state: "submitted",
        terminal: 0,
      })
      .mockResolvedValueOnce({
        ambiguous: 0,
        pending: 0,
        ready: 2,
        state: "ready",
        terminal: 0,
      });

    await queuedRankCheckBatchWorkflow(input);

    expect(mocks.sleep).toHaveBeenCalledWith("15 seconds");
    expect(mocks.inspect.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sleep.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.sleep.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.inspect.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("stops a new cutover batch before preparation creates lifecycle rows", async () => {
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: false,
      allowPrepare: false,
      allowSubmit: false,
      existingState: null,
      mode: "cutover",
      reason: "queued_dispatch_disabled_in_cutover",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("accepts a late prepare fence after the initial authorization activity", async () => {
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 1,
      persisted: false,
      pollIntervalSeconds: 1,
      startedAt: "2026-07-29T00:05:00.000Z",
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("retrieves already-paid queued results in cutover without calling submit", async () => {
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: true,
      allowPrepare: true,
      allowSubmit: false,
      existingState: "submitted",
      mode: "cutover",
      reason: "queued_submission_disabled_in_cutover",
    });
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-29T00:00:00.000Z",
      state: "submitted",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      state: "completed",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenCalledOnce();
  });

  it("terminalizes an unsubmitted prepared batch in cutover without provider work", async () => {
    mocks.authorize.mockResolvedValue({
      allowPaidRetrieval: false,
      allowPrepare: true,
      allowSubmit: false,
      existingState: "prepared",
      mode: "cutover",
      reason: "queued_submission_disabled_in_cutover",
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      state: "deferred",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.timeout).toHaveBeenCalledOnce();
  });

  it("checks an already-expired deadline before provider-backed inspection", async () => {
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-28T00:00:00.000Z",
      state: "submitted",
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });

    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("does not inspect or fetch results after a sleep crosses the deadline", async () => {
    vi.setSystemTime(new Date("2026-07-29T00:14:59.000Z"));
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 2,
      ready: 0,
      state: "submitted",
      terminal: 0,
    });
    mocks.sleep.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-07-29T00:15:00.000Z"));
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });

    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.inspect.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sleep.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.sleep.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.timeout.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not persist results when readiness inspection crosses the deadline", async () => {
    vi.setSystemTime(new Date("2026-07-29T00:14:59.000Z"));
    mocks.inspect.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-07-29T00:15:00.000Z"));
      return {
        ambiguous: 0,
        pending: 0,
        ready: 2,
        state: "ready",
        terminal: 0,
      };
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });

    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.timeout).toHaveBeenCalledOnce();
  });

  it("enters deadline cleanup once inspection reports its provider fence closed", async () => {
    mocks.inspect.mockResolvedValueOnce({
      ambiguous: 0,
      deadlineReached: true,
      pending: 2,
      ready: 0,
      state: "submitted",
      terminal: 0,
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });

    expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.inspect).toHaveBeenCalledWith({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });
    expect(mocks.timeout).toHaveBeenCalledOnce();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  it("passes the absolute deadline into result persistence", async () => {
    await queuedRankCheckBatchWorkflow(input);

    expect(mocks.persist).toHaveBeenCalledWith({
      batchId: "batch_1",
      deadlineAt: "2026-07-29T00:15:00.000Z",
    });
  });

  it("continues as new before polling history becomes unbounded", async () => {
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 2,
      ready: 0,
      state: "submitted",
      terminal: 0,
    });

    await queuedRankCheckBatchWorkflow({ ...input, polls: 19 });

    expect(mocks.continueAsNew).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch_1",
        polls: 20,
        startedAt: "2026-07-29T00:00:00.000Z",
      }),
    );
  });

  it("finishes an expired ambiguous submission explicitly without resubmitting", async () => {
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-28T00:00:00.000Z",
      state: "ambiguous",
    });
    mocks.submit.mockResolvedValue({ state: "ambiguous" });
    mocks.inspect.mockResolvedValue({
      ambiguous: 2,
      pending: 0,
      ready: 0,
      state: "ambiguous",
      terminal: 0,
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      state: "deferred",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.timeout).toHaveBeenCalledWith({
      batchId: "batch_1",
      reason: expect.stringContaining("ambiguous"),
    });
  });

  it("terminalizes pending tasks at the deadline even when maintenance is disabled", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-28T00:00:00.000Z",
      state: "submitted",
    });
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 2,
      ready: 0,
      state: "submitted",
      terminal: 0,
    });
    mocks.timeout.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });
    expect(mocks.timeout).toHaveBeenCalledOnce();
  });

  it("retries deadline cleanup through a timer while a persistence lease is live", async () => {
    mocks.prepare.mockResolvedValue({
      batchId: "batch_1",
      maxQueueAgeSeconds: 900,
      pollIntervalSeconds: 15,
      startedAt: "2026-07-28T00:00:00.000Z",
      state: "ready",
    });
    mocks.inspect.mockResolvedValue({
      ambiguous: 0,
      pending: 0,
      ready: 1,
      state: "ready",
      terminal: 0,
    });
    mocks.timeout
      .mockResolvedValueOnce({
        completed: 0,
        failed: 0,
        pending: 1,
        state: "ready",
      })
      .mockResolvedValueOnce({
        completed: 0,
        failed: 0,
        pending: 0,
        state: "deferred",
      });

    await expect(queuedRankCheckBatchWorkflow(input)).resolves.toMatchObject({
      pending: 0,
      state: "deferred",
    });
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.timeout).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenCalledWith("15 seconds");
  });

  it("configures paid submission retries around the durable ledger", () => {
    expect(
      mocks.proxies.some(
        (options) =>
          (options as { retry?: { maximumAttempts?: number } }).retry?.maximumAttempts === 3 &&
          (options as { startToCloseTimeout?: string }).startToCloseTimeout === "45 seconds",
      ),
    ).toBe(true);
  });

  it("configures result activities for heartbeat-delivered cancellation", () => {
    expect(
      mocks.proxies.some(
        (options) =>
          (options as { heartbeatTimeout?: string }).heartbeatTimeout === "15 seconds" &&
          (options as { startToCloseTimeout?: string }).startToCloseTimeout === "2 minutes",
      ),
    ).toBe(true);
  });
});
