import { ScheduleAlreadyRunning, type ScheduleHandle } from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import {
  ensureRankCheckDispatcherSchedule,
  isRankCheckDispatcherEnabled,
} from "./rank-check-dispatcher-bootstrap";

vi.mock("server-only", () => ({}));

function clientMock() {
  return { create: vi.fn() };
}

function runningClientMock(every: number) {
  const handle = {
    describe: vi.fn(async () => ({
      action: {
        workflowId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
        workflowType: "dispatchDueRankChecksWorkflow",
      },
      policies: { catchupWindow: 60 * 60 * 1_000 },
      spec: { intervals: [{ every, offset: 0 }] },
      state: { paused: false },
    })),
    update: vi.fn(async (_updater: unknown) => undefined),
  };
  return {
    create: vi
      .fn()
      .mockRejectedValue(new ScheduleAlreadyRunning("exists", RANK_CHECK_DISPATCHER_SCHEDULE_ID)),
    getHandle: vi.fn(() => handle as unknown as ScheduleHandle),
    handle,
  };
}

describe("rank-check dispatcher schedule bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default and creates no work", async () => {
    const client = clientMock();

    expect(isRankCheckDispatcherEnabled()).toBe(false);
    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates one short-interval singleton when explicitly enabled", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    const client = clientMock();

    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          workflowId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
          workflowType: "dispatchDueRankChecksWorkflow",
        }),
        scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 minute" }] },
      }),
    );
  });

  it("honors the dispatcher interval override", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("RANK_CHECK_DISPATCHER_INTERVAL", "30 seconds");
    const client = clientMock();

    await ensureRankCheckDispatcherSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: "30 seconds" }] } }),
    );
  });

  it("leaves an existing schedule unchanged when interval and policy match", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    const client = runningClientMock(60_000);

    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      status: "exists",
    });
    expect(client.handle.update).not.toHaveBeenCalled();
  });

  it("converges a changed interval on an existing dispatcher schedule", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("RANK_CHECK_DISPATCHER_INTERVAL", "30 seconds");
    const client = runningClientMock(60_000);

    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      status: "updated",
    });
    const updater = client.handle.update.mock.calls[0]?.[0] as unknown as (previous: {
      policies: { catchupWindow: number };
      spec: { intervals?: Array<{ every: number; offset: number }> };
    }) => {
      policies: { catchupWindow: number };
      spec: { intervals?: Array<{ every: number; offset: number }> };
    };
    expect(updater({ policies: { catchupWindow: 60 * 60 * 1_000 }, spec: {} }).spec).toEqual({
      intervals: [{ every: 30_000, offset: 0 }],
    });
  });

  it("reports a create failure without crashing worker startup", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    const client = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.create.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("supports enable-disable-enable without losing the existing singleton", async () => {
    const client = runningClientMock(60_000);

    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toMatchObject({
      status: "exists",
    });
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toMatchObject({
      status: "disabled",
    });
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    await expect(ensureRankCheckDispatcherSchedule(client)).resolves.toMatchObject({
      status: "exists",
    });

    expect(client.create).toHaveBeenCalledTimes(2);
  });
});
