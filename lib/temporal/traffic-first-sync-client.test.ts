import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock("./client", () => ({ TEMPORAL_TASK_QUEUE: "rank-checks" }));
vi.mock("./scheduler-client", () => ({
  getSchedulerTemporalClient: vi.fn(async () => ({ workflow: { start: mocks.start } })),
}));

import {
  firstTrafficSyncWorkflowId,
  startFirstTrafficSyncWorkflow,
} from "./traffic-first-sync-client";

const claim = {
  firstSyncRequestedAt: new Date("2026-09-04T10:00:00.000Z"),
  firstSyncStartedAt: new Date("2026-09-04T10:00:01.000Z"),
  id: "connection_1",
  projectId: "project_1",
  reclaimed: false,
};

describe("first traffic sync workflow client", () => {
  it("starts a workflow for the exact CAS claim", async () => {
    mocks.start.mockResolvedValue({
      firstExecutionRunId: "run_1",
      workflowId: firstTrafficSyncWorkflowId(claim),
    });

    await expect(startFirstTrafficSyncWorkflow(claim)).resolves.toEqual({
      runId: "run_1",
      workflowId: firstTrafficSyncWorkflowId(claim),
    });

    expect(mocks.start).toHaveBeenCalledWith(
      "syncFirstTrafficWorkflow",
      expect.objectContaining({
        args: [
          {
            connectionId: claim.id,
            firstSyncRequestedAt: claim.firstSyncRequestedAt.toISOString(),
            firstSyncStartedAt: claim.firstSyncStartedAt.toISOString(),
            projectId: claim.projectId,
            reclaimed: false,
          },
        ],
        taskQueue: "rank-checks",
        workflowId: firstTrafficSyncWorkflowId(claim),
      }),
    );
  });
});
