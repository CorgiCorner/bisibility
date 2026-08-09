import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueFirstChecks } from "./rankCheck";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    keywordSchedule: { createMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  runKeywordCheckWithFallback: vi.fn(),
  startRankCheckWorkflow: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/fallback", () => ({
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/temporal/client", () => ({
  manualRankCheckWorkflowId: vi.fn((keywordId: string) => `rank-check-${keywordId}-manual`),
  rankCheckSearchAttributes: vi.fn(),
  startRankCheckWorkflow: mocks.startRankCheckWorkflow,
}));

function resetMocks() {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
  );
  mocks.prisma.keyword.findMany.mockReset();
  mocks.prisma.keywordSchedule.createMany.mockReset();
  mocks.prisma.keywordSchedule.updateMany.mockReset();
  mocks.prisma.project.findFirst.mockReset();
  mocks.prisma.projectDefaults.findUnique.mockReset();
  mocks.prisma.providerConnection.count.mockReset();
}

function defaultProject() {
  return {
    domain: "example.com",
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_a00000000000000000000000",
    writeMode: "active",
    writeModeChangedAt: null,
    writeModeChangedById: null,
  };
}

function defaultSchedule(frequency = "daily") {
  return {
    cronExpression: null,
    frequency,
    jitterMinutes: 60,
    lastCheckedAt: null,
    timezone: "UTC",
  };
}

describe("queueFirstChecks", () => {
  beforeEach(() => {
    resetMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue(defaultProject());
    mocks.prisma.providerConnection.count.mockResolvedValue(1);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(defaultSchedule());
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([{ id: "keyword_scheduled" }])
      .mockResolvedValueOnce([{ id: "keyword_inherited_1" }, { id: "keyword_inherited_2" }]);
    mocks.prisma.keywordSchedule.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.keywordSchedule.createMany.mockResolvedValue({ count: 2 });
  });

  it("marks eligible project keywords due now and returns the queued count", async () => {
    const result = await queueFirstChecks({ projectId: "prj_a00000000000000000000000" });

    expect(result).toEqual({ queued: 3 });
    expect(mocks.prisma.keywordSchedule.updateMany).toHaveBeenCalledWith({
      data: { nextCheckAt: expect.any(Date) },
      where: { keywordId: { in: ["keyword_scheduled"] } },
    });
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ frequency: "daily", keywordId: "keyword_inherited_1" }),
        expect.objectContaining({ frequency: "daily", keywordId: "keyword_inherited_2" }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.queue_first",
        after: { queued: 3 },
        projectId: "project_1",
        targetId: "prj_a00000000000000000000000",
      }),
    );
    expect(mocks.startRankCheckWorkflow).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it("refuses to queue the first checks until the workspace has a domain", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({ ...defaultProject(), domain: null });

    await expect(queueFirstChecks({ projectId: "prj_a00000000000000000000000" })).rejects.toThrow(
      /Settings > Project details/,
    );
    expect(mocks.prisma.keywordSchedule.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keywordSchedule.createMany).not.toHaveBeenCalled();
  });

  it("skips paused and manual effective schedules", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValueOnce(defaultSchedule("manual"));
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]);

    const result = await queueFirstChecks({ projectId: "prj_a00000000000000000000000" });

    expect(result).toEqual({ queued: 0 });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schedule: {
            is: {
              frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
            },
          },
        }),
      }),
    );
    expect(mocks.prisma.keywordSchedule.createMany).not.toHaveBeenCalled();
  });

  it("returns a typed no-provider reason without queueing schedules", async () => {
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(0);

    const result = await queueFirstChecks({ projectId: "prj_a00000000000000000000000" });

    expect(result).toEqual({ queued: 0, reason: "no_provider" });
    expect(mocks.prisma.projectDefaults.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.keywordSchedule.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keywordSchedule.createMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check.queue_first",
        after: { queued: 0, reason: "no_provider" },
      }),
    );
  });

  it("leaves schedule reconciliation to the worker", async () => {
    await queueFirstChecks({ projectId: "prj_a00000000000000000000000" });

    expect(mocks.prisma.keywordSchedule.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledTimes(1);
  });

  it("excludes previewed keyword ids from immediate queueing", async () => {
    await queueFirstChecks({
      excludeKeywordIds: ["kw_d00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          publicId: { notIn: ["kw_d00000000000000000000000"] },
        }),
      }),
    );
    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          publicId: { notIn: ["kw_d00000000000000000000000"] },
        }),
      }),
    );
  });
});
