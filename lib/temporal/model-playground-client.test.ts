import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";
import { afterEach, expect, test, vi } from "vitest";

const start = vi.hoisted(() => vi.fn());
vi.mock("./scheduler-client", () => ({
  getSchedulerTemporalClient: async () => ({ workflow: { start } }),
}));

import { TEMPORAL_TASK_QUEUE } from "./deployment-config";
import { startModelPlaygroundWorkflow } from "./model-playground-client";

afterEach(() => start.mockReset());
const input = { projectId: "fixture-project", runId: "00000000-0000-4000-8000-000000000001" };

test("stable workflow identity deduplicates active starts and permits only failed workflow reuse", async () => {
  await startModelPlaygroundWorkflow(input);
  expect(start).toHaveBeenCalledWith("modelPlaygroundWorkflow", {
    workflowId: `model-playground:${input.runId}`,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
    taskQueue: TEMPORAL_TASK_QUEUE,
    args: [input],
  });
  start.mockRejectedValue(
    new WorkflowExecutionAlreadyStartedError("Active", input.runId, "modelPlaygroundWorkflow"),
  );
  await expect(startModelPlaygroundWorkflow(input)).resolves.toBeUndefined();
});

test("infrastructure start failure remains retryable by the persisted probe", async () => {
  start.mockRejectedValue(new Error("Synthetic unavailable"));
  await expect(startModelPlaygroundWorkflow(input)).rejects.toThrow("Synthetic unavailable");
  start.mockResolvedValue(undefined);
  await expect(startModelPlaygroundWorkflow(input)).resolves.toBeUndefined();
});
