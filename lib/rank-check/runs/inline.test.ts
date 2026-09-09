import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actualRun:
    undefined as unknown as typeof import("@/lib/temporal/rank-check-activities").runRankCheckActivity,
  createRunning: vi.fn(),
  fail: vi.fn(),
  paidProvider: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    keyword: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheck: { updateMany: vi.fn() },
    rankCheckRun: { update: vi.fn(), updateMany: vi.fn() },
    rankCheckRunItem: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  run: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/fallback", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rank-check/fallback")>(
    "@/lib/rank-check/fallback",
  );
  return { ...actual, runKeywordCheckWithFallback: mocks.paidProvider };
});
vi.mock("@/lib/temporal/rank-check-activities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/temporal/rank-check-activities")>();
  mocks.actualRun = actual.runRankCheckActivity;
  return {
    ...actual,
    createRunningRankCheckActivity: mocks.createRunning,
    failRankCheckActivity: mocks.fail,
    runRankCheckActivity: mocks.run,
  };
});

import { runInlineRankCheck, UnrunnableInlineRankCheckError } from "./inline";

const input = {
  keywordId: "keyword_1",
  providerId: "provider-a",
  runPublicId: "rcr_abcdefghijklmnopqrstuvwx",
};

function item(keyword: { archivedAt: Date | null; locationId: string }) {
  return {
    id: "run_item_1",
    keyword: { ...keyword, projectId: "project_1" },
    run: { id: "run_1", projectId: "project_1", requestedCount: 1, status: "queued" },
  };
}

describe("runInlineRankCheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.rankCheckRunItem.findFirst.mockResolvedValue(
      item({ archivedAt: null, locationId: "location_active" }),
    );
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheckRunItem.groupBy.mockResolvedValue([
      {
        _count: { _all: 1 },
        _sum: { actualCostCents: 0 },
        keywordId: "keyword_1",
        status: "cancelled",
      },
    ]);
    mocks.prisma.rankCheckRun.update.mockResolvedValue({ id: "run_1" });
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });
    mocks.createRunning.mockResolvedValue({ rankCheckId: "rank_check_1" });
    mocks.fail.mockResolvedValue(undefined);
    mocks.run.mockResolvedValue({ attempts: [], position: 3, provider: "provider-a" });
  });

  it("runs a runnable keyword through both activities unchanged", async () => {
    await expect(runInlineRankCheck(input)).resolves.toEqual({
      attempts: [],
      position: 3,
      provider: "provider-a",
    });

    expect(mocks.createRunning).toHaveBeenCalledWith({
      depth: undefined,
      keywordId: "keyword_1",
      providerId: "provider-a",
      runItemId: "run_item_1",
      scheduleId: null,
      scheduledAt: null,
      trigger: "manual",
      workflowRunId: "inline-rcr_abcdefghijklmnopqrstuvwx",
    });
    expect(mocks.run).toHaveBeenCalledWith({
      depth: undefined,
      keywordId: "keyword_1",
      providerId: "provider-a",
      rankCheckId: "rank_check_1",
      runItemId: "run_item_1",
      source: "manual",
    });
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("cancels a linked manual item when its market pauses after the inline predicate", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "none");
    const runItem = {
      actualCostCents: null as number | null,
      blockedReason: null as string | null,
      rankCheckId: null as string | null,
      status: "queued",
    };
    let marketActive = true;
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      archivedAt: null,
      locationId: "location_active",
      projectId: "project_1",
    });
    mocks.prisma.projectMarket.findMany.mockImplementation(async () =>
      marketActive ? [{ locationId: "location_active" }] : [],
    );
    mocks.createRunning.mockImplementation(async () => {
      runItem.rankCheckId = "rank_check_1";
      runItem.status = "running";
      marketActive = false;
      return { rankCheckId: "rank_check_1" };
    });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({
      id: "run_item_1",
      keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
      run: {
        id: "run_1",
        projectId: "project_1",
        publicId: "rcr_abcdefghijklmnopqrstuvwx",
        requestedCount: 1,
        status: "running",
      },
    });
    mocks.prisma.rankCheckRunItem.updateMany.mockImplementation(async ({ data, where }) => {
      if (where.rankCheckId !== runItem.rankCheckId || where.status !== runItem.status) {
        return { count: 0 };
      }
      Object.assign(runItem, data);
      return { count: 1 };
    });
    mocks.paidProvider.mockResolvedValue({
      attempts: [],
      provider: "provider-a",
      rankCheck: {
        checkedAt: new Date("2026-09-06T00:00:00.000Z"),
        costCents: 25,
        id: "rank_check_1",
        keywordId: "keyword_1",
        position: 3,
        rankingUrl: null,
      },
    });
    mocks.run.mockImplementation(mocks.actualRun);

    await expect(runInlineRankCheck(input)).rejects.toMatchObject({ message: "market_inactive" });

    expect(mocks.run).toHaveBeenCalledWith({
      depth: undefined,
      keywordId: "keyword_1",
      providerId: "provider-a",
      rankCheckId: "rank_check_1",
      runItemId: "run_item_1",
      source: "manual",
    });
    expect(runItem).toMatchObject({
      actualCostCents: 0,
      blockedReason: "market_inactive",
      status: "cancelled",
    });
    expect(mocks.paidProvider).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      message: "market_inactive",
      providerId: "provider-a",
      rankCheckId: "rank_check_1",
    });
  });

  it("refuses a keyword whose market is paused before any activity runs", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    await expect(runInlineRankCheck(input)).rejects.toMatchObject({
      name: "UnrunnableInlineRankCheckError",
      reason: "market_inactive",
    });

    expect(mocks.createRunning).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("refuses a keyword whose market row was removed before any activity runs", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_other" }]);

    await expect(runInlineRankCheck(input)).rejects.toBeInstanceOf(UnrunnableInlineRankCheckError);
    await expect(runInlineRankCheck(input)).rejects.toMatchObject({ reason: "market_inactive" });

    expect(mocks.createRunning).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("refuses an archived keyword before any activity runs", async () => {
    mocks.prisma.rankCheckRunItem.findFirst.mockResolvedValue(
      item({ archivedAt: new Date("2026-09-01T05:00:00.000Z"), locationId: "location_active" }),
    );

    await expect(runInlineRankCheck(input)).rejects.toMatchObject({
      reason: "keyword_archived",
    });

    expect(mocks.createRunning).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("cancels the run item it refuses so the keyword does not look permanently in progress", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    await expect(runInlineRankCheck(input)).rejects.toBeInstanceOf(UnrunnableInlineRankCheckError);

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actualCostCents: 0,
        blockedReason: "market_inactive",
        status: "cancelled",
      }),
      where: expect.objectContaining({ id: "run_item_1" }),
    });
    // The item was cancelled, so the run has no pending work left and must not stay queued.
    expect(mocks.prisma.rankCheckRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }),
    );
  });

  it("reads the active market registry for the run item's own project", async () => {
    await runInlineRankCheck(input);

    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  it("still refuses a run public ID that has no item for the keyword", async () => {
    mocks.prisma.rankCheckRunItem.findFirst.mockResolvedValue(null);

    await expect(runInlineRankCheck(input)).rejects.toThrow("Rank-check run item not found.");

    expect(mocks.prisma.projectMarket.findMany).not.toHaveBeenCalled();
    expect(mocks.createRunning).not.toHaveBeenCalled();
  });

  it("marks the rank check failed when the run activity throws", async () => {
    mocks.run.mockRejectedValue(new Error("provider timeout"));

    await expect(runInlineRankCheck(input)).rejects.toThrow("provider timeout");

    expect(mocks.fail).toHaveBeenCalledWith({
      keywordId: "keyword_1",
      message: "provider timeout",
      providerId: "provider-a",
      rankCheckId: "rank_check_1",
    });
  });
});
