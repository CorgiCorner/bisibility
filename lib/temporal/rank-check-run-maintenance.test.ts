import { assertRankCheckRunsScheduleEnabled } from "@/lib/rank-check/run-maintenance-config";
import {
  ensureRankCheckRunsSchedule,
  RANK_CHECK_RUNS_SCHEDULE_ID,
  rankCheckRunsScheduleDecision,
} from "@/lib/temporal/maintenance-schedule-bootstrap";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("reconciles rank-check runs every five minutes", async () => {
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
  const client = { create: vi.fn() };

  await ensureRankCheckRunsSchedule(client);

  expect(client.create).toHaveBeenCalledWith(
    expect.objectContaining({
      action: expect.objectContaining({ workflowType: "reconcileRankCheckRunsWorkflow" }),
      memo: { kind: "rank_check_runs" },
      scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
      spec: { intervals: [{ every: "5 minutes" }] },
    }),
  );
});

it("creates the runs reconciler in dispatcher mode when maintenance is disabled", async () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
  const client = { create: vi.fn() };

  await expect(ensureRankCheckRunsSchedule(client)).resolves.toEqual({
    scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
    status: "created",
  });

  expect(client.create).toHaveBeenCalledWith(
    expect.objectContaining({ scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID }),
  );
  expect(rankCheckRunsScheduleDecision()).toEqual({
    enabled: true,
    reason: "RANK_CHECK_SCHEDULER_MODE=dispatcher requires run reconciliation",
  });
});

it("keeps run reconciliation available during cutover despite the retired optional-maintenance opt-out", async () => {
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "");
  const client = { create: vi.fn() };

  await expect(ensureRankCheckRunsSchedule(client)).resolves.toEqual({
    scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
    status: "created",
  });
  expect(rankCheckRunsScheduleDecision()).toEqual({
    enabled: true,
    reason: "SCHEDULED_MAINTENANCE_ENABLED controls maintenance during cutover",
  });
});

it("can disable run maintenance during cutover", async () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
  const client = { create: vi.fn() };

  await expect(ensureRankCheckRunsSchedule(client)).resolves.toEqual({
    scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
    status: "disabled",
  });
  expect(client.create).not.toHaveBeenCalled();
});

it("fails startup when the worker disables run maintenance", () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");

  expect(() => assertRankCheckRunsScheduleEnabled()).toThrow("SCHEDULED_MAINTENANCE_ENABLED");
});
