import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from "@temporalio/common";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTemporalClient: vi.fn(),
  start: vi.fn(),
}));

vi.mock("./client", () => ({
  getTemporalClient: mocks.getTemporalClient,
  TEMPORAL_TASK_QUEUE: "rank-checks",
}));

import { startTrafficSyncWorkflow } from "./traffic-client";

describe("traffic workflow client", () => {
  it("reuses the singleton workflow instead of starting a parallel sync", async () => {
    mocks.start.mockResolvedValue({ firstExecutionRunId: "run_1", workflowId: "workflow_1" });
    mocks.getTemporalClient.mockResolvedValue({ workflow: { start: mocks.start } });

    await expect(startTrafficSyncWorkflow()).resolves.toEqual({
      runId: "run_1",
      workflowId: "workflow_1",
    });
    expect(mocks.start).toHaveBeenCalledWith(
      "syncTrafficWorkflow",
      expect.objectContaining({
        workflowId: "maintenance-traffic-sync",
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      }),
    );
  });
});
