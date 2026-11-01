import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actualRun:
    undefined as unknown as typeof import("@/lib/temporal/rank-check-activities").runRankCheckActivity,
  createRunning: vi.fn(),
  fail: vi.fn(),
  discard: vi.fn(),
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
    discardRankCheckActivity: mocks.discard,
    runRankCheckActivity: mocks.run,
  };
});

import { ApplicationFailure } from "@temporalio/common";
import { runInlineRankCheck } from "./inline";

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

  it.each(["provider_account_blocked", "usage_unconfirmed"])(
    "closes an inline %s refusal as deferred",
    async (reason) => {
      mocks.run.mockRejectedValue(
        ApplicationFailure.create({ message: reason, type: reason, nonRetryable: true }),
      );
      await expect(runInlineRankCheck(input)).rejects.toMatchObject({ type: reason });
      expect(mocks.discard).toHaveBeenCalledWith({ rankCheckId: "rank_check_1", reason });
      expect(mocks.fail).not.toHaveBeenCalled();
    },
  );
});
