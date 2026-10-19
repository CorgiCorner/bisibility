import { EngineOwnedByWorkerError, SchedulerDisabledError } from "@/lib/scheduler/driver";
import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), start: vi.fn() }));
vi.mock("./client", () => ({ getTemporalClient: mocks.getClient }));

import { startProviderComparisonWorkflow } from "./provider-comparison-client";

beforeEach(() => {
  vi.stubEnv("SCHEDULER_DRIVER", "temporal");
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.getClient.mockReset().mockResolvedValue({ workflow: { start: mocks.start } });
});
afterEach(() => vi.unstubAllEnvs());

it("only failed workflow executions can restart, retaining the original side claim owner", async () => {
  await startProviderComparisonWorkflow("project", "request-uuid");
  expect(mocks.getClient).toHaveBeenCalledOnce();
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
    "providerComparisonWorkflow",
    expect.objectContaining({
      workflowId: "provider-comparison:request-uuid",
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
      args: [{ projectId: "project", runId: "request-uuid" }],
    }),
  );
});

it.each([
  ["none", SchedulerDisabledError],
  ["worker", EngineOwnedByWorkerError],
] as const)(
  "refuses the %s driver before requesting a Temporal client",
  async (driver, ErrorType) => {
    vi.stubEnv("SCHEDULER_DRIVER", driver);
    await expect(startProviderComparisonWorkflow("project", "request-uuid")).rejects.toBeInstanceOf(
      ErrorType,
    );
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  },
);

it("preserves legacy-auto dispatch when no driver is configured", async () => {
  vi.stubEnv("SCHEDULER_DRIVER", undefined);
  await startProviderComparisonWorkflow("project", "request-uuid");
  expect(mocks.getClient).toHaveBeenCalledOnce();
  expect(mocks.start).toHaveBeenCalledOnce();
});

it("contains only a confirmed already-started workflow", async () => {
  mocks.start.mockRejectedValueOnce(
    new WorkflowExecutionAlreadyStartedError(
      "already started",
      "provider-comparison:request-uuid",
      "providerComparisonWorkflow",
    ),
  );
  await expect(startProviderComparisonWorkflow("project", "request-uuid")).resolves.toBeUndefined();
  expect(mocks.start).toHaveBeenCalledOnce();
});

it("propagates uncertain submission to the durable-outbox caller instead of dispatching twice", async () => {
  const failure = new Error("network lost");
  mocks.start.mockRejectedValueOnce(failure);
  await expect(startProviderComparisonWorkflow("project", "request-uuid")).rejects.toBe(failure);
  expect(mocks.start).toHaveBeenCalledOnce();
});

it("preserves client acquisition failures without starting a workflow", async () => {
  const failure = new Error("connection unavailable");
  mocks.getClient.mockRejectedValueOnce(failure);
  await expect(startProviderComparisonWorkflow("project", "request-uuid")).rejects.toBe(failure);
  expect(mocks.getClient).toHaveBeenCalledOnce();
  expect(mocks.start).not.toHaveBeenCalled();
});
