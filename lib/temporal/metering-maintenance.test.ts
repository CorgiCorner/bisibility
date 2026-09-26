import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ScheduleAlreadyRunning,
  type ScheduleDescription,
  type ScheduleHandle,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  maintain: vi.fn(),
  proxyActivities: vi.fn(),
}));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities.mockReturnValue({
    maintainMeteringShadowActivity: mocks.activity,
  }),
}));
vi.mock("../metering/maintenance", () => ({ maintainMeteringShadow: mocks.maintain }));

import * as activities from "./activities";
import { maintainMeteringShadowActivity } from "./metering-maintenance-activity";
import {
  ensureMeteringMaintenanceSchedule,
  METERING_MAINTENANCE_SCHEDULE_ID,
  METERING_MAINTENANCE_WORKFLOW_TYPE,
} from "./metering-maintenance-bootstrap";
import { maintainMeteringShadowWorkflow } from "./metering-maintenance-workflow";

function scheduleClientMock(initial?: { paused: boolean; every?: number }) {
  let schedule = initial;
  const handle = {
    describe: vi.fn(async () => {
      if (!schedule) throw new ScheduleNotFoundError("missing", METERING_MAINTENANCE_SCHEDULE_ID);
      return {
        action: {
          type: "startWorkflow",
          workflowId: METERING_MAINTENANCE_SCHEDULE_ID,
          workflowType: METERING_MAINTENANCE_WORKFLOW_TYPE,
        },
        policies: { catchupWindow: 3_600_000 },
        spec: { intervals: [{ every: schedule.every ?? 60_000, offset: 0 }] },
        state: { paused: schedule.paused },
      } as unknown as ScheduleDescription;
    }),
    pause: vi.fn(async () => {
      if (!schedule) throw new ScheduleNotFoundError("missing", METERING_MAINTENANCE_SCHEDULE_ID);
      schedule.paused = true;
    }),
    update: vi.fn(async (updater: (previous: ScheduleDescription) => ScheduleDescription) => {
      const previous = await handle.describe();
      const updated = updater(previous);
      schedule = {
        every: updated.spec.intervals?.[0]?.every as number | undefined,
        paused: updated.state.paused,
      };
    }),
  };
  const create = vi.fn(async () => {
    if (schedule) throw new ScheduleAlreadyRunning("exists", METERING_MAINTENANCE_SCHEDULE_ID);
    schedule = { paused: false };
    return handle as unknown as ScheduleHandle;
  });
  return {
    client: { create, getHandle: vi.fn(() => handle as unknown as ScheduleHandle) },
    handle,
  };
}

describe("metering maintenance schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    vi.stubEnv("METERING_SHADOW", "on");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates one worker-owned sweep per minute with overlap skipped", async () => {
    const { client } = scheduleClientMock();
    await expect(ensureMeteringMaintenanceSchedule(client)).resolves.toEqual({
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          workflowId: METERING_MAINTENANCE_SCHEDULE_ID,
          workflowType: METERING_MAINTENANCE_WORKFLOW_TYPE,
        }),
        policies: expect.objectContaining({ overlap: ScheduleOverlapPolicy.SKIP }),
        spec: { intervals: [{ every: "1 minute" }] },
      }),
    );
  });

  it.each([
    ["shadow off", "1", "off"],
    ["maintenance off", "0", "on"],
  ])("pauses an existing schedule when %s", async (_label, maintenance, shadow) => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", maintenance);
    vi.stubEnv("METERING_SHADOW", shadow);
    const { client, handle } = scheduleClientMock({ paused: false });
    await expect(ensureMeteringMaintenanceSchedule(client)).resolves.toEqual({
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      status: "disabled",
    });
    expect(handle.pause).toHaveBeenCalledOnce();
    await ensureMeteringMaintenanceSchedule(client);
    expect(handle.pause).toHaveBeenCalledOnce();
    expect(client.create).not.toHaveBeenCalled();
  });

  it("converges an existing paused schedule to the one-minute interval", async () => {
    const { client, handle } = scheduleClientMock({ paused: true, every: 300_000 });
    await expect(ensureMeteringMaintenanceSchedule(client)).resolves.toEqual({
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      status: "updated",
    });
    expect(handle.update).toHaveBeenCalledOnce();
    const updated = await handle.describe();
    expect(updated.spec.intervals?.[0]?.every).toBe(60_000);
    expect(updated.state.paused).toBe(false);
  });

  it("treats a disabled missing schedule as converged", async () => {
    vi.stubEnv("METERING_SHADOW", "off");
    const { client, handle } = scheduleClientMock();
    await expect(ensureMeteringMaintenanceSchedule(client)).resolves.toEqual({
      scheduleId: METERING_MAINTENANCE_SCHEDULE_ID,
      status: "disabled",
    });
    expect(handle.pause).not.toHaveBeenCalled();
  });
});

describe("metering maintenance activity and workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    vi.stubEnv("METERING_SHADOW", "on");
    mocks.activity.mockResolvedValue({ status: "completed" });
    mocks.maintain.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs the bounded sweep through an activity", async () => {
    await expect(maintainMeteringShadowWorkflow()).resolves.toEqual({ status: "completed" });
    await expect(maintainMeteringShadowActivity()).resolves.toEqual({ status: "completed" });
    expect(mocks.maintain).toHaveBeenCalledOnce();
    expect(activities.maintainMeteringShadowActivity).toBe(maintainMeteringShadowActivity);
    expect(maintainMeteringShadowWorkflow.name).toBe(METERING_MAINTENANCE_WORKFLOW_TYPE);
  });

  it.each([
    ["shadow off", "1", "off"],
    ["maintenance off", "0", "on"],
  ])("skips the activity when %s", async (_label, maintenance, shadow) => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", maintenance);
    vi.stubEnv("METERING_SHADOW", shadow);
    await expect(maintainMeteringShadowActivity()).resolves.toEqual({ status: "skipped" });
    expect(mocks.maintain).not.toHaveBeenCalled();
  });

  it("registers the workflow and bootstraps its schedule without a liveness timer", () => {
    const workflows = readFileSync(resolve(import.meta.dirname, "workflows.ts"), "utf8");
    const worker = readFileSync(resolve(import.meta.dirname, "worker.ts"), "utf8");
    const runtime = readFileSync(resolve(import.meta.dirname, "welcome-intent-runtime.ts"), "utf8");
    expect(workflows).toContain(
      'export { maintainMeteringShadowWorkflow } from "./metering-maintenance-workflow"',
    );
    expect(worker).toContain("ensureMeteringMaintenanceSchedule(),");
    expect(runtime).not.toContain("maintainMeteringShadow");
  });
});
