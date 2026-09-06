import { beforeEach, describe, expect, it, vi } from "vitest";

type ArchiveRow = { archivedAt: Date | null; id: string };

const keywordRows: ArchiveRow[] = [];

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateKeywords: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: () => "pmkt_abcdefghijklmnopqrstuvwx" }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { updateMany: mocks.updateKeywords },
    projectMarket: { findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));

import { alertMarketMatches } from "@/lib/alerts/market-scope";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { listArchivedProjectMarkets, restoreProjectMarket } from "./registry";

const reference = { projectId: "project_1", locationId: "location_1" };
const archivedAt = new Date("2026-08-01T21:00:00.000Z");

type StatusRow = { locationId: string; projectId: string; status: ProjectMarketStatus };

/** A client that honours the status filter, so the listing proves what it excludes. */
function filteringClient(rows: readonly StatusRow[]) {
  return {
    projectMarket: {
      findMany: vi.fn(async ({ where }: { where: Omit<StatusRow, "locationId"> }) =>
        rows.filter((row) => row.projectId === where.projectId && row.status === where.status),
      ),
    },
  };
}

type CasWhere = { locationId: string; projectId: string; status?: ProjectMarketStatus };

/**
 * Matches rows the way the database would: the status filter narrows only when the caller sends
 * one, so a write that drops the condition really does reach a row in any status.
 */
function compareAndSwapClient(row: { locationId: string; status: string }) {
  return {
    projectMarket: {
      updateMany: vi.fn(async ({ data, where }: { data: { status: string }; where: CasWhere }) => {
        const matches =
          row.locationId === where.locationId &&
          (where.status === undefined || row.status === where.status);
        if (!matches) return { count: 0 };
        row.status = data.status;
        return { count: 1 };
      }),
    },
  };
}

describe("project market restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keywordRows.length = 0;
    keywordRows.push({ archivedAt, id: "keyword_1" }, { archivedAt: null, id: "keyword_2" });
    // Any keyword write the registry made would land here, so the rows below are real evidence.
    mocks.updateKeywords.mockImplementation(async () => {
      for (const row of keywordRows) row.archivedAt = null;
      return { count: keywordRows.length };
    });
  });

  it("sets the market active without touching any keyword archive state", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(restoreProjectMarket(reference)).resolves.toEqual({ count: 1 });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { ...reference, status: ProjectMarketStatus.removed },
      data: { status: ProjectMarketStatus.active },
    });
    expect(mocks.updateKeywords).not.toHaveBeenCalled();
    expect(keywordRows.map((row) => row.archivedAt)).toEqual([archivedAt, null]);
  });

  it("lists removed markets and excludes active and paused ones", async () => {
    const client = filteringClient([
      { locationId: "location_1", projectId: "project_1", status: ProjectMarketStatus.removed },
      { locationId: "location_2", projectId: "project_1", status: ProjectMarketStatus.active },
      { locationId: "location_3", projectId: "project_1", status: ProjectMarketStatus.paused },
      { locationId: "location_4", projectId: "project_2", status: ProjectMarketStatus.removed },
    ]);

    await expect(listArchivedProjectMarkets("project_1", client as never)).resolves.toEqual([
      { locationId: "location_1", projectId: "project_1", status: ProjectMarketStatus.removed },
    ]);
    expect(client.projectMarket.findMany).toHaveBeenCalledWith({
      include: { location: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: { projectId: "project_1", status: ProjectMarketStatus.removed },
    });
  });

  it("re-arms an alert rule scoped to the market it restores", async () => {
    const market = { locationId: "location_1", status: ProjectMarketStatus.removed as string };
    const alertRuleMarkets = [{ projectMarketId: "market_1", ruleId: "rule_1" }];
    const scopedRule = { markets: [{ projectMarket: market }] };
    const client = compareAndSwapClient(market);

    expect(alertMarketMatches(scopedRule, "location_1")).toBe(false);

    await expect(restoreProjectMarket(reference, client as never)).resolves.toEqual({ count: 1 });

    expect(market.status).toBe(ProjectMarketStatus.active);
    expect(alertMarketMatches(scopedRule, "location_1")).toBe(true);
    expect(alertRuleMarkets).toEqual([{ projectMarketId: "market_1", ruleId: "rule_1" }]);
  });

  it("leaves a row that is no longer archived when the write lands untouched", async () => {
    const market = { locationId: "location_1", status: ProjectMarketStatus.paused as string };
    const client = compareAndSwapClient(market);

    await expect(restoreProjectMarket(reference, client as never)).resolves.toEqual({ count: 0 });

    expect(market.status).toBe(ProjectMarketStatus.paused);
  });
});
