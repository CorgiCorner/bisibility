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
  backfills: vi.fn(),
  proxyActivities: vi.fn(),
}));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities.mockReturnValue({
    reconcileQueuedSearchInsightsImportsActivity: mocks.activity,
  }),
}));
vi.mock("../search-insights/sync/queued-import-reconciler", () => ({
  reconcileQueuedSearchInsightsImports: mocks.backfills,
}));

import { reconcileQueuedSearchInsightsImportsActivity } from "./search-insights-reconciliation-activity";
import {
  ensureSearchInsightsQueueReconciliationSchedule,
  SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
  SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE,
} from "./search-insights-reconciliation-bootstrap";
import { reconcileQueuedSearchInsightsImportsWorkflow } from "./search-insights-reconciliation-workflow";

describe("queued search insights workflow", () => {
  it("delegates one deterministic sweep to the activity", async () => {
    const result = {
      attempted: 2,
      failed: 1,
      scanned: 3,
      skipped: 1,
      stamped: 1,
    };
    mocks.activity.mockResolvedValue(result);
    await expect(reconcileQueuedSearchInsightsImportsWorkflow()).resolves.toEqual(result);
    expect(mocks.activity).toHaveBeenCalledOnce();
  });
});

describe("queued search insights reconciliation activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs only queued-import backfills", async () => {
    const backfills = { attempted: 1, failed: 0, scanned: 1, skipped: 0, stamped: 1 };
    mocks.backfills.mockResolvedValue(backfills);

    await expect(reconcileQueuedSearchInsightsImportsActivity()).resolves.toEqual(backfills);
    expect(mocks.backfills).toHaveBeenCalledOnce();
  });
});

type MockSchedule = { paused: boolean };

function scheduleClientMock(initial?: MockSchedule) {
  let schedule = initial;
  const handle = {
    describe: vi.fn(async () => {
      if (!schedule) {
        throw new ScheduleNotFoundError(
          "missing",
          SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
        );
      }
      return {
        action: {
          type: "startWorkflow",
          workflowId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
          workflowType: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE,
        },
        policies: { catchupWindow: 3_600_000 },
        spec: { intervals: [{ every: 300_000, offset: 0 }] },
        state: { paused: schedule.paused },
      } as unknown as ScheduleDescription;
    }),
    pause: vi.fn(async () => {
      if (!schedule) {
        throw new ScheduleNotFoundError(
          "missing",
          SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
        );
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
      throw new ScheduleAlreadyRunning("exists", SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID);
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

describe("queued search insights schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a modest singleton periodic sweep", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    const { client } = scheduleClientMock();
    await expect(ensureSearchInsightsQueueReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          workflowId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
          workflowType: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_WORKFLOW_TYPE,
        }),
        policies: expect.objectContaining({ overlap: ScheduleOverlapPolicy.SKIP }),
        spec: { intervals: [{ every: "5 minutes" }] },
      }),
    );
  });

  it("is idempotent when the singleton already exists", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    const { client } = scheduleClientMock({ paused: false });
    await expect(ensureSearchInsightsQueueReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("pauses an existing schedule while disabled and unpauses it when re-enabled", async () => {
    const { client, handle, isPaused } = scheduleClientMock();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    await ensureSearchInsightsQueueReconciliationSchedule(client);

    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    await expect(ensureSearchInsightsQueueReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      status: "disabled",
    });
    await ensureSearchInsightsQueueReconciliationSchedule(client);
    expect(isPaused()).toBe(true);
    expect(handle.pause).toHaveBeenCalledOnce();

    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    await expect(ensureSearchInsightsQueueReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      status: "updated",
    });
    expect(isPaused()).toBe(false);
  });

  it("treats a missing disabled schedule as converged", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    const { client, handle } = scheduleClientMock();

    await expect(ensureSearchInsightsQueueReconciliationSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_QUEUE_RECONCILIATION_SCHEDULE_ID,
      status: "disabled",
    });
    expect(handle.pause).not.toHaveBeenCalled();
  });
});
