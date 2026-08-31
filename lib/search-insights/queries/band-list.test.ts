import { Prisma } from "@/lib/generated/prisma/client";
import {
  DRAWER_LIST_CAP,
  DRAWER_LIST_ROWS,
  MIN_BAND_IMPRESSIONS,
  POSITION_BAND,
} from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() }, scope: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));

const { getPositionBandQueries, loadPositionBandQueries } = await import("./band-list");
const { positionBandQuerySql } = await import("./signals");

const window = { end: "2026-07-08", start: "2026-06-11" };

const rows = [
  { clicks: 12n, impressions: 4_000n, position: 6.2, query: "stored query", total: 34n },
  { clicks: 4n, impressions: 900n, position: 18.1, query: "another stored query", total: 34n },
];

function statement() {
  return mocks.prisma.$queryRaw.mock.calls[0]?.[0];
}

describe("getPositionBandQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue(rows);
  });

  it("wraps the chip's own predicate, so the count and the list cannot disagree", async () => {
    await getPositionBandQueries("project_1", "sc-domain:example.com", window);

    // The selection is not restated here: the shared statement is embedded whole and only
    // ordered and limited, which is what keeps the number on the chip honest.
    const shared = positionBandQuerySql(Prisma.sql`"projectId" = ${"project_1"}`);
    const selection = shared.sql
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("WHERE"));
    for (const fragment of selection) {
      expect(statement().sql).toContain(fragment);
    }
    expect(statement().sql).toContain('AS "band"');
    expect(statement().values).toEqual(
      expect.arrayContaining([MIN_BAND_IMPRESSIONS, POSITION_BAND.min, POSITION_BAND.max]),
    );
  });

  it("puts the biggest demand first, because that is what a better position converts", async () => {
    await getPositionBandQueries("project_1", "sc-domain:example.com", window);

    expect(statement().sql).toContain('ORDER BY "impressions" DESC');
    expect(statement().values).toContain(DRAWER_LIST_ROWS);
  });

  it("carries the window total beside the rows it read", async () => {
    const list = await getPositionBandQueries("project_1", "sc-domain:example.com", window);

    expect(list.total).toBe(34);
    expect(list.rows[0]).toEqual({
      clicks: 12,
      impressions: 4_000,
      position: 6.2,
      query: "stored query",
    });
  });

  it("reaches the rest on request, and never past the cap", async () => {
    await getPositionBandQueries("project_1", "sc-domain:example.com", window, {
      limit: DRAWER_LIST_CAP * 4,
    });

    expect(statement().values).toContain(DRAWER_LIST_CAP);
  });

  it("reports an empty window as empty rather than as an unknown total", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      getPositionBandQueries("project_1", "sc-domain:example.com", window),
    ).resolves.toEqual({ rows: [], total: 0 });
  });
});

describe("loadPositionBandQueries", () => {
  it("re-resolves an archived property before reading its list", async () => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    await loadPositionBandQueries("prj_1", {
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
  });

  it("reads nothing for a property with no finalized window", async () => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    await expect(loadPositionBandQueries("prj_1", {})).resolves.toEqual({ rows: [], total: 0 });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
