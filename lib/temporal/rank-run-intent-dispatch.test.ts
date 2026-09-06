import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startRun: vi.fn(async (_input: { runId: string; workflowId: string }) => ({
    alreadyExists: false,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("./rank-check-run-workflow-gateway", () => ({
  rankCheckRunWorkflowGateway: { startRun: mocks.startRun, workflowExists: vi.fn() },
}));

import { dispatchQueuedRankCheckRunIntents } from "./rank-run-intent-dispatch";

describe("rank run intent dispatch", () => {
  it("launches queued runs through the shared workflow gateway", async () => {
    const launch = vi.fn(async (input: { startRun: typeof mocks.startRun }) => {
      await input.startRun({ runId: "run_1", workflowId: "rank-check-run-rcr_1" });
      return { claimed: 1, launched: 1, scanned: 1 };
    });

    await expect(dispatchQueuedRankCheckRunIntents({ launch: launch as never })).resolves.toEqual({
      claimed: 1,
      launched: 1,
      scanned: 1,
    });
    expect(mocks.startRun).toHaveBeenCalledWith({
      runId: "run_1",
      workflowId: "rank-check-run-rcr_1",
    });
  });
});
