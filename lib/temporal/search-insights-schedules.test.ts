import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureSearchInsightsSyncSchedule,
  SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
  SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE,
} from "./search-insights-bootstrap";

function clientMock() {
  return { create: vi.fn() };
}

describe("search insights sync schedule bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays out of the reconciler's prune namespace", () => {
    expect(SEARCH_INSIGHTS_SYNC_SCHEDULE_ID.startsWith("maintenance-")).toBe(true);
    expect(SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE).toBe("searchInsightsSyncWorkflow");
  });

  it("is gated off when the deployment disables scheduled maintenance", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    const client = clientMock();

    await expect(ensureSearchInsightsSyncSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates the daily sync at 12:40 UTC, after the provider finalizes a Pacific day", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    const client = clientMock();

    await expect(ensureSearchInsightsSyncSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          args: [],
          type: "startWorkflow",
          workflowId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
          workflowType: SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE,
        }),
        policies: expect.objectContaining({ overlap: ScheduleOverlapPolicy.SKIP }),
        scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
        spec: { calendars: [{ hour: 12, minute: 40 }] },
      }),
    );
  });

  it("runs on the maintenance gate alone, with no schedule-specific cron override", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    vi.stubEnv("SEARCH_INSIGHTS_SYNC_CRON", "40 13 * * *");
    const client = clientMock();

    await ensureSearchInsightsSyncSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { calendars: [{ hour: 12, minute: 40 }] } }),
    );
  });

  it("treats an already-running schedule as existing", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "true");
    const client = clientMock();
    client.create.mockRejectedValue(
      new ScheduleAlreadyRunning("exists", SEARCH_INSIGHTS_SYNC_SCHEDULE_ID),
    );

    await expect(ensureSearchInsightsSyncSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("swallows unexpected errors so the worker still starts", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "yes");
    const client = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.create.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureSearchInsightsSyncSchedule(client)).resolves.toEqual({
      scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
