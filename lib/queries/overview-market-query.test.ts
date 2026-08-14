import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOverviewMarketChecks, overviewMarketSnapshotAnchors } from "./overview-market-query";

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("overview market snapshot query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([]);
  });

  it("requests only the previous boundary and eight current-period trend snapshots", () => {
    const anchors = overviewMarketSnapshotAnchors(new Date("2026-06-28T12:00:00.000Z"), "28d");

    expect(anchors).toHaveLength(9);
    expect(anchors[0]).toEqual(new Date("2026-05-31T23:59:59.999Z"));
    expect(anchors.at(-1)).toEqual(new Date("2026-06-28T12:00:00.000Z"));
    expect(anchors.slice(1)).toHaveLength(8);
  });

  it("keeps the snapshot count constant for the longest range", () => {
    expect(overviewMarketSnapshotAnchors(new Date("2026-06-28T12:00:00.000Z"), "90d")).toHaveLength(
      9,
    );
  });

  it("types every snapshot anchor as a database timestamp", async () => {
    await fetchOverviewMarketChecks("project_1", 2000, new Date("2026-06-28T12:00:00.000Z"), "28d");

    const query = mocks.prisma.$queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(query.sql?.match(/::timestamp\(3\)/g) ?? []).toHaveLength(9);
  });

  it("applies selected market IDs inside the bounded keyword CTE", async () => {
    await fetchOverviewMarketChecks(
      "project_1",
      2000,
      new Date("2026-06-28T12:00:00.000Z"),
      "28d",
      { marketIds: ["loc_es_es", "loc_be_nl"] },
    );

    const query = mocks.prisma.$queryRaw.mock.calls[0]?.[0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(query.sql).toContain('k."locationId" IN (');
    expect(query.values).toEqual(expect.arrayContaining(["loc_es_es", "loc_be_nl"]));
  });
});
