import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureTrafficSyncSchedule,
  isTrafficSyncEnabled,
  TRAFFIC_SYNC_SCHEDULE_ID,
} from "./bootstrap";

function clientMock() {
  return { create: vi.fn() };
}

describe("traffic sync schedule bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps scheduled traffic sync worker-owned without an HTTP cron fallback", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/cron/traffic-sync/route.ts"))).toBe(false);
  });

  it("is gated off unless traffic sync is enabled", async () => {
    const client = clientMock();

    expect(isTrafficSyncEnabled()).toBe(false);
    await expect(ensureTrafficSyncSchedule(client)).resolves.toEqual({
      scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates the daily traffic sync schedule at 05:45 UTC", async () => {
    vi.stubEnv("TRAFFIC_SYNC_ENABLED", "1");
    const client = clientMock();

    await expect(ensureTrafficSyncSchedule(client)).resolves.toEqual({
      scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          type: "startWorkflow",
          workflowType: "syncTrafficWorkflow",
        }),
        policies: expect.objectContaining({ overlap: ScheduleOverlapPolicy.SKIP }),
        scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
        spec: { calendars: [{ hour: 5, minute: 45 }] },
      }),
    );
  });

  it("honors a cron override", async () => {
    vi.stubEnv("TRAFFIC_SYNC_ENABLED", "true");
    vi.stubEnv("TRAFFIC_SYNC_CRON", "45 6 * * *");
    const client = clientMock();

    await ensureTrafficSyncSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["45 6 * * *"] } }),
    );
  });

  it("treats an already-running schedule as existing", async () => {
    vi.stubEnv("TRAFFIC_SYNC_ENABLED", "on");
    const client = clientMock();
    client.create.mockRejectedValue(new ScheduleAlreadyRunning("exists", TRAFFIC_SYNC_SCHEDULE_ID));

    await expect(ensureTrafficSyncSchedule(client)).resolves.toEqual({
      scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("swallows unexpected errors so the worker still starts", async () => {
    vi.stubEnv("TRAFFIC_SYNC_ENABLED", "yes");
    const client = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.create.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureTrafficSyncSchedule(client)).resolves.toEqual({
      scheduleId: TRAFFIC_SYNC_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
