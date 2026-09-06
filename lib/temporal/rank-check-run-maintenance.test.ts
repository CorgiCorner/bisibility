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
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "0");
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

it("keeps the legacy maintenance fallback when the maintenance flag is unset", async () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "1");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "");
  const client = { create: vi.fn() };

  await expect(ensureRankCheckRunsSchedule(client)).resolves.toEqual({
    scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
    status: "created",
  });
  expect(rankCheckRunsScheduleDecision()).toEqual({
    enabled: true,
    reason: "RANK_CHECK_RECONCILER_ENABLED controls legacy maintenance fallback",
  });
});

it("keeps the runs reconciler disabled by the legacy fallback when maintenance is unset", async () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "0");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "");
  const client = { create: vi.fn() };

  await expect(ensureRankCheckRunsSchedule(client)).resolves.toEqual({
    scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
    status: "disabled",
  });
  expect(client.create).not.toHaveBeenCalled();
});

it("fails startup when the worker disables run maintenance", () => {
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "0");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "");

  expect(() => assertRankCheckRunsScheduleEnabled()).toThrow(
    "SCHEDULED_MAINTENANCE_ENABLED and RANK_CHECK_RECONCILER_ENABLED",
  );
});
