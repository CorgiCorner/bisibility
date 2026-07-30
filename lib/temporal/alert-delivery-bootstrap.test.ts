import { ScheduleAlreadyRunning } from "@temporalio/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
  ensureAlertDeliverySweepSchedule,
} from "./alert-delivery-bootstrap";

describe("alert delivery sweep bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the sweep on the alert delivery task queue", async () => {
    const client = { create: vi.fn() };
    await expect(ensureAlertDeliverySweepSchedule(client)).resolves.toEqual({
      scheduleId: ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          taskQueue: "alert-deliveries",
          workflowType: "sweepAlertDeliveriesWorkflow",
        }),
        scheduleId: ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 minute" }] },
      }),
    );
  });

  it("reports exists when the schedule is already running", async () => {
    const client = {
      create: vi
        .fn()
        .mockRejectedValue(new ScheduleAlreadyRunning("exists", ALERT_DELIVERY_SWEEP_SCHEDULE_ID)),
    };
    await expect(ensureAlertDeliverySweepSchedule(client)).resolves.toEqual({
      scheduleId: ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("is disabled by ALERT_DELIVERY_SWEEP_ENABLED=0", async () => {
    vi.stubEnv("ALERT_DELIVERY_SWEEP_ENABLED", "0");
    const client = { create: vi.fn() };
    await expect(ensureAlertDeliverySweepSchedule(client)).resolves.toEqual({
      scheduleId: ALERT_DELIVERY_SWEEP_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });
});
