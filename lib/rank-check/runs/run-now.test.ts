import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueRun: vi.fn(),
  transaction: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/rank-check/planner/skip-run-now", () => ({ runPlannedRunNow: mocks.queueRun }));

import { runRankCheckRunNowCommand } from "./run-now";

describe("runRankCheckRunNowCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueRun.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ auditLog: { create: vi.fn() } }),
    );
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  it("queues a planned run and audits the queued transition without an engine call", async () => {
    await runRankCheckRunNowCommand({
      actorId: "user_1",
      orchestrationWorkflowId: "rank-check-run-rcr_1",
      projectId: "project_1",
      publicId: "rcr_a00000000000000000000000",
      runId: "run_1",
    });

    expect(mocks.queueRun).toHaveBeenCalledWith("run_1");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rank_check_run.run_now", after: { status: "queued" } }),
      expect.anything(),
    );
  });

  it("reports a missing reserved workflow ID as a data defect", async () => {
    await expect(
      runRankCheckRunNowCommand({
        actorId: "user_1",
        orchestrationWorkflowId: null,
        projectId: "project_1",
        publicId: "rcr_a00000000000000000000000",
        runId: "run_1",
      }),
    ).rejects.toThrow("data defect");
    expect(mocks.queueRun).not.toHaveBeenCalled();
  });
});
