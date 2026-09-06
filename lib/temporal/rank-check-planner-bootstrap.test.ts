import { ScheduleAlreadyRunning, type ScheduleHandle } from "@temporalio/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureRankCheckPlannerSchedule,
  RANK_CHECK_PLANNER_SCHEDULE_ID,
} from "./rank-check-planner-bootstrap";

vi.mock("server-only", () => ({}));

describe("rank-check planner schedule bootstrap", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates a 15-minute singleton only in dispatcher mode", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    const client = { create: vi.fn().mockResolvedValue({}) };

    await expect(ensureRankCheckPlannerSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_PLANNER_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          workflowId: RANK_CHECK_PLANNER_SCHEDULE_ID,
          workflowType: "planRankCheckRunsWorkflow",
        }),
        policies: expect.objectContaining({ overlap: "SKIP" }),
        spec: { intervals: [{ every: "15 minutes" }] },
      }),
    );
  });

  it.each(["legacy", "cutover"] as const)("is disabled in %s mode", async (mode) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    const client = { create: vi.fn() };

    await expect(ensureRankCheckPlannerSchedule(client)).resolves.toMatchObject({
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("converges the configured interval", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("RANK_CHECK_PLANNER_INTERVAL", "30 minutes");
    const handle = {
      describe: vi.fn().mockResolvedValue({
        action: {
          workflowId: RANK_CHECK_PLANNER_SCHEDULE_ID,
          workflowType: "planRankCheckRunsWorkflow",
        },
        policies: { catchupWindow: 3_600_000 },
        spec: { intervals: [{ every: 900_000, offset: 0 }] },
        state: { paused: false },
      }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const client = {
      create: vi
        .fn()
        .mockRejectedValue(new ScheduleAlreadyRunning("exists", RANK_CHECK_PLANNER_SCHEDULE_ID)),
      getHandle: vi.fn(() => handle as unknown as ScheduleHandle),
    };

    await expect(ensureRankCheckPlannerSchedule(client)).resolves.toMatchObject({
      status: "updated",
    });
    expect(handle.update).toHaveBeenCalledOnce();
  });
});
