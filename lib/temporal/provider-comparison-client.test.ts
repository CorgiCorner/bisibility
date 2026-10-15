import { WorkflowIdReusePolicy } from "@temporalio/client";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("./client", () => ({
  getTemporalClient: async () => ({ workflow: { start: mocks.start } }),
}));

import { startProviderComparisonWorkflow } from "./provider-comparison-client";

beforeEach(() => vi.clearAllMocks());
it("only failed workflow executions can restart, retaining the original side claim owner", async () => {
  await startProviderComparisonWorkflow("project", "request-uuid");
  expect(mocks.start).toHaveBeenCalledWith(
    "providerComparisonWorkflow",
    expect.objectContaining({
      workflowId: "provider-comparison:request-uuid",
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      args: [{ projectId: "project", runId: "request-uuid" }],
    }),
  );
});
it("propagates uncertain submission to the durable-outbox caller instead of dispatching twice", async () => {
  mocks.start.mockRejectedValue(new Error("network lost"));
  await expect(startProviderComparisonWorkflow("project", "request-uuid")).rejects.toThrow(
    "network lost",
  );
  expect(mocks.start).toHaveBeenCalledOnce();
});
