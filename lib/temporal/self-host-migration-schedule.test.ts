import { ensureMigrationHoldReleaseSchedule } from "@/lib/temporal/maintenance-schedule-bootstrap";
import { ScheduleAlreadyRunning, type ScheduleHandle } from "@temporalio/client";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const scheduleId = "maintenance-migration-hold-release";
const hourMs = 60 * 60_000;

it("converges the former daily migration release schedule to an hourly interval", async () => {
  const handle = {
    describe: vi.fn(async () => ({
      action: { workflowId: scheduleId, workflowType: "releaseExpiredMigrationHoldsWorkflow" },
      policies: { catchupWindow: hourMs },
      spec: { calendars: [{ hour: 4, minute: 51 }] },
      state: { paused: false },
    })),
    update: vi.fn(async (_updater: unknown) => undefined),
  };
  const client = {
    create: vi.fn().mockRejectedValue(new ScheduleAlreadyRunning("exists", scheduleId)),
    getHandle: vi.fn(() => handle as unknown as ScheduleHandle),
  };

  await expect(ensureMigrationHoldReleaseSchedule(client)).resolves.toEqual({
    scheduleId,
    status: "updated",
  });
  const updater = handle.update.mock.calls[0]?.[0] as unknown as (previous: {
    policies: { catchupWindow: number };
    spec: { calendars?: unknown[]; intervals?: Array<{ every: number; offset: number }> };
    state: { paused: boolean };
  }) => { spec: { intervals?: Array<{ every: number; offset: number }> } };
  expect(
    updater({
      policies: { catchupWindow: hourMs },
      spec: { calendars: [{ hour: 4, minute: 51 }] },
      state: { paused: false },
    }).spec.intervals,
  ).toEqual([{ every: hourMs, offset: 0 }]);
});
