import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRankCheckRawProgressFenceRetentionDays,
  RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS_DEFAULT,
  RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE,
  sweepRankCheckRawPurgeProgress,
} from "./raw-retention-fences";

const mocks = vi.hoisted(() => ({
  prisma: {
    $executeRaw: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("rank-check raw purge progress fences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a named seven-day default and validates operator overrides", () => {
    expect(RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS_DEFAULT).toBe(7);
    expect(getRankCheckRawProgressFenceRetentionDays()).toBe(7);

    vi.stubEnv("RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS", "30");
    expect(getRankCheckRawProgressFenceRetentionDays()).toBe(30);

    vi.stubEnv("RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS", "1");
    expect(() => getRankCheckRawProgressFenceRetentionDays()).toThrow();

    vi.stubEnv("RANK_CHECK_RAW_PROGRESS_FENCE_RETENTION_DAYS", "3651");
    expect(() => getRankCheckRawProgressFenceRetentionDays()).toThrow();
  });

  it("scrubs and reclaims terminal fences in bounded pages without content fields", async () => {
    mocks.prisma.$executeRaw
      .mockResolvedValueOnce(RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE)
      .mockResolvedValueOnce(RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE)
      .mockResolvedValueOnce(3);
    const now = new Date("2026-07-28T12:00:00.000Z");

    await expect(sweepRankCheckRawPurgeProgress({ now })).resolves.toEqual({
      cutoff: new Date("2026-07-21T12:00:00.000Z"),
      deleted: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE * 2 + 3,
      deletePages: 3,
      fenceRetentionDays: 7,
      hasMore: false,
      pageSize: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE,
      scrubbed: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE + 7,
      scrubPages: 2,
    });

    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(5);
    const queries = mocks.prisma.$executeRaw.mock.calls.map(([query]) => query.sql);
    expect(queries.slice(0, 2).every((query) => query.includes('"resultClearedAt" IS NULL'))).toBe(
      true,
    );
    expect(queries.slice(2).every((query) => query.includes('"resultClearedAt" <'))).toBe(true);
    expect(queries.slice(2).every((query) => query.includes('WHERE "completed"'))).toBe(true);
    const deletionValues = mocks.prisma.$executeRaw.mock.calls
      .slice(2)
      .map(([query]) => query.values);
    for (const values of deletionValues) {
      expect(values).toEqual([
        new Date("2026-07-21T12:00:00.000Z"),
        RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE,
      ]);
    }
    for (const query of queries) {
      expect(query).toContain('"rank_check_raw_purge_progress"');
      expect(query).toContain("FOR UPDATE SKIP LOCKED");
      expect(query).not.toMatch(/\b(raw|url|domain|keyword|serp)\b/i);
    }
  });

  it("caps both phases and reports remaining work conservatively", async () => {
    mocks.prisma.$executeRaw.mockResolvedValue(RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE);

    await expect(
      sweepRankCheckRawPurgeProgress({
        maxPagesPerPhase: 2,
        now: new Date("2026-07-28T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      deleted: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE * 2,
      deletePages: 2,
      hasMore: true,
      scrubbed: RANK_CHECK_RAW_PROGRESS_SWEEP_PAGE_SIZE * 2,
      scrubPages: 2,
    });
    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(4);
  });
});
