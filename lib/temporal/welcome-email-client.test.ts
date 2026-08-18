import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startWelcomeFollowupWorkflow,
  WELCOME_FOLLOWUP_WORKFLOW_TYPE,
  welcomeFollowupWorkflowId,
} from "./welcome-email-client";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock("./client", () => ({ TEMPORAL_TASK_QUEUE: "rank-checks" }));
vi.mock("./scheduler-client", () => ({
  getSchedulerTemporalClient: vi.fn(async () => ({ workflow: { start: mocks.start } })),
}));

describe("welcome follow-up workflow client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ firstExecutionRunId: "run_1", workflowId: "welcome-user_1" });
  });

  it("uses a stable rejected-duplicate workflow identity", async () => {
    await startWelcomeFollowupWorkflow("user_1");

    expect(welcomeFollowupWorkflowId("user_1")).toBe("welcome-followup-user_1");
    expect(mocks.start).toHaveBeenCalledWith(WELCOME_FOLLOWUP_WORKFLOW_TYPE, {
      args: [{ userId: "user_1" }],
      taskQueue: "rank-checks",
      workflowId: "welcome-followup-user_1",
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  });

  it("treats a duplicate start as success", async () => {
    mocks.start.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "exists",
        "workflow",
        WELCOME_FOLLOWUP_WORKFLOW_TYPE,
      ),
    );

    await expect(startWelcomeFollowupWorkflow("user_1")).resolves.toBeUndefined();
  });
});
