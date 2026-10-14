import { beforeEach, describe, expect, it } from "vitest";
import {
  activeMarketScope,
  getOverviewMocks,
  keyword,
  now,
  rankCheck,
  resetOverviewMocks,
} from "./overview-query.test-fixture";

const { getOverview } = await import("./overview");
const mocks = getOverviewMocks();

describe("overview query", () => {
  beforeEach(() => {
    resetOverviewMocks();
  });

  it("keeps mover sections after a second rank check on the same day", async () => {
    // Second same-day check whose stored previousPosition self-references the
    // current position (the same-day re-check artifact that zeroed movement).
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_sameday",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T14:00:00.000Z"),
            position: 3,
            previousPosition: 3,
            rankingUrl: "/sameday",
          }),
          rankCheck({
            checkedAt: new Date("2026-05-31T10:00:00.000Z"),
            position: 8,
            previousPosition: 12,
            rankingUrl: "/sameday",
          }),
        ],
        text: "same day keyword",
      }),
    ]);
    mocks.prisma.keyword.count.mockResolvedValue(1);

    const result = await getOverview("prj_1", { now: new Date("2026-06-28T16:00:00Z") });

    const wins = result.highlights.find((list) => list.kind === "wins");
    expect(wins?.rows).not.toHaveLength(0);
    expect(wins?.rows[0]).toMatchObject({
      delta: { direction: "up", value: 5 },
      id: "kw_sameday",
      position: 3,
    });
  });

  it("uses full stable target pages rather than a partial capped population", async () => {
    const rows = Array.from({ length: 2500 }, (_, index) =>
      keyword({
        id: `db-${String(index).padStart(5, "0")}`,
        publicId: `kw_${index}`,
        createdAt: new Date("2026-05-15"),
        text: `pending ${index}`,
      }),
    );
    mocks.prisma.keyword.count.mockImplementation(async ({ where }) =>
      where.createdAt ? 73 : 2500,
    );
    mocks.prisma.keyword.findMany.mockImplementation(async ({ cursor, take }) => {
      const offset = cursor ? rows.findIndex(({ id }) => id === cursor.id) + 1 : 0;
      return rows.slice(offset, offset + take);
    });
    const result = await getOverview("prj_1", { now });
    expect(result.trackedKeywordCount).toBe(2500);
    expect(result.kpis.find((item) => item.id === "trackedKeywords")).toMatchObject({
      delta: { kind: "countThisMonth", value: 73 },
      value: 2500,
    });
    expect(result.addedThisMonth).toBe(73);
    expect(result.state).toBe("no-data");
    expect(result.isEmpty).toBe(false);
    expect(result.qualityReport.eligibleTotal).toBe(2500);
    expect(result.visibilityCoverage).toEqual({ limited: false, measured: 0, total: 2500 });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledTimes(6);
    expect(mocks.metadata).toHaveBeenCalledTimes(5);
    expect(mocks.prisma.keyword.count).toHaveBeenCalledTimes(3);
  });

  it("pushes URL filters into keyword and rank-check reads", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([{ name: "Docs" }]);
    mocks.prisma.keyword.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    const result = await getOverview("prj_1", {
      filters: { device: "mobile", range: "7d", tag: "Docs" },
      now,
    });

    const where = {
      ...activeMarketScope,
      device: "mobile",
      projectId: "project_1",
      tags: { some: { tag: { name: "Docs" } } },
    };
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankChecks: expect.objectContaining({
            select: expect.objectContaining({
              checkedAt: true,
              createdAt: true,
              position: true,
              previousPosition: true,
              rankingUrl: true,
              status: true,
            }),
            where: { createdAt: { lte: now } },
          }),
        }),
        take: 500,
        where: { AND: [where, { createdAt: { lte: now } }] },
      }),
    );
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, status: true },
        where: expect.objectContaining({
          checkedAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lt: new Date("2026-07-01T00:00:00.000Z"),
          },
          keyword: where,
        }),
      }),
    );
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: {
        ...where,
        createdAt: { gte: new Date("2026-06-01T00:00:00Z"), lt: new Date("2026-07-01T00:00:00Z") },
      },
    });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({ where: { projectId: "project_1" } });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: { AND: [where, { createdAt: { lte: now } }] },
    });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledTimes(4);
    expect(result.toolbar).toMatchObject({
      availableTags: ["Docs"],
      deviceValue: "mobile",
      rangeValue: "7d",
      tagValue: "Docs",
    });
  });

  it("queries checks this month with an exclusive next-month upper bound", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([{ id: "check", status: "completed" }]);
    mocks.ledger.mockResolvedValue(new Map([["check", { costCents: 25, receiptCount: 1 }]]));

    const result = await getOverview("prj_1", {
      now: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, status: true },
        where: expect.objectContaining({
          checkedAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lt: new Date("2026-07-01T00:00:00.000Z"),
          },
          keyword: { ...activeMarketScope, projectId: "project_1" },
        }),
      }),
    );
    expect(result.dataSource.checksThisMonth).toBe(1);
    expect(result.dataSource.providerCostCents).toBe(25);
  });

  it.each([false, true])(
    "includes proved cached zero in monthly spend (paid: %s)",
    async (paid) => {
      mocks.prisma.rankCheck.findMany.mockResolvedValue([
        { id: "cached", status: "completed" },
        ...(paid ? [{ id: "paid", status: "completed" }] : []),
      ]);
      mocks.ledger.mockResolvedValue(
        new Map([
          ["cached", { costCents: 0, receiptCount: 1 }],
          ...(paid ? [["paid", { costCents: 25, receiptCount: 1 }] as const] : []),
        ]),
      );
      const result = await getOverview("prj_1", { now });
      expect(result.dataSource.checksThisMonth).toBe(paid ? 2 : 1);
      expect(result.dataSource.providerCostCents).toBe(paid ? 25 : 0);
      expect(result.estimatedProviderCostCents).toBe(paid ? 25 : 0);
    },
  );

  it.each([null, "missing"])("keeps monthly spend unknown for %s evidence", async (cost) => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { id: "known", status: "completed" },
      { id: "unknown", status: "completed" },
    ]);
    mocks.ledger.mockResolvedValue(
      new Map<string, { costCents: number | null; receiptCount: 1 }>([
        ["known", { costCents: 25, receiptCount: 1 }],
        ...(cost === null ? [["unknown", { costCents: null, receiptCount: 1 }] as const] : []),
      ]),
    );
    const result = await getOverview("prj_1", { now });
    expect(result.dataSource.providerCostCents).toBeNull();
    expect(result.estimatedProviderCostCents).toBeNull();
  });

  it("includes billed failed attempts in monthly canonical cost without counting them as completed checks", async () => {
    const attempts = [
      { id: "paid", status: "completed" },
      { id: "failed", status: "failed" },
    ];
    mocks.prisma.rankCheck.findMany.mockImplementation(async ({ where }) =>
      attempts.filter((row) => !where.status || row.status === where.status),
    );
    mocks.ledger.mockResolvedValue(
      new Map([
        ["paid", { costCents: 0.06, receiptCount: 1 }],
        ["failed", { costCents: 0.07, receiptCount: 1 }],
      ]),
    );
    const result = await getOverview("prj_1", { now });
    expect(result.dataSource.checksThisMonth).toBe(1);
    expect(result.dataSource.providerCostCents).toBe(0.13);
  });

  it("places position distribution edges into exact buckets", async () => {
    const positions = [1, 3, 4, 10, 11, 20, 21, 50, 51, 100, 101, null];
    mocks.prisma.keyword.count.mockResolvedValue(positions.length);
    mocks.prisma.keyword.findMany.mockResolvedValue(
      positions.map((position, index) =>
        keyword({
          publicId: `kw_edge_${index}`,
          rankChecks: [
            rankCheck({
              position,
              rankingUrl: position ? `/position-${position}` : null,
            }),
          ],
          text: `edge keyword ${index}`,
        }),
      ),
    );

    const result = await getOverview("prj_1", { now });

    expect(result.distribution.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ["#1-3", 2],
      ["#4-10", 2],
      ["#11-20", 2],
      ["#21-50", 2],
      ["#51-100", 2],
    ]);
  });
});
