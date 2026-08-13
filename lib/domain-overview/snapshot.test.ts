import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findDomainOverviewSnapshotMetadata,
  persistDomainOverviewModules,
  persistDomainOverviewSnapshot,
  resolveDomainOverviewSnapshot,
  shouldRollPrevious,
  snapshotMetrics,
} from "./snapshot";

const mocks = vi.hoisted(() => ({
  fetchMetrics: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    domainOverviewSnapshot: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  tx: {
    domainOverviewSnapshot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./cache", () => ({
  domainOverviewCachedUntil: (fetchedAt: Date) => fetchedAt.getTime() + 43_200_000,
  withDomainOverviewCache: mocks.withCache,
}));
vi.mock("./provider-call", () => ({ fetchDomainOverviewMetrics: mocks.fetchMetrics }));

const currentMetrics = {
  count: 120,
  estimatedTrafficCostCents: 340,
  etv: 56,
  isDown: 2,
  isLost: 1,
  isNew: 4,
  isUp: 8,
  pos1: 3,
  pos11_20: 12,
  pos21_30: 13,
  pos2_3: 5,
  pos31_40: 14,
  pos41_50: 15,
  pos4_10: 9,
  pos51_60: 16,
  pos61_70: 17,
  pos71_80: 18,
  pos81_90: 19,
  pos91_100: 20,
};

const nextMetrics = { ...currentMetrics, count: 130, etv: 61 };

const key = {
  languageCode: "pl",
  locationCode: 2616,
  projectId: "project_1",
  scope: "root" as const,
  target: "example.com",
};

describe("domain overview snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
    );
    mocks.tx.domainOverviewSnapshot.update.mockResolvedValue({ id: "snapshot_1" });
    mocks.prisma.domainOverviewSnapshot.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sanitizes persisted metric JSON and rejects empty values", () => {
    expect(snapshotMetrics(null)).toBeNull();
    expect(snapshotMetrics({})).toBeNull();
    expect(snapshotMetrics([])).toBeNull();
    expect(
      snapshotMetrics({ count: 12, estimatedTrafficCostCents: Number.NaN, etv: Infinity, pos1: 3 }),
    ).toMatchObject({
      count: 12,
      estimatedTrafficCostCents: null,
      etv: null,
      isDown: 0,
      isLost: 0,
      isNew: 0,
      isUp: 0,
      pos1: 3,
      pos2_3: 0,
      pos91_100: 0,
    });
  });

  it("rolls previous only between two different source snapshots", () => {
    const jul22 = "2026-07-22T00:00:00.000Z";
    expect(shouldRollPrevious(jul22, new Date(jul22))).toBe(false);
    expect(shouldRollPrevious(null, jul22)).toBe(false);
    expect(shouldRollPrevious(jul22, null)).toBe(false);
    expect(shouldRollPrevious(jul22, "2026-07-29T00:00:00.000Z")).toBe(true);
  });

  it("includes overview state in cache metadata for no-data pricing", async () => {
    const now = new Date("2026-08-12T08:00:00.000Z");
    await findDomainOverviewSnapshotMetadata({ ...key, now, provider: "dataforseo" });

    expect(mocks.prisma.domainOverviewSnapshot.findFirst).toHaveBeenCalledWith({
      select: { cachedUntil: true, fetchedAt: true, overview: true, provider: true },
      where: {
        cachedUntil: { gt: now },
        languageCode: "pl",
        locationCode: 2616,
        projectId: "project_1",
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      },
    });
  });

  it("preserves previous fields when the source snapshot is unchanged", async () => {
    const sourceSnapshotAt = new Date("2026-07-22T00:00:00.000Z");
    mocks.tx.domainOverviewSnapshot.findUnique.mockResolvedValue({
      fetchedAt: new Date("2026-07-23T10:00:00.000Z"),
      overview: currentMetrics,
      sourceSnapshotAt,
    });

    await persistDomainOverviewSnapshot({
      ...key,
      fetchedAt: new Date("2026-07-24T10:00:00.000Z"),
      overview: nextMetrics,
      provider: "dataforseo",
      sourceSnapshotAt: new Date(sourceSnapshotAt),
    });

    const update = mocks.tx.domainOverviewSnapshot.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      fetchedAt: new Date("2026-07-24T10:00:00.000Z"),
      overview: nextMetrics,
      rankedKeywords: Prisma.DbNull,
      relevantPages: Prisma.DbNull,
      sourceSnapshotAt,
    });
    expect(update.data).not.toHaveProperty("previousOverview");
    expect(update.data).not.toHaveProperty("previousFetchedAt");
    expect(update.data).not.toHaveProperty("previousSourceSnapshotAt");
  });

  it("copies the current values to previous when the source snapshot changes", async () => {
    const previousFetchedAt = new Date("2026-07-23T10:00:00.000Z");
    const previousSourceSnapshotAt = new Date("2026-07-22T00:00:00.000Z");
    mocks.tx.domainOverviewSnapshot.findUnique.mockResolvedValue({
      fetchedAt: previousFetchedAt,
      overview: currentMetrics,
      sourceSnapshotAt: previousSourceSnapshotAt,
    });

    await persistDomainOverviewSnapshot({
      ...key,
      fetchedAt: new Date("2026-07-30T10:00:00.000Z"),
      overview: nextMetrics,
      provider: "dataforseo",
      sourceSnapshotAt: new Date("2026-07-29T00:00:00.000Z"),
    });

    expect(mocks.tx.domainOverviewSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          previousFetchedAt,
          previousOverview: currentMetrics,
          previousSourceSnapshotAt,
        }),
      }),
    );
  });

  it("persists first-page modules only for the overview fetch it belongs to", async () => {
    const expectedFetchedAt = new Date("2026-07-30T10:00:00.000Z");
    await persistDomainOverviewModules({
      ...key,
      expectedFetchedAt,
      keywords: { consumedCount: 0, costCents: 2, rows: [], totalCount: 12 },
      pages: { consumedCount: 0, costCents: 3, rows: [], totalCount: 4 },
      provider: "dataforseo",
    });

    expect(mocks.prisma.domainOverviewSnapshot.updateMany).toHaveBeenCalledWith({
      data: {
        rankedKeywords: { consumedCount: 0, costCents: 2, rows: [], totalCount: 12 },
        relevantPages: { consumedCount: 0, costCents: 3, rows: [], totalCount: 4 },
      },
      where: { ...key, fetchedAt: expectedFetchedAt, provider: "dataforseo" },
    });
  });

  it("replays durable first-page modules without consulting provider cache", async () => {
    mocks.prisma.domainOverviewSnapshot.findFirst.mockResolvedValue({
      cachedUntil: new Date("2026-07-30T22:00:00.000Z"),
      fetchedAt: new Date("2026-07-30T10:00:00.000Z"),
      history: null,
      id: "snapshot_1",
      languageCode: "pl",
      locationCode: 2616,
      overview: currentMetrics,
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      projectId: "project_1",
      provider: "dataforseo",
      rankedKeywords: { consumedCount: 0, costCents: 2, rows: [], totalCount: 12 },
      relevantPages: { consumedCount: 0, costCents: 3, rows: [], totalCount: 4 },
      scope: "root",
      sourceSnapshotAt: new Date("2026-07-29T00:00:00.000Z"),
      target: "example.com",
    });

    await expect(
      resolveDomainOverviewSnapshot({
        ...key,
        fresh: false,
        key: "overview-key",
        project: { budgetCapCents: 100 } as never,
        source: { provider: { id: "dataforseo" } } as never,
      }),
    ).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      durable: true,
      modules: {
        keywords: { consumedCount: 0, costCents: 2, rows: [], totalCount: 12 },
        pages: { consumedCount: 0, costCents: 3, rows: [], totalCount: 4 },
      },
    });
    expect(mocks.withCache).not.toHaveBeenCalled();
    expect(mocks.fetchMetrics).not.toHaveBeenCalled();
  });

  it("checks the approved cost immediately before a snapshot provider call", async () => {
    const blocked = new Error("cost blocked");
    mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) =>
      load(),
    );

    await expect(
      resolveDomainOverviewSnapshot({
        ...key,
        beforeLoad: () => {
          throw blocked;
        },
        fresh: true,
        key: "overview-key",
        project: { budgetCapCents: 100 } as never,
        source: { provider: { id: "dataforseo" } } as never,
      }),
    ).rejects.toBe(blocked);
    expect(mocks.fetchMetrics).not.toHaveBeenCalled();
  });
});
