import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeSearchInsightsBackfillStatus,
  normalizeSearchInsightsWorkflowStatus,
} from "./search-insights-status";

const mocks = vi.hoisted(() => ({
  describe: vi.fn(),
  getClient: vi.fn(),
  getHandle: vi.fn(),
  workflowId: vi.fn(),
}));

vi.mock("./scheduler-client", () => ({ getSchedulerTemporalClient: mocks.getClient }));
vi.mock("./search-insights-client", () => ({
  searchInsightsBackfillWorkflowId: mocks.workflowId,
}));

describe("search insights workflow status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workflowId.mockReturnValue("search-insights-backfill:project_1:key");
    mocks.getHandle.mockReturnValue({ describe: mocks.describe });
    mocks.getClient.mockResolvedValue({ workflow: { getHandle: mocks.getHandle } });
  });

  it.each([
    ["RUNNING", "running"],
    ["COMPLETED", "completed"],
    ["FAILED", "failed"],
    ["CANCELLED", "failed"],
    ["TERMINATED", "failed"],
    ["TIMED_OUT", "failed"],
    ["CONTINUED_AS_NEW", "unknown"],
    ["UNKNOWN", "unknown"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeSearchInsightsWorkflowStatus(input)).toBe(expected);
  });

  it("describes the deterministic property workflow", async () => {
    mocks.describe.mockResolvedValue({ status: { name: "RUNNING" } });

    await expect(
      describeSearchInsightsBackfillStatus("project_1", "sc-domain:example.com"),
    ).resolves.toBe("running");
    expect(mocks.workflowId).toHaveBeenCalledWith("project_1", "sc-domain:example.com");
    expect(mocks.getHandle).toHaveBeenCalledWith("search-insights-backfill:project_1:key");
  });

  it("fails closed to unknown when Temporal is unavailable", async () => {
    mocks.getClient.mockRejectedValue(new Error("unavailable"));

    await expect(
      describeSearchInsightsBackfillStatus("project_1", "sc-domain:example.com"),
    ).resolves.toBe("unknown");
  });
});
