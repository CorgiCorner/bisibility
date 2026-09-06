import { describe, expect, it, vi } from "vitest";
import { claimQueuedRankCheckRun, launchQueuedRankCheckRuns } from "./queued-launch";

describe("queued rank-check run launcher", () => {
  it("starts one workflow when two racing database CAS operations claim one queued run", async () => {
    let claimedAt: Date | null = null;
    const status = "queued";
    let arrivals = 0;
    let releaseRace: () => void = () => undefined;
    const race = new Promise<void>((resolve) => {
      releaseRace = resolve;
    });
    const updateMany = vi.fn(async ({ data, where }) => {
      arrivals += 1;
      if (arrivals === 2) releaseRace();
      await race;
      if (where.claimedAt !== claimedAt || where.status !== status) return { count: 0 };
      claimedAt = data.claimedAt;
      return { count: 1 };
    });
    const startRun = vi.fn().mockResolvedValue({ alreadyExists: false });
    const client = { rankCheckRun: { updateMany } };
    const input = {
      now: new Date("2026-09-02T08:00:00.000Z"),
      runId: "run_1",
      startRun,
      workflowId: "rank-check-run-rcr_1",
    };

    const results = await Promise.all([
      claimQueuedRankCheckRun(input, client as never),
      claimQueuedRankCheckRun(input, client as never),
    ]);

    expect(results.map((result) => result.claimed).sort()).toEqual([false, true]);
    expect(claimedAt).toBe(input.now);
    expect(status).toBe("queued");
    expect(startRun).toHaveBeenCalledOnce();
    expect(startRun).toHaveBeenCalledWith({ runId: "run_1", workflowId: "rank-check-run-rcr_1" });
    expect(updateMany).toHaveBeenCalledWith({
      data: { claimedAt: input.now },
      where: {
        claimedAt: null,
        id: "run_1",
        orchestrationWorkflowId: "rank-check-run-rcr_1",
        status: "queued",
      },
    });
  });

  it("reconciles an already-existing reserved workflow without another start", async () => {
    const startRun = vi.fn().mockResolvedValue({ alreadyExists: true });
    const client = {
      rankCheckRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      claimQueuedRankCheckRun(
        {
          now: new Date("2026-09-02T08:00:00.000Z"),
          runId: "run_1",
          startRun,
          workflowId: "rank-check-run-rcr_1",
        },
        client as never,
      ),
    ).resolves.toEqual({ claimed: true, launched: false, runId: "run_1" });
  });

  it("claims every reserved queued run selected by a worker sweep", async () => {
    const startRun = vi.fn().mockResolvedValue({ alreadyExists: false });
    const client = {
      rankCheckRun: {
        findMany: vi.fn().mockResolvedValue([
          { id: "run_1", orchestrationWorkflowId: "rank-check-run-rcr_1" },
          { id: "run_2", orchestrationWorkflowId: "rank-check-run-rcr_2" },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      launchQueuedRankCheckRuns(
        { now: new Date("2026-09-02T08:00:00.000Z"), startRun },
        client as never,
      ),
    ).resolves.toEqual({ claimed: 2, launched: 2, scanned: 2 });
    expect(client.rankCheckRun.findMany).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: { id: true, orchestrationWorkflowId: true },
      take: 100,
      where: { claimedAt: null, orchestrationWorkflowId: { not: null }, status: "queued" },
    });
  });
});
