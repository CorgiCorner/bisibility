import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { rankCheckRun: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));

import { launchQueuedRankCheckRuns } from "./queued-launch";
import { runPlannedRunNow, skipPlannedRun } from "./skip-run-now";

describe("skip planned run", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels one thin occurrence without deleting its identity", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    const tx = {
      rankCheckRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await expect(skipPlannedRun(tx as never, "run_1", now)).resolves.toBe(true);

    expect(tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: { finishedAt: now, status: "cancelled" },
      where: { id: "run_1", status: "planned" },
    });
  });

  it("is a no-op after the occurrence leaves planned", async () => {
    const tx = {
      rankCheckRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };

    await expect(skipPlannedRun(tx as never, "run_1")).resolves.toBe(false);
  });

  it("queues a planned occurrence for the worker without starting its workflow", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(runPlannedRunNow("run_1", now)).resolves.toBe(true);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: { plannedFor: now, status: "queued" },
      where: { id: "run_1", status: "planned" },
    });
  });

  it("starts a run-now occurrence from the next worker sweep", async () => {
    const now = new Date("2026-09-02T08:00:00.000Z");
    let claimedAt: Date | null = null;
    let status = "planned";
    mocks.updateMany.mockImplementation(async ({ data, where }) => {
      if (where.status !== status || ("claimedAt" in where && where.claimedAt !== claimedAt)) {
        return { count: 0 };
      }
      claimedAt = data.claimedAt ?? claimedAt;
      status = data.status ?? status;
      return { count: 1 };
    });
    mocks.findMany.mockImplementation(async () =>
      status === "queued" && claimedAt === null
        ? [{ id: "run_1", orchestrationWorkflowId: "rank-check-run-rcr_1" }]
        : [],
    );
    const startRun = vi.fn().mockResolvedValue({ alreadyExists: false });

    await expect(runPlannedRunNow("run_1", now)).resolves.toBe(true);
    await expect(launchQueuedRankCheckRuns({ now, startRun })).resolves.toEqual({
      claimed: 1,
      launched: 1,
      scanned: 1,
    });

    expect(claimedAt).toBe(now);
    expect(status).toBe("queued");
    expect(startRun).toHaveBeenCalledWith({ runId: "run_1", workflowId: "rank-check-run-rcr_1" });
  });
});
