import { describe, expect, it, vi } from "vitest";
import { cancelUnrunnableRankCheckRunItem, cancelUnrunnableRunItem } from "./cancel";

const mocks = vi.hoisted(() => ({ writeAudit: vi.fn() }));

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));

const now = new Date("2026-09-04T10:00:00.000Z");
const run = { id: "run_1", projectId: "project_1", requestedCount: 2, status: "running" };

type Item = { id: string; rankCheckId: string | null; status: string };
type PaidItem = Item & { actualCostCents: number | null; blockedReason: string | null };
type RankCheck = { attemptCount: number; estimatedCostCents: number | null; status: string };
type RankCheckWhere = { attemptCount?: number; status: string };
type ItemWhere = {
  OR?: Array<{ rankCheckId?: null; status: string }>;
  id?: string;
  rankCheckId?: string;
  status?: string;
};

/** Mirrors the Postgres semantics of the cancellable-item predicate. */
function matchesCancellable(item: Item, where: ItemWhere) {
  if (where.id && where.id !== item.id) return false;
  if (where.rankCheckId && where.rankCheckId !== item.rankCheckId) return false;
  if (where.status && where.status !== item.status) return false;
  // An absent OR is Prisma's "match by id alone", which is what dropping the guard would do.
  if (!where.OR) return true;
  return where.OR.some(
    (clause) =>
      clause.status === item.status &&
      (clause.rankCheckId === undefined || item.rankCheckId === null),
  );
}

function transaction(item: Item) {
  return {
    rankCheck: { updateMany: vi.fn(async () => ({ count: 1 })) },
    rankCheckRun: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    rankCheckRunItem: {
      findUnique: vi.fn(async () => ({
        id: "item_1",
        keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
        run: {
          id: "run_1",
          projectId: "project_1",
          publicId: "rcr_abcdefghijklmnopqrstuvwx",
          requestedCount: 2,
          status: "running",
        },
      })),
      groupBy: vi.fn(async () => [
        { _count: { _all: 1 }, _sum: { actualCostCents: null }, keywordId: "k", status: "queued" },
      ]),
      updateMany: vi.fn(async ({ where }: { where: ItemWhere }) => ({
        count: matchesCancellable(item, where) ? 1 : 0,
      })),
    },
  };
}

function paidTransaction(item: PaidItem, rankCheck: RankCheck) {
  const tx = {
    rankCheck: {
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: RankCheckWhere }) => {
          if (where.attemptCount !== undefined && where.attemptCount !== rankCheck.attemptCount) {
            return { count: 0 };
          }
          if (where.status !== rankCheck.status) return { count: 0 };
          Object.assign(rankCheck, data);
          return { count: 1 };
        },
      ),
    },
    rankCheckRun: { update: vi.fn(async () => ({})) },
    rankCheckRunItem: {
      findUnique: vi.fn(async () => ({
        id: "item_1",
        keyword: { publicId: "kw_abcdefghijklmnopqrstuvwx" },
        run: {
          id: "run_1",
          projectId: "project_1",
          publicId: "rcr_abcdefghijklmnopqrstuvwx",
          requestedCount: 2,
          status: "running",
        },
      })),
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: ItemWhere }) => {
          if (!matchesCancellable(item, where)) return { count: 0 };
          Object.assign(item, data);
          return { count: 1 };
        },
      ),
    },
  };
  return tx;
}

describe("cancelUnrunnableRunItem", () => {
  it("cancels a queued item with a named reason and a zero cost", async () => {
    const tx = transaction({ id: "item_1", rankCheckId: null, status: "queued" });

    await expect(
      cancelUnrunnableRunItem(tx as never, {
        itemId: "item_1",
        now,
        reason: "market_inactive",
        run,
      }),
    ).resolves.toBe(true);

    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: {
        actualCostCents: 0,
        blockedReason: "market_inactive",
        claimExpiresAt: null,
        finishedAt: now,
        status: "cancelled",
      },
      where: {
        OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
        id: "item_1",
      },
    });
    expect(tx.rankCheckRun.update).toHaveBeenCalledWith({
      data: { cancelledCount: { increment: 1 } },
      where: { id: "run_1" },
    });
  });

  it("cancels a claimed item that never linked a check", async () => {
    const tx = transaction({ id: "item_1", rankCheckId: null, status: "running" });

    await expect(
      cancelUnrunnableRunItem(tx as never, {
        itemId: "item_1",
        now,
        reason: "keyword_archived",
        run,
      }),
    ).resolves.toBe(true);
  });

  it("refuses to cancel a check that is already in flight, so it stays billable", async () => {
    const tx = transaction({ id: "item_1", rankCheckId: "check_1", status: "running" });

    await expect(
      cancelUnrunnableRunItem(tx as never, {
        itemId: "item_1",
        now,
        reason: "market_inactive",
        run,
      }),
    ).resolves.toBe(false);

    expect(tx.rankCheckRun.update).not.toHaveBeenCalled();
    expect(tx.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });

  it("cancels a linked item with the runnable reason before a paid call", async () => {
    const tx = transaction({ id: "item_1", rankCheckId: "check_1", status: "running" });

    await expect(
      cancelUnrunnableRankCheckRunItem(tx as never, {
        rankCheckId: "check_1",
        reason: "market_inactive",
      }),
    ).resolves.toBe(true);

    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: {
        actualCostCents: 0,
        blockedReason: "market_inactive",
        claimExpiresAt: null,
        finishedAt: expect.any(Date),
        status: "cancelled",
      },
      where: { rankCheckId: "check_1", status: "running" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.item_cancelled",
        after: {
          itemId: "item_1",
          keywordId: "kw_abcdefghijklmnopqrstuvwx",
          reason: "market_inactive",
        },
      }),
      tx,
    );
  });

  it("leaves a completed paid item unchanged across cancellation retries", async () => {
    const item: PaidItem = {
      actualCostCents: 25,
      blockedReason: null,
      id: "item_1",
      rankCheckId: "check_1",
      status: "completed",
    };
    const rankCheck: RankCheck = {
      attemptCount: 1,
      estimatedCostCents: 25,
      status: "running",
    };
    const tx = paidTransaction(item, rankCheck);
    mocks.writeAudit.mockClear();

    await expect(
      cancelUnrunnableRankCheckRunItem(tx as never, {
        rankCheckId: "check_1",
        reason: "market_inactive",
      }),
    ).resolves.toBe(false);
    await expect(
      cancelUnrunnableRankCheckRunItem(tx as never, {
        rankCheckId: "check_1",
        reason: "market_inactive",
      }),
    ).resolves.toBe(false);

    expect(item).toEqual({
      actualCostCents: 25,
      blockedReason: null,
      id: "item_1",
      rankCheckId: "check_1",
      status: "completed",
    });
    expect(rankCheck).toEqual({ attemptCount: 1, estimatedCostCents: 25, status: "running" });
    expect(tx.rankCheckRun.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
