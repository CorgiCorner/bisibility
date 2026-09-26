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
  continueAsNew: vi.fn(),
  proxyActivities: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@temporalio/workflow", () => ({
  continueAsNew: mocks.continueAsNew,
  proxyActivities: mocks.proxyActivities.mockReturnValue({
    reconcileProviderUsageActivity: mocks.activity,
  }),
}));
vi.mock("../provider-usage/reconcile", () => ({
  reconcileProviderUsage: mocks.reconcile,
}));

import * as activities from "./activities";
import { reconcileProviderUsageActivity } from "./provider-usage-reconcile-activity";
import {
  ensureProviderUsageReconciliationSchedule,
  PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
  PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE,
} from "./provider-usage-reconcile-bootstrap";
import { reconcileProviderUsageWorkflow } from "./provider-usage-reconcile-workflow";

describe("provider usage reconciliation workflow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the activity result when the sweep completes the backlog", async () => {
    const result = {
      hasMore: false,
      lastReconciledAt: "2026-09-22T12:00:00.000Z",
      overdue: 0,
      reconciled: 1,
      scanned: 1,
      unconfirmed: 0,
    };
    mocks.activity.mockResolvedValue(result);
    await expect(reconcileProviderUsageWorkflow()).resolves.toEqual(result);
    expect(mocks.activity).toHaveBeenCalledOnce();
    expect(mocks.continueAsNew).not.toHaveBeenCalled();
  });

  it("continues immediately as a new execution while more backlog remains", async () => {
    mocks.activity.mockResolvedValue({
      hasMore: true,
      lastReconciledAt: null,
      overdue: 0,
      reconciled: 100,
      scanned: 100,
      unconfirmed: 0,
    });
    await reconcileProviderUsageWorkflow();
    expect(mocks.continueAsNew).toHaveBeenCalledOnce();
    expect(mocks.continueAsNew).toHaveBeenCalledWith();
  });

  it("returns a maintenance-skipped result without continuing", async () => {
    mocks.activity.mockResolvedValue({ status: "skipped" });
    await expect(reconcileProviderUsageWorkflow()).resolves.toEqual({ status: "skipped" });
    expect(mocks.continueAsNew).not.toHaveBeenCalled();
  });

  it("binds the workflow type constant to the exported function name", () => {
    expect(reconcileProviderUsageWorkflow.name).toBe(PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE);
  });
});

describe("provider usage reconciliation activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("delegates to the bounded reconciliation sweep", async () => {
    const result = {
      hasMore: false,
      lastReconciledAt: "2026-09-22T12:00:00.000Z",
      overdue: 1,
      reconciled: 0,
      scanned: 0,
      unconfirmed: 2,
    };
    mocks.reconcile.mockResolvedValue(result);
    await expect(reconcileProviderUsageActivity()).resolves.toEqual(result);
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.reconcile).toHaveBeenCalledWith();
  });

  it("skips the sweep without touching the ledger when maintenance is disabled", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    await expect(reconcileProviderUsageActivity()).resolves.toEqual({ status: "skipped" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});

describe("provider usage temporal wiring", () => {
  it("registers the activity in the worker activity barrel", () => {
    expect(typeof activities.reconcileProviderUsageActivity).toBe("function");
  });

  it("re-exports the workflow from the Temporal sandbox bundle", () => {
    const source = readFileSync(resolve(import.meta.dirname, "workflows.ts"), "utf8");
    expect(source).toMatch(
      /export\s*\{\s*reconcileProviderUsageWorkflow\s*\}\s*from\s*"\.\/provider-usage-reconcile-workflow"/,
    );
  });

  it("ensures the schedule during worker startup", () => {
    const source = readFileSync(resolve(import.meta.dirname, "worker.ts"), "utf8");
    expect(source).toMatch(
      /import \{ ensureProviderUsageReconciliationSchedule \} from "\.\/provider-usage-reconcile-bootstrap"/,
    );
    expect(source).toMatch(/ensureProviderUsageReconciliationSchedule\(\),/);
  });
});

type MockSchedule = { paused: boolean };

function scheduleClientMock(initial?: MockSchedule) {
  let schedule = initial;
  const handle = {
    describe: vi.fn(async () => {
      if (!schedule) {
        throw new ScheduleNotFoundError("missing", PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID);
      }
      return {
        action: {
          type: "startWorkflow",
          workflowId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
          workflowType: PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE,
        },
        policies: { catchupWindow: 3_600_000 },
        spec: { intervals: [{ every: 300_000, offset: 0 }] },
        state: { paused: schedule.paused },
      } as unknown as ScheduleDescription;
    }),
    pause: vi.fn(async () => {
      if (!schedule) {
        throw new ScheduleNotFoundError("missing", PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID);
      }
      schedule.paused = true;
    }),
    update: vi.fn(async (updater: (value: ScheduleDescription) => ScheduleDescription) => {
      const current = await handle.describe();
      schedule = { paused: updater(current).state.paused };
    }),
  };
  const create = vi.fn(async () => {
    if (schedule) {
      throw new ScheduleAlreadyRunning("exists", PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID);
    }
    schedule = { paused: false };
    return handle as unknown as ScheduleHandle;
  });
  return {
    client: { create, getHandle: vi.fn(() => handle as unknown as ScheduleHandle) },
    handle,
    isPaused: () => schedule?.paused,
  };
}

describe("provider usage reconciliation schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays in the maintenance namespace and runs every five minutes", async () => {
    expect(PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID.startsWith("maintenance-")).toBe(true);
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    const { client } = scheduleClientMock();
    await expect(ensureProviderUsageReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          workflowId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
          workflowType: PROVIDER_USAGE_RECONCILIATION_WORKFLOW_TYPE,
        }),
        policies: expect.objectContaining({ overlap: ScheduleOverlapPolicy.SKIP }),
        spec: { intervals: [{ every: "5 minutes" }] },
      }),
    );
  });

  it("is idempotent when the singleton already exists", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    const { client } = scheduleClientMock({ paused: false });
    await expect(ensureProviderUsageReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("pauses an existing schedule while disabled and unpauses it when re-enabled", async () => {
    const { client, handle, isPaused } = scheduleClientMock();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    await ensureProviderUsageReconciliationSchedule(client);

    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    await expect(ensureProviderUsageReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      status: "disabled",
    });
    await ensureProviderUsageReconciliationSchedule(client);
    expect(isPaused()).toBe(true);
    expect(handle.pause).toHaveBeenCalledOnce();

    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    await expect(ensureProviderUsageReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      status: "updated",
    });
    expect(isPaused()).toBe(false);
  });

  it("treats a missing disabled schedule as converged", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    const { client, handle } = scheduleClientMock();

    await expect(ensureProviderUsageReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: PROVIDER_USAGE_RECONCILIATION_SCHEDULE_ID,
      status: "disabled",
    });
    expect(handle.pause).not.toHaveBeenCalled();
  });
});
