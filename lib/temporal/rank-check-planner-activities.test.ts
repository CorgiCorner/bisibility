import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  launchDuePlannedRunsActivity,
  planRankCheckRunsActivity,
} from "./rank-check-planner-activities";

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  launch: vi.fn(),
  plan: vi.fn(),
  start: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../rank-check/planner/plan", () => ({ planRankCheckRuns: mocks.plan }));
vi.mock("../rank-check/planner/launch-due", () => ({ launchDuePlannedRuns: mocks.launch }));
vi.mock("./scheduler-client", () => ({ getSchedulerTemporalClient: mocks.getClient }));

describe("rank-check planner activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClient.mockResolvedValue({ workflow: { start: mocks.start } });
  });

  it("passes a stable tick instant into schedule planning", async () => {
    mocks.plan.mockResolvedValue({
      blocked: 0,
      cursor: null,
      done: true,
      planned: 1,
      schedules: 1,
    });

    await planRankCheckRunsActivity({
      cursor: "schedule_1",
      limit: 200,
      now: "2026-09-02T08:00:00.000Z",
    });

    expect(mocks.plan).toHaveBeenCalledWith({
      cursor: "schedule_1",
      limit: 200,
      now: new Date("2026-09-02T08:00:00.000Z"),
    });
  });

  it("launches due runs through the local B5b seam", async () => {
    mocks.launch.mockImplementation(async ({ startRun }) => {
      await startRun({ runId: "run_1", workflowId: "rank-check-run-rcr_1" });
      return { cursor: null, hasMore: false, launched: 1, scanned: 1 };
    });

    await expect(
      launchDuePlannedRunsActivity({ cursor: null, limit: 100, now: "2026-09-02T08:00:00.000Z" }),
    ).resolves.toEqual({ cursor: null, hasMore: false, launched: 1, scanned: 1 });

    expect(mocks.start).toHaveBeenCalledWith(
      "rankCheckRunWorkflow",
      expect.objectContaining({
        args: [{ runId: "run_1" }],
        workflowId: "rank-check-run-rcr_1",
        workflowIdConflictPolicy: "FAIL",
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      }),
    );
  });

  it("tolerates an already-started run workflow", async () => {
    mocks.launch.mockImplementation(async ({ startRun }) => {
      await startRun({ runId: "run_1", workflowId: "rank-check-run-rcr_1" });
      return { cursor: null, hasMore: false, launched: 1, scanned: 1 };
    });
    mocks.start.mockRejectedValueOnce({ name: "WorkflowExecutionAlreadyStartedError" });

    await expect(
      launchDuePlannedRunsActivity({ cursor: null, limit: 100, now: "2026-09-02T08:00:00.000Z" }),
    ).resolves.toEqual({ cursor: null, hasMore: false, launched: 1, scanned: 1 });
  });
});
