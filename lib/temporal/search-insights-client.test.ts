import { createHash } from "node:crypto";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE,
  searchInsightsBackfillWorkflowId,
  searchInsightsSyncWorkflowId,
  startSearchInsightsBackfillWorkflow,
  startSearchInsightsSyncWorkflow,
} from "./search-insights-client";

const mocks = vi.hoisted(() => ({ findDefaults: vi.fn(), start: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { projectDefaults: { findUnique: mocks.findDefaults } },
}));
vi.mock("./client", () => ({ TEMPORAL_TASK_QUEUE: "rank-checks" }));
vi.mock("./scheduler-client", () => ({
  getSchedulerTemporalClient: vi.fn(async () => ({ workflow: { start: mocks.start } })),
}));

const property = "sc-domain:example.com";
const digest = createHash("sha256").update(property).digest("hex").slice(0, 16);

describe("search insights workflow client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDefaults.mockResolvedValue(null);
    mocks.start.mockResolvedValue({
      firstExecutionRunId: "run_1",
      workflowId: "search-insights-sync:project_1",
    });
  });

  it("keeps the customer domain out of the workflow id while staying deterministic", () => {
    const workflowId = searchInsightsBackfillWorkflowId("project_1", property);

    expect(workflowId).toBe(`search-insights-backfill:project_1:${digest}`);
    expect(workflowId).not.toContain("example.com");
    expect(searchInsightsBackfillWorkflowId("project_1", property)).toBe(workflowId);
  });

  it("starts one backfill per property and joins the running execution", async () => {
    await expect(
      startSearchInsightsBackfillWorkflow({ projectId: "project_1", property }),
    ).resolves.toEqual({ workflowId: `search-insights-backfill:project_1:${digest}` });
    expect(mocks.start).toHaveBeenCalledWith(SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE, {
      args: [{ projectId: "project_1", property, requestSetsPerHour: 42, retentionMonths: 16 }],
      taskQueue: "rank-checks",
      workflowId: `search-insights-backfill:project_1:${digest}`,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  });

  it("carries the optional source in a new sessions execution without changing its id scheme", async () => {
    await expect(
      startSearchInsightsBackfillWorkflow({
        projectId: "project_1",
        property: "123456789",
        source: "ga4",
      }),
    ).resolves.toEqual({ workflowId: searchInsightsBackfillWorkflowId("project_1", "123456789") });
    expect(mocks.start).toHaveBeenCalledWith(SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE, {
      args: [{ projectId: "project_1", property: "123456789", source: "ga4" }],
      taskQueue: "rank-checks",
      workflowId: searchInsightsBackfillWorkflowId("project_1", "123456789"),
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  });

  it("starts the same id again once the previous execution has closed", async () => {
    await startSearchInsightsBackfillWorkflow({ projectId: "project_1", property });

    await expect(
      startSearchInsightsBackfillWorkflow({ projectId: "project_1", property }),
    ).resolves.toEqual({ workflowId: `search-insights-backfill:project_1:${digest}` });
    expect(mocks.start).toHaveBeenCalledTimes(2);
    // A backfill that closed as paused (no finalized day yet, or a lost authorization) has
    // to be startable again; REJECT_DUPLICATE would refuse every later start on that id.
    const [, options] = mocks.start.mock.calls[1] ?? [];
    expect(options).toMatchObject({
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  });

  it("treats a racing start as the same import, not an error", async () => {
    mocks.start.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "exists",
        "workflow",
        SEARCH_INSIGHTS_BACKFILL_WORKFLOW_TYPE,
      ),
    );

    await expect(
      startSearchInsightsBackfillWorkflow({ projectId: "project_1", property }),
    ).resolves.toEqual({ workflowId: `search-insights-backfill:project_1:${digest}` });
  });

  it("surfaces an unexpected start failure so the caller can report it", async () => {
    mocks.start.mockRejectedValue(new Error("temporal unavailable"));

    await expect(
      startSearchInsightsBackfillWorkflow({ projectId: "project_1", property }),
    ).rejects.toThrow("temporal unavailable");
  });

  it("joins the running sync instead of queueing a second one", async () => {
    await expect(startSearchInsightsSyncWorkflow({ projectId: "project_1" })).resolves.toEqual({
      runId: "run_1",
      workflowId: "search-insights-sync:project_1",
    });
    expect(searchInsightsSyncWorkflowId("project_1")).toBe("search-insights-sync:project_1");
    expect(mocks.start).toHaveBeenCalledWith("searchInsightsSyncWorkflow", {
      args: [{ projectId: "project_1" }],
      taskQueue: "rank-checks",
      workflowId: "search-insights-sync:project_1",
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  });
});
