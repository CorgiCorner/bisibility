import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRankCheckRawRetentionDays,
  purgeRankCheckRawPayloads,
  RANK_CHECK_RAW_PURGE_BATCH_SIZE,
  RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
} from "./raw-retention";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    rankCheckRawPurgeProgress: {
      findUnique: vi.fn(),
    },
  },
  transaction: {
    $executeRaw: vi.fn(),
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("rank-check raw payload retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEPLOYMENT_MODE", "self-host");
    vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", "");
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
    mocks.prisma.rankCheckRawPurgeProgress.findUnique.mockResolvedValue(null);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps self-host unlimited without an override and fixes cloud at 90 days", () => {
    expect(getRankCheckRawRetentionDays()).toBeNull();

    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    for (const value of ["", "unlimited", "120", "not-a-retention-window"]) {
      vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", value);
      expect(getRankCheckRawRetentionDays()).toBe(90);
    }
  });

  it("accepts a bounded override or an explicit unlimited value", () => {
    vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", "120");
    expect(getRankCheckRawRetentionDays()).toBe(120);

    vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", "UNLIMITED");
    expect(getRankCheckRawRetentionDays()).toBeNull();
  });

  it("rejects retention windows outside the supported range", () => {
    vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", "0");
    expect(() => getRankCheckRawRetentionDays()).toThrow();

    vi.stubEnv("RANK_CHECK_RAW_RETENTION_DAYS", "3651");
    expect(() => getRankCheckRawRetentionDays()).toThrow();
  });

  it("is a cheap no-op when retention is unlimited", async () => {
    await expect(
      purgeRankCheckRawPayloads({ now: new Date("2026-07-28T00:00:00.000Z") }),
    ).resolves.toEqual({
      batchCount: 0,
      batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
      cutoff: null,
      retentionDays: null,
      updated: 0,
      hasMore: false,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a late retry while its terminal fence is retained", async () => {
    mocks.prisma.rankCheckRawPurgeProgress.findUnique.mockResolvedValue({
      resultClearedAt: new Date("2026-07-28T12:00:00.000Z"),
    });

    await expect(
      purgeRankCheckRawPayloads({
        now: new Date("2026-07-28T13:00:00.000Z"),
        progressId: "a".repeat(64),
        retentionDays: 90,
      }),
    ).rejects.toThrow("result was already cleared");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("commits every destructive batch with its audit and preserves non-raw fields", async () => {
    mocks.transaction.$executeRaw
      .mockResolvedValueOnce(RANK_CHECK_RAW_PURGE_BATCH_SIZE)
      .mockResolvedValueOnce(7);
    const now = new Date("2026-07-28T00:00:00.000Z");

    await expect(purgeRankCheckRawPayloads({ now, retentionDays: 90 })).resolves.toEqual({
      batchCount: 2,
      batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
      cutoff: new Date("2026-04-29T00:00:00.000Z"),
      hasMore: false,
      retentionDays: 90,
      updated: 1007,
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.$executeRaw).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.transaction.$executeRaw.mock.calls) {
      expect(query.sql).toContain('FROM "rank_checks"');
      expect(query.sql).toContain('"raw" IS NOT NULL');
      expect(query.sql).toContain('"checkedAt" <');
      expect(query.sql).toContain('SET "raw" = NULL');
      expect(query.sql).not.toContain('"organicRanks"');
      expect(query.sql).not.toContain('"attempts"');
      expect(query.values).toEqual([
        new Date("2026-04-29T00:00:00.000Z"),
        RANK_CHECK_RAW_PURGE_BATCH_SIZE,
      ]);
    }
    expect(mocks.writeAudit).toHaveBeenCalledTimes(2);
    expect(mocks.writeAudit).toHaveBeenNthCalledWith(
      1,
      {
        action: "rank_check.raw_purge",
        actorId: null,
        after: {
          batchSize: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
          cutoff: "2026-04-29T00:00:00.000Z",
          retentionDays: 90,
          updatedCount: RANK_CHECK_RAW_PURGE_BATCH_SIZE,
        },
        projectId: null,
        targetId: "rank_checks",
        targetType: "system",
      },
      mocks.transaction,
    );
    expect(mocks.writeAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        after: expect.objectContaining({ updatedCount: 7 }),
      }),
      mocks.transaction,
    );
  });

  it("rolls a destructive batch back when its audit write fails", async () => {
    const auditError = new Error("audit insert failed");
    mocks.transaction.$executeRaw.mockResolvedValueOnce(1);
    mocks.writeAudit.mockRejectedValueOnce(auditError);

    await expect(
      purgeRankCheckRawPayloads({
        now: new Date("2026-07-28T00:00:00.000Z"),
        retentionDays: 90,
      }),
    ).rejects.toBe(auditError);

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.any(Object), mocks.transaction);
  });

  it("stops one invocation at its batch bound and reports remaining work", async () => {
    mocks.transaction.$executeRaw.mockResolvedValue(RANK_CHECK_RAW_PURGE_BATCH_SIZE);
    mocks.prisma.$queryRaw.mockResolvedValue([{ hasMore: true }]);

    await expect(
      purgeRankCheckRawPayloads({
        now: new Date("2026-07-28T00:00:00.000Z"),
        retentionDays: 90,
      }),
    ).resolves.toMatchObject({
      batchCount: RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
      hasMore: true,
      updated: RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY * RANK_CHECK_RAW_PURGE_BATCH_SIZE,
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(
      RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
    );
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("does not write a zero-count audit when no payload is changed", async () => {
    mocks.transaction.$executeRaw.mockResolvedValueOnce(0);

    await expect(
      purgeRankCheckRawPayloads({
        now: new Date("2026-07-28T00:00:00.000Z"),
        retentionDays: 90,
      }),
    ).resolves.toMatchObject({ batchCount: 0, hasMore: false, updated: 0 });

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
