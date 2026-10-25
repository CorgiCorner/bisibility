import { beforeEach, expect, it, vi } from "vitest";
import { providerRecoveryWorkflowStop } from "./provider-recovery-probe";

const first = "11111111-1111-1111-1111-111111111111";
const next = "22222222-2222-2222-2222-222222222222";
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  list: vi.fn(),
  handle: vi.fn(),
  history: vi.fn(),
  describe: vi.fn(),
}));
vi.mock("../db/prisma", () => ({ prisma: { rankCheck: { findUnique: mocks.check } } }));
vi.mock("./scheduler-client", () => ({
  getSchedulerTemporalClient: async () => ({
    workflow: { list: mocks.list, getHandle: mocks.handle },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue({ workflowRunId: first });
  mocks.list.mockImplementation(async function* () {
    yield { workflowId: "original-workflow", runId: first, status: { name: "CONTINUED_AS_NEW" } };
  });
  mocks.history.mockResolvedValue({
    events: [{ workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId: next } }],
  });
  mocks.handle.mockReturnValue({ fetchHistory: mocks.history, describe: mocks.describe });
});
it.each(["COMPLETED", "FAILED", "CANCELED", "RUNNING"])(
  "RE-3 follows the original Continue-As-New chain to %s without following reused workflow IDs",
  async (status) => {
    mocks.describe.mockResolvedValue({
      workflowId: "original-workflow",
      runId: next,
      status: { name: status },
    });
    const expected = {
      COMPLETED: "workflow_completed",
      FAILED: "workflow_failed",
      CANCELED: "workflow_cancelled",
      RUNNING: null,
    }[status];
    expect(await providerRecoveryWorkflowStop("check")).toBe(expected);
    expect(mocks.handle.mock.calls).toEqual([
      ["original-workflow", first],
      ["original-workflow", next],
    ]);
  },
);
it("RE-3 refuses a missing continuation, cycle or contradictory successor", async () => {
  mocks.history.mockResolvedValue({ events: [] });
  expect(await providerRecoveryWorkflowStop("check")).toBeNull();
  mocks.history.mockResolvedValue({
    events: [{ workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId: first } }],
  });
  expect(await providerRecoveryWorkflowStop("check")).toBeNull();
  mocks.history.mockResolvedValue({
    events: [{ workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId: next } }],
  });
  mocks.describe.mockResolvedValue({
    workflowId: "reused-workflow",
    runId: next,
    status: { name: "COMPLETED" },
  });
  expect(await providerRecoveryWorkflowStop("check")).toBeNull();
});
