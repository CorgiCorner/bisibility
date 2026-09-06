import { describe, expect, it, vi } from "vitest";
import {
  activeMarketLocationIds,
  activeMarketLocationIdsByProject,
  isRunnableKeyword,
  RUNNABLE_KEYWORD_SQL,
  runnableKeywordSql,
  runnableKeywordWhere,
  unrunnableClaimReason,
  unrunnableKeywordReason,
} from "./runnable";

const archived = new Date("2026-09-02T08:00:00.000Z");

function normalized(sql: { sql: string }) {
  return sql.sql.replace(/\s+/g, " ").trim();
}

describe("runnable keyword predicate", () => {
  it("runs only rows whose market is active and whose row is not archived", () => {
    const active = new Set(["location_active"]);

    expect(isRunnableKeyword({ archivedAt: null, locationId: "location_active" }, active)).toBe(
      true,
    );
    expect(isRunnableKeyword({ archivedAt: null, locationId: "location_paused" }, active)).toBe(
      false,
    );
    expect(isRunnableKeyword({ archivedAt: archived, locationId: "location_active" }, active)).toBe(
      false,
    );
  });

  it("names why a row is not runnable and prefers archival over market status", () => {
    const active = new Set(["location_active"]);

    expect(
      unrunnableKeywordReason({ archivedAt: null, locationId: "location_active" }, active),
    ).toBe(null);
    expect(
      unrunnableKeywordReason({ archivedAt: null, locationId: "location_paused" }, active),
    ).toBe("market_inactive");
    expect(
      unrunnableKeywordReason({ archivedAt: archived, locationId: "location_active" }, active),
    ).toBe("keyword_archived");
    expect(
      unrunnableKeywordReason({ archivedAt: archived, locationId: "location_paused" }, active),
    ).toBe("keyword_archived");
  });

  it("reads claim-time booleans with the same precedence", () => {
    expect(unrunnableClaimReason({ archivedAt: null, marketActive: true })).toBe(null);
    expect(unrunnableClaimReason({ archivedAt: null, marketActive: false })).toBe(
      "market_inactive",
    );
    expect(unrunnableClaimReason({ archivedAt: archived, marketActive: true })).toBe(
      "keyword_archived",
    );
  });

  it("treats a paused market as not runnable when loading the active set", async () => {
    const findMany = vi.fn(async () => [{ locationId: "location_active" }]);

    await expect(
      activeMarketLocationIds("project_1", { projectMarket: { findMany } } as never),
    ).resolves.toEqual(new Set(["location_active"]));
    expect(findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  it("groups the active markets of every project for unscoped sweeps", async () => {
    const findMany = vi.fn(async () => [
      { locationId: "location_a", projectId: "project_1" },
      { locationId: "location_b", projectId: "project_1" },
      { locationId: "location_a", projectId: "project_2" },
    ]);

    await expect(
      activeMarketLocationIdsByProject({ projectMarket: { findMany } } as never),
    ).resolves.toEqual(
      new Map([
        ["project_1", new Set(["location_a", "location_b"])],
        ["project_2", new Set(["location_a"])],
      ]),
    );
    expect(findMany).toHaveBeenCalledWith({
      select: { locationId: true, projectId: true },
      where: { status: "active" },
    });
  });

  it("combines the archived condition with the active market locations for Prisma paths", () => {
    expect(runnableKeywordWhere(new Set(["location_a", "location_b"]))).toEqual({
      archivedAt: null,
      locationId: { in: ["location_a", "location_b"] },
    });
    expect(runnableKeywordWhere([])).toEqual({ archivedAt: null, locationId: { in: [] } });
  });

  it("correlates the market registry on the pair, aliased by the caller", () => {
    expect(normalized(runnableKeywordSql("keyword"))).toBe(
      '(keyword."archivedAt" IS NULL AND EXISTS ( SELECT 1 FROM "project_markets" pm ' +
        'WHERE pm."projectId" = keyword."projectId" AND pm."locationId" = keyword."locationId" ' +
        "AND pm.status = 'active' ))",
    );
    expect(normalized(RUNNABLE_KEYWORD_SQL)).toBe(normalized(runnableKeywordSql("k")));
  });

  it("carries no bound parameters so it can be embedded in any dispatch query", () => {
    expect(runnableKeywordSql("k").values).toEqual([]);
  });

  it("refuses an alias that is not a plain SQL identifier", () => {
    expect(() => runnableKeywordSql('k" OR 1=1 --')).toThrow(
      "Keyword table alias must be a plain SQL identifier.",
    );
  });
});
