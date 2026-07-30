import {
  ScheduleAlreadyRunning,
  type ScheduleHandle,
  ScheduleNotFoundError,
} from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteRetiredJobProcessorSchedule,
  ensureReconcilerSchedule,
  ensureSingletonSchedule,
  isReconcilerEnabled,
  RECONCILER_SCHEDULE_ID,
  RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
} from "./bootstrap";

function clientMock() {
  return { create: vi.fn() };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type ScheduleUpdater = (previous: {
  policies: { catchupWindow: number };
  state?: { paused?: boolean };
}) => { policies: { catchupWindow: number }; state?: { paused?: boolean } };

function description(catchupWindow: number) {
  return {
    action: {
      workflowId: RECONCILER_SCHEDULE_ID,
      workflowType: "reconcileRankCheckSchedulesWorkflow",
    },
    policies: { catchupWindow },
    state: { paused: false },
  };
}

/** Client whose create() always reports the schedule as already running, plus a
 * getHandle() exposing describe()/update() so convergence can be exercised. */
function runningClientMock(currentCatchupMs: number) {
  const handle = {
    describe: vi.fn(async () => description(currentCatchupMs)),
    update: vi.fn(async (_updater: ScheduleUpdater) => undefined),
  };
  return {
    create: vi.fn().mockRejectedValue(new ScheduleAlreadyRunning("exists", RECONCILER_SCHEDULE_ID)),
    getHandle: vi.fn((_scheduleId: string) => handle as unknown as ScheduleHandle),
    handle,
  };
}

function cleanupClientMock() {
  const handle = { delete: vi.fn(async () => undefined) };
  return {
    getHandle: vi.fn((_scheduleId: string) => handle),
    handle,
  };
}

describe("deleteRetiredJobProcessorSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the retired job-processor schedule", async () => {
    const client = cleanupClientMock();

    await expect(deleteRetiredJobProcessorSchedule(client)).resolves.toEqual({
      scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
      status: "deleted",
    });
    expect(client.getHandle).toHaveBeenCalledWith(RETIRED_JOB_PROCESSOR_SCHEDULE_ID);
    expect(client.handle.delete).toHaveBeenCalledOnce();
  });

  it("treats a missing retired schedule as already clean", async () => {
    const client = cleanupClientMock();
    client.handle.delete.mockRejectedValue(
      new ScheduleNotFoundError("missing", RETIRED_JOB_PROCESSOR_SCHEDULE_ID),
    );

    await expect(deleteRetiredJobProcessorSchedule(client)).resolves.toEqual({
      scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
      status: "absent",
    });
  });

  it("does not prevent worker startup when cleanup fails", async () => {
    const client = cleanupClientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.handle.delete.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(deleteRetiredJobProcessorSchedule(client)).resolves.toEqual({
      scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not mask a non-object rejection while classifying cleanup errors", async () => {
    const client = cleanupClientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.handle.delete.mockRejectedValue(null);

    await expect(deleteRetiredJobProcessorSchedule(client)).resolves.toEqual({
      scheduleId: RETIRED_JOB_PROCESSOR_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("ensureReconcilerSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is gated off only when explicitly disabled", async () => {
    vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
    const client = clientMock();

    expect(isReconcilerEnabled()).toBe(false);
    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates the singleton schedule by default", async () => {
    const client = clientMock();

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          type: "startWorkflow",
          workflowType: "reconcileRankCheckSchedulesWorkflow",
        }),
        scheduleId: RECONCILER_SCHEDULE_ID,
        spec: { intervals: [{ every: "2 minutes" }] },
      }),
    );
  });

  it("defaults the catch-up window to one hour", async () => {
    const client = clientMock();

    await ensureReconcilerSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        policies: expect.objectContaining({ catchupWindow: "1 hour" }),
      }),
    );
  });

  it("honors a catch-up window override on newly created schedules", async () => {
    vi.stubEnv("TEMPORAL_SCHEDULE_CATCHUP_WINDOW", "30 minutes");
    const client = clientMock();

    await ensureReconcilerSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        policies: expect.objectContaining({ catchupWindow: "30 minutes" }),
      }),
    );
  });

  it("honors a custom interval override", async () => {
    vi.stubEnv("RANK_CHECK_RECONCILER_INTERVAL", "30 seconds");
    const client = clientMock();

    await ensureReconcilerSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: "30 seconds" }] } }),
    );
  });

  it("treats an already-running schedule as existing", async () => {
    const client = clientMock();
    client.create.mockRejectedValue(new ScheduleAlreadyRunning("exists", RECONCILER_SCHEDULE_ID));

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("swallows unexpected errors so the worker still starts", async () => {
    const client = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.create.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("ensureSingletonSchedule catch-up convergence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("updates the catch-up window when an existing schedule drifts", async () => {
    const client = runningClientMock(MINUTE_MS);

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "updated",
    });
    expect(client.getHandle).toHaveBeenCalledWith(RECONCILER_SCHEDULE_ID);
    expect(client.handle.describe).toHaveBeenCalledOnce();
    expect(client.handle.update).toHaveBeenCalledOnce();

    // The updater mutates only the catch-up window on the described schedule.
    const updater = client.handle.update.mock.calls[0][0];
    const mutated = updater({ policies: { catchupWindow: MINUTE_MS } });
    expect(mutated.policies.catchupWindow).toBe(HOUR_MS);
  });

  it("leaves an already-converged schedule untouched", async () => {
    const client = runningClientMock(HOUR_MS);

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "exists",
    });
    expect(client.handle.update).not.toHaveBeenCalled();
  });

  it("converges onto an overridden catch-up window", async () => {
    vi.stubEnv("TEMPORAL_SCHEDULE_CATCHUP_WINDOW", "30 minutes");
    const client = runningClientMock(HOUR_MS);

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "updated",
    });
    const updater = client.handle.update.mock.calls[0][0];
    expect(updater({ policies: { catchupWindow: HOUR_MS } }).policies.catchupWindow).toBe(
      30 * MINUTE_MS,
    );
  });

  it("reports a failed convergence so worker startup can fail closed", async () => {
    const client = runningClientMock(MINUTE_MS);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.handle.update.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("stays as exists when the client cannot expose a schedule handle", async () => {
    const client = clientMock();
    client.create.mockRejectedValue(new ScheduleAlreadyRunning("exists", RECONCILER_SCHEDULE_ID));

    await expect(ensureReconcilerSchedule(client)).resolves.toEqual({
      scheduleId: RECONCILER_SCHEDULE_ID,
      status: "exists",
    });
  });
});

describe("ensureSingletonSchedule", () => {
  it("honors a task queue override", async () => {
    const client = clientMock();
    await ensureSingletonSchedule(
      {
        enabled: true,
        memo: { kind: "test" },
        note: "Test schedule",
        scheduleId: "test-schedule",
        spec: { intervals: [{ every: "1 minute" }] },
        taskQueue: "dedicated-queue",
        workflowType: "testWorkflow",
      },
      client,
    );
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ taskQueue: "dedicated-queue" }),
      }),
    );
  });

  it("does not inspect interval state for an unrelated singleton", async () => {
    const handle = {
      describe: vi.fn(async () => ({
        action: { workflowId: "generic-schedule", workflowType: "genericWorkflow" },
        policies: { catchupWindow: MINUTE_MS },
        spec: {},
      })),
      update: vi.fn(async (_updater: ScheduleUpdater) => undefined),
    };
    const client = {
      create: vi.fn().mockRejectedValue(new ScheduleAlreadyRunning("exists", "generic-schedule")),
      getHandle: vi.fn(() => handle as unknown as ScheduleHandle),
    };

    await expect(
      ensureSingletonSchedule(
        {
          enabled: true,
          memo: { kind: "generic" },
          note: "Generic singleton",
          scheduleId: "generic-schedule",
          spec: { intervals: [{ every: "5 minutes" }] },
          workflowType: "genericWorkflow",
        },
        client,
      ),
    ).resolves.toEqual({ scheduleId: "generic-schedule", status: "updated" });
    expect(handle.update).toHaveBeenCalledOnce();
  });
});
