import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelChild: vi.fn(),
  cancelBatch: vi.fn(),
  cancelParent: vi.fn(),
  cancelRun: vi.fn(),
  closeCheck: vi.fn(),
  getHandle: vi.fn(),
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  skipRun: vi.fn(),
  tx: {
    rankCheckRun: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  transaction: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("./cancel", () => ({
  cancelRankCheckRun: mocks.cancelRun,
  closeRankCheckAsCancelled: mocks.closeCheck,
}));
vi.mock("@/lib/rank-check/planner/skip-run-now", () => ({
  skipPlannedRun: mocks.skipRun,
}));
vi.mock("@/lib/temporal/client", () => ({
  runItemRankCheckWorkflowId: (keywordId: string, itemId: string) =>
    `rank-check-${keywordId}-run-${itemId}`,
}));
vi.mock("@/lib/temporal/scheduler-client", () => ({
  getSchedulerTemporalClient: vi.fn(async () => ({ workflow: { getHandle: mocks.getHandle } })),
}));

import {
  cancelRankCheckRunCommand,
  deleteRankCheckRunCommand,
  skipRankCheckRunCommand,
} from "./cancel-run";

const publicId = "rcr_a00000000000000000000000";

describe("rank-check run commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.cancelRun.mockResolvedValue(true);
    mocks.closeCheck.mockResolvedValue(true);
    mocks.skipRun.mockResolvedValue(true);
    mocks.writeAudit.mockResolvedValue(undefined);
    mocks.cancelParent.mockResolvedValue(undefined);
    mocks.cancelChild.mockResolvedValue(undefined);
    mocks.cancelBatch.mockResolvedValue(undefined);
    mocks.getHandle.mockImplementation((workflowId: string) => ({
      cancel:
        workflowId === "rank-check-run-parent"
          ? mocks.cancelParent
          : workflowId === "queued-rank-check-project-location-desktop-1-0"
            ? mocks.cancelBatch
            : mocks.cancelChild,
    }));
    mocks.tx.rankCheckRun.findFirst.mockResolvedValue({
      id: "run_1",
      checkSchedule: { name: "Daily 06:00" },
      items: [
        { id: "item_1", keywordId: "keyword_1", rankCheckId: "check_1" },
        { id: "item_2", keywordId: "keyword_2", rankCheckId: "check_2" },
      ],
      orchestrationWorkflowId: "rank-check-run-parent",
      plannedFor: new Date("2026-09-05T06:00:00.000Z"),
      publicId,
      queuedRankCheckBatches: [{ id: "queued-rank-check-project-location-desktop-1-0" }],
      status: "running",
    });
  });

  it("commits cancellation and audit before cancelling the parent and every running child", async () => {
    await cancelRankCheckRunCommand({ actorId: "user_1", projectId: "project_1", publicId });

    expect(mocks.cancelRun).toHaveBeenCalledWith(mocks.tx, "run_1");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rank_check_run.cancel" }),
      mocks.tx,
    );
    expect(mocks.getHandle).toHaveBeenCalledWith("rank-check-run-parent");
    expect(mocks.getHandle).toHaveBeenCalledWith("queued-rank-check-project-location-desktop-1-0");
    expect(mocks.getHandle).toHaveBeenCalledWith("rank-check-keyword_1-run-item_1");
    expect(mocks.getHandle).toHaveBeenCalledWith("rank-check-keyword_2-run-item_2");
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(mocks.cancelParent.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.transaction.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.cancelBatch).toHaveBeenCalledOnce();
    expect(mocks.closeCheck).toHaveBeenCalledWith(mocks.tx, "check_1");
    expect(mocks.closeCheck).toHaveBeenCalledWith(mocks.tx, "check_2");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
  });

  it("logs a Temporal failure and still closes running database work", async () => {
    const error = new Error("Temporal unavailable");
    mocks.cancelParent.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      cancelRankCheckRunCommand({ actorId: "user_1", projectId: "project_1", publicId }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith("[rank-check-runs] Temporal cancellation failed.", error);
    expect(mocks.closeCheck).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("skips only through the planner helper and writes audit in the same transaction", async () => {
    await skipRankCheckRunCommand({
      actorId: "user_1",
      projectId: "project_1",
      publicId,
      runId: "run_1",
    });

    expect(mocks.skipRun).toHaveBeenCalledWith(mocks.tx, "run_1");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.skip",
        actorId: "user_1",
        after: {
          plannedFor: "2026-09-05T06:00:00.000Z",
          publicId,
          schedule: "Daily 06:00",
          status: "cancelled",
        },
        targetId: publicId,
      }),
      mocks.tx,
    );
  });

  it("returns conflicts when planner claims fail", async () => {
    mocks.skipRun.mockResolvedValueOnce(false);
    await expect(
      skipRankCheckRunCommand({
        actorId: "user_1",
        projectId: "project_1",
        publicId,
        runId: "run_1",
      }),
    ).rejects.toThrow("Only planned runs");
  });
});

describe("deleteRankCheckRunCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.rankCheckRun.findFirst.mockResolvedValue({ id: "run_1", status: "completed" });
    mocks.tx.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
  });
  it("scopes deletion to the project and terminal states, and audits it", async () => {
    await deleteRankCheckRunCommand({ actorId: "user_1", projectId: "project_1", publicId });
    expect(mocks.tx.rankCheckRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", publicId } }),
    );
    expect(mocks.tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date) },
      where: {
        id: "run_1",
        projectId: "project_1",
        deletedAt: null,
        status: { in: ["completed", "cancelled"] },
      },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rank_check_run.delete", targetId: publicId }),
      mocks.tx,
    );
  });
  it("rejects an active run or a concurrent status change without writing an audit", async () => {
    mocks.tx.rankCheckRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      deleteRankCheckRunCommand({ actorId: "user_1", projectId: "project_1", publicId }),
    ).rejects.toThrow("Only completed or cancelled");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("does not delete a run outside the project", async () => {
    mocks.tx.rankCheckRun.findFirst.mockResolvedValue(null);
    await expect(
      deleteRankCheckRunCommand({ actorId: "user_1", projectId: "project_1", publicId }),
    ).rejects.toThrow("not found");
    expect(mocks.tx.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });
});
