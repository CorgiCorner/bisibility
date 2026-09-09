import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { claimDueRankCheckItems } from "./items-claim";

const mocks = vi.hoisted(() => ({
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));

const now = new Date("2026-09-04T10:00:00.000Z");
const notBefore = "2026-09-04 09:00Z";
const archivedAt = "2026-09-01 06:00Z";

/**
 * The same market fixture as the dispatcher query, queued as run items: one active market, one
 * paused market, one removed market, plus an archived row inside the active market and a check
 * that is already in flight in the paused market.
 */
const FIXTURE = `
  CREATE TYPE "ProjectMarketStatus" AS ENUM ('active', 'paused', 'removed');
  CREATE TABLE projects (id text PRIMARY KEY, domain text);
  CREATE TABLE keywords (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "locationId" text,
    device text, "archivedAt" timestamptz
  );
  CREATE TABLE project_markets (
    "projectId" text, "locationId" text, status "ProjectMarketStatus",
    PRIMARY KEY ("projectId", "locationId")
  );
  CREATE TABLE rank_check_runs (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "requestedCount" int,
    "selectionKind" text, status text, "startedAt" timestamptz
  );
  CREATE TABLE rank_check_run_items (
    id text PRIMARY KEY, "runId" text, "keywordId" text, status text,
    "claimAttempts" int DEFAULT 0, "claimExpiresAt" timestamptz, "notBefore" timestamptz,
    "rankCheckId" text, "startedAt" timestamptz, "updatedAt" timestamptz,
    "blockedReason" text, "actualCostCents" int, "finishedAt" timestamptz
  );

  INSERT INTO projects VALUES ('project', 'example.com');
  INSERT INTO project_markets VALUES
    ('project', 'location_active', 'active'),
    ('project', 'location_paused', 'paused'),
    ('project', 'location_removed', 'removed');
  INSERT INTO keywords VALUES
    ('keyword_active', 'kw_active', 'project', 'location_active', 'desktop', NULL),
    ('keyword_paused', 'kw_paused', 'project', 'location_paused', 'desktop', NULL),
    ('keyword_removed', 'kw_removed', 'project', 'location_removed', 'desktop', NULL),
    ('keyword_archived', 'kw_archived', 'project', 'location_active', 'desktop', '${archivedAt}'),
    ('keyword_flight', 'kw_flight', 'project', 'location_paused', 'desktop', NULL);
  INSERT INTO rank_check_runs
    VALUES ('run', 'rcr_run', 'project', 5, 'scheduled_due', 'running', '${notBefore}');
  INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore", "rankCheckId")
    VALUES
      ('item_active', 'run', 'keyword_active', 'queued', '${notBefore}', NULL),
      ('item_paused', 'run', 'keyword_paused', 'queued', '${notBefore}', NULL),
      ('item_removed', 'run', 'keyword_removed', 'queued', '${notBefore}', NULL),
      ('item_archived', 'run', 'keyword_archived', 'queued', '${notBefore}', NULL);
  INSERT INTO rank_check_run_items
    (id, "runId", "keywordId", status, "claimExpiresAt", "rankCheckId", "startedAt")
    VALUES ('item_flight', 'run', 'keyword_flight', 'running', '${notBefore}', 'check_1',
      '${notBefore}');
`;

type RawQuery = { text: string; values: unknown[] };
type ItemUpdate = {
  data: { actualCostCents?: number; blockedReason?: string; status: string };
  where: { id: string };
};

let db: PGlite;
let itemUpdates: ItemUpdate[];
let runUpdates: unknown[];

function claimDatabase() {
  const tx = {
    $queryRaw: async (sql: RawQuery) => (await db.query(sql.text, sql.values)).rows,
    rankCheckRun: {
      update: vi.fn(async (args: unknown) => {
        runUpdates.push(args);
        return {};
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    rankCheckRunItem: {
      // Leaves one item pending so the run is never finalized inside this fixture.
      groupBy: vi.fn(async () => [
        { _count: { _all: 1 }, _sum: { actualCostCents: null }, keywordId: "x", status: "queued" },
      ]),
      updateMany: vi.fn(async (args: ItemUpdate) => {
        itemUpdates.push(args);
        return { count: 1 };
      }),
    },
  };
  return {
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
      await db.exec("BEGIN");
      try {
        const result = await callback(tx);
        await db.exec("COMMIT");
        return result;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function cancellation(itemId: string) {
  return itemUpdates.find((update) => update.where.id === itemId);
}

describe("claiming due rank-check items honours the runnable predicate", () => {
  beforeAll(() => {
    db = new PGlite();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    itemUpdates = [];
    runUpdates = [];
    // Reuse the engine while rebuilding all schema and fixture state per test.
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await db.exec(FIXTURE);
  });

  afterAll(() => db.close());

  it("claims only the active market's live row", async () => {
    const result = await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(result.claimed).toBe(1);
    expect(result.groups).toEqual([
      expect.objectContaining({ keywordIds: ["keyword_active"], runItemIds: ["item_active"] }),
    ]);
    expect(
      (await db.query("SELECT id FROM rank_check_run_items WHERE status = 'running' ORDER BY id"))
        .rows,
    ).toEqual([{ id: "item_active" }, { id: "item_flight" }]);
  });

  it("cancels a queued item whose market stopped being active, at zero cost", async () => {
    await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(cancellation("item_paused")).toEqual({
      data: {
        actualCostCents: 0,
        blockedReason: "market_inactive",
        claimExpiresAt: null,
        finishedAt: now,
        status: "cancelled",
      },
      where: {
        OR: [{ status: "queued" }, { rankCheckId: null, status: "running" }],
        id: "item_paused",
      },
    });
    expect(cancellation("item_removed")?.data.blockedReason).toBe("market_inactive");
    expect(runUpdates).toContainEqual({
      data: { cancelledCount: { increment: 1 } },
      where: { id: "run" },
    });
  });

  it("cancels an archived keyword with its own reason", async () => {
    await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(cancellation("item_archived")?.data).toMatchObject({
      actualCostCents: 0,
      blockedReason: "keyword_archived",
      status: "cancelled",
    });
  });

  it("audits every cancellation with the reason that caused it", async () => {
    await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rank_check_run.item_cancelled",
        after: { itemId: "item_paused", keywordId: "kw_paused", reason: "market_inactive" },
        projectId: "project",
        targetId: "rcr_run",
      }),
      expect.anything(),
    );
  });

  it("lets a check that is already in flight finish and be billed", async () => {
    await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(cancellation("item_flight")).toBeUndefined();
    expect(
      (
        await db.query('SELECT status, "rankCheckId" FROM rank_check_run_items WHERE id = $1', [
          "item_flight",
        ])
      ).rows,
    ).toEqual([{ status: "running", rankCheckId: "check_1" }]);
  });

  it("claims the paused market's row again once the market is reactivated", async () => {
    await db.exec(
      "UPDATE project_markets SET status = 'active' WHERE \"locationId\" = 'location_paused';",
    );

    const result = await claimDueRankCheckItems({ now }, claimDatabase() as never);

    expect(result.claimed).toBe(2);
    expect(cancellation("item_paused")).toBeUndefined();
  });
});
