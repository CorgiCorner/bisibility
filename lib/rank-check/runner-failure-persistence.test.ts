import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistFailedRankCheck,
  persistFailedRankCheckInTransaction,
} from "./runner-failure-persistence";

const mocks = vi.hoisted(() => ({
  notifyRankCheckFailed: vi.fn(() => Promise.resolve()),
  prisma: {
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    observationItem: { createMany: vi.fn() },
    observationRun: { create: vi.fn() },
    providerCostEntry: { createMany: vi.fn() },
    rankCheck: { create: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckFailed: mocks.notifyRankCheckFailed,
}));

const checkedAt = new Date("2026-01-01T06:00:00.000Z");
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const RANK_CHECK_PUBLIC_ID = "check_abcdefghijklmnopqrstuvwx";

function transaction() {
  return {
    auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
    observationItem: { createMany: vi.fn() },
    observationRun: { create: vi.fn() },
    providerCostEntry: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    rankCheck: {
      create: vi.fn(({ data }) =>
        Promise.resolve({ id: "rank_failed_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
      ),
      findUniqueOrThrow: vi.fn(({ where }) =>
        Promise.resolve({ id: where.id, publicId: RANK_CHECK_PUBLIC_ID, trigger: null }),
      ),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
  };
}

const failureTarget = {
  error: "Provider request failed.",
  keywordId: "keyword_1",
  keywordPublicId: KEYWORD_PUBLIC_ID,
  projectId: "project_1",
  provider: "example-provider",
  checkedAt,
};

describe("failed rank-check persistence", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes the failed check without an observation run", async () => {
    const tx = transaction();

    const persisted = await persistFailedRankCheckInTransaction(tx as never, failureTarget);

    expect(persisted.id).toBe("rank_failed_1");
    expect(tx.rankCheck.create).toHaveBeenCalledOnce();
    expect(tx.observationRun.create).not.toHaveBeenCalled();
    expect(tx.observationItem.createMany).not.toHaveBeenCalled();
  });

  it("writes no observation on the running-check failure path", async () => {
    const tx = transaction();

    await persistFailedRankCheckInTransaction(tx as never, {
      ...failureTarget,
      existingRankCheckId: "rank_running_1",
    });

    expect(tx.rankCheck.create).not.toHaveBeenCalled();
    expect(tx.observationRun.create).not.toHaveBeenCalled();
  });

  it("writes no observation through the transactional entry point", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await persistFailedRankCheck(failureTarget);

    expect(tx.observationRun.create).not.toHaveBeenCalled();
    expect(tx.observationItem.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.observationRun.create).not.toHaveBeenCalled();
  });
});
