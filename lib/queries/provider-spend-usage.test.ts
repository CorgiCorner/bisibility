import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { providerCostEntry: { groupBy: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { providerCostBySource } from "./provider-spend-usage";

function confirmedGroup(overrides: Record<string, unknown> = {}) {
  return {
    _count: { _all: 1 },
    _sum: { costCents: "1.0000", usageQuantity: null },
    connectionId: "conn_1",
    feature: "rank_check",
    source: "app",
    trigger: null,
    ...overrides,
  };
}

function countGroup(overrides: Record<string, unknown> = {}) {
  return {
    _count: { _all: 1 },
    connectionId: "conn_1",
    feature: "rank_check",
    source: "app",
    trigger: null,
    ...overrides,
  };
}

describe("providerCostBySource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(
      async (args: { where?: { measurementStatus?: unknown; usageQuantity?: unknown } }) =>
        args.where?.measurementStatus === "recorded"
          ? args.where?.usageQuantity === null
            ? []
            : []
          : [],
    );
  });

  it("splits confirmed rows from unsettled and unmeasured rows in one bucket", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(
      async (args: { where?: { measurementStatus?: unknown; usageQuantity?: unknown } }) => {
        const { measurementStatus, usageQuantity } = args.where ?? {};
        if (measurementStatus === "recorded" && usageQuantity === null) {
          return [countGroup({ _count: { _all: 2 }, trigger: "scheduled" })];
        }
        if (measurementStatus === "recorded") {
          return [
            confirmedGroup({
              _count: { _all: 3 },
              _sum: { costCents: "4.5000", usageQuantity: "2.5" },
              source: "app",
              trigger: "scheduled",
            }),
          ];
        }
        return [countGroup({ _count: { _all: 4 }, trigger: "scheduled" })];
      },
    );

    await expect(
      providerCostBySource("project_1", new Date("2026-09-22T00:00:00.000Z")),
    ).resolves.toEqual([
      {
        connectionId: "conn_1",
        count: 3,
        costCents: 4.5,
        feature: "rank_check",
        quantity: 2.5,
        scheduled: 3,
        source: "app",
        unmeasuredCount: 2,
        unrecordedCount: 4,
      },
    ]);
  });

  it("keeps a source bucket when every request is still unconfirmed", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(async (args) =>
      args.where.measurementStatus === "recorded"
        ? []
        : [countGroup({ source: "mcp", feature: "keyword_research", _count: { _all: 2 } })],
    );
    await expect(providerCostBySource("project_1")).resolves.toEqual([
      expect.objectContaining({
        source: "mcp",
        feature: "keyword_research",
        count: 0,
        costCents: 0,
        quantity: null,
        unrecordedCount: 2,
        unmeasuredCount: 0,
      }),
    ]);
  });

  it("queries confirmed, unrecorded and unmeasured groups in parallel", async () => {
    await providerCostBySource("project_1", new Date("2026-09-22T00:00:00.000Z"));

    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledTimes(3);
    const calls = mocks.prisma.providerCostEntry.groupBy.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(calls[0][0].where).toMatchObject({ measurementStatus: "recorded" });
    expect(calls[1][0].where).toMatchObject({ measurementStatus: { not: "recorded" } });
    expect(calls[2][0].where).toMatchObject({
      measurementStatus: "recorded",
      usageQuantity: null,
    });
    for (const [call] of calls) {
      expect(call.where).toMatchObject({
        cached: false,
        projectId: "project_1",
      });
    }
  });

  it("reports null quantity when confirmed rows carry no measurement", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(
      async (args: { where?: { measurementStatus?: unknown; usageQuantity?: unknown } }) =>
        args.where?.measurementStatus === "recorded" && args.where?.usageQuantity === undefined
          ? [
              confirmedGroup({
                _count: { _all: 1 },
                _sum: { costCents: "2.0000", usageQuantity: null },
              }),
            ]
          : [],
    );

    const rows = await providerCostBySource("project_1", new Date("2026-09-22T00:00:00.000Z"));

    expect(rows).toEqual([
      expect.objectContaining({ count: 1, costCents: 2, quantity: null, unrecordedCount: 0 }),
    ]);
  });
});
