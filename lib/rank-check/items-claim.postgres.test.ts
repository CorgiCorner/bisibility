import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { claimDueRankCheckItems } from "./items-claim";

vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => undefined),
}));

type Row = Record<string, unknown>;
type WhereClause = Row & { OR?: Row[] };
type UpdateArgs = { data: Row; where: WhereClause };

/**
 * The claim reads `keywords."archivedAt"` and correlates each row against `project_markets`, so
 * the fixture carries both. Anything the claim touches must exist here or this suite stops
 * proving that the SQL runs on Postgres at all.
 */
const SCHEMA = `
  CREATE TABLE projects (id text PRIMARY KEY, domain text);
  CREATE TABLE project_markets (
    id text PRIMARY KEY, "projectId" text, "locationId" text, status text
  );
  CREATE TABLE keywords (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "locationId" text,
    device text, "archivedAt" timestamptz
  );
  CREATE TABLE rank_check_runs (
    id text PRIMARY KEY, "publicId" text, "projectId" text, "requestedCount" int,
    "selectionKind" text, trigger text, status text, "startedAt" timestamptz, "finishedAt" timestamptz,
    outcome text, "costCents" int DEFAULT 0, "cancelledCount" int DEFAULT 0,
    "completedCount" int DEFAULT 0, "deferredCount" int DEFAULT 0, "failedCount" int DEFAULT 0,
    "keywordCount" int DEFAULT 0, "skippedCount" int DEFAULT 0, "targetCount" int DEFAULT 0,
    "totalCount" int DEFAULT 0
  );
  CREATE TABLE rank_check_run_items (
    id text PRIMARY KEY, "runId" text, "keywordId" text, status text,
    "actualCostCents" int, "blockedReason" text, "claimAttempts" int DEFAULT 0,
    "claimExpiresAt" timestamptz, "finishedAt" timestamptz, "notBefore" timestamptz,
    "rankCheckId" text, "startedAt" timestamptz, "updatedAt" timestamptz
  );
`;

/** The audit writer rejects anything but a strict 24-character public-ID suffix. */
function publicId(prefix: string, seed: string) {
  return `${prefix}_${seed.padEnd(24, "x")}`;
}

const RUN_PUBLIC_ID = publicId("rcr", "run");

function assignments(data: Row, values: unknown[]) {
  return Object.entries(data)
    .map(([column, value]) => {
      if (value && typeof value === "object" && "increment" in value) {
        const step = (value as { increment: number }).increment;
        return `"${column}" = COALESCE("${column}", 0) + $${values.push(step)}`;
      }
      return `"${column}" = $${values.push(value)}`;
    })
    .join(", ");
}

function conditions(where: WhereClause, values: unknown[]): string {
  const parts = Object.entries(where).map(([column, value]) => {
    if (column === "OR") {
      const alternatives = (value as Row[]).map((clause) => `(${conditions(clause, values)})`);
      return `(${alternatives.join(" OR ")})`;
    }
    return value === null ? `"${column}" IS NULL` : `"${column}" = $${values.push(value)}`;
  });
  return parts.length === 0 ? "TRUE" : parts.join(" AND ");
}

/**
 * A Prisma-shaped client backed by real Postgres. Every write the claim performs - the claim SQL,
 * the cancellation of a row that stopped being runnable, and the run counters - lands in the
 * tables above, so a column the production code adds cannot be silently absent here.
 */
async function createFixture() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const audits: Row[] = [];
  const query = async (text: string, values: unknown[] = []) =>
    (await db.query(text, values)).rows as Row[];
  const updateMany = async (table: string, { data, where }: UpdateArgs) => {
    const values: unknown[] = [];
    const set = assignments(data, values);
    const filter = conditions(where, values);
    const updated = await query(
      `UPDATE "${table}" SET ${set} WHERE ${filter} RETURNING id`,
      values,
    );
    return { count: updated.length };
  };
  const tx = {
    $queryRaw: async (sql: { text: string; values: unknown[] }) => query(sql.text, sql.values),
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        audits.push(data);
        return data;
      },
    },
    rankCheckRun: {
      update: (args: UpdateArgs) => updateMany("rank_check_runs", args),
      updateMany: (args: UpdateArgs) => updateMany("rank_check_runs", args),
    },
    rankCheckRunItem: {
      groupBy: async ({ where }: { where: { runId: string } }) => {
        const rows = await query(
          `SELECT "keywordId", status, COUNT(*)::int AS count,
             COALESCE(SUM("actualCostCents"), 0)::int AS cost
           FROM "rank_check_run_items" WHERE "runId" = $1 GROUP BY "keywordId", status`,
          [where.runId],
        );
        return rows.map((row) => ({
          _count: { _all: row.count },
          _sum: { actualCostCents: row.cost },
          keywordId: row.keywordId,
          status: row.status,
        }));
      },
      updateMany: (args: UpdateArgs) => updateMany("rank_check_run_items", args),
    },
  };
  const database = {
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
  return { audits, database, db, query };
}

describe("first target claim SQL", () => {
  it("claims queued runs only when due and never resets the first execution time", async () => {
    const { database, db, query } = await createFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm-active', 'project', 'market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES ('kw1', '${publicId("kw", "kw1")}', 'project', 'market', 'desktop', NULL);
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 1, 'scheduled_due', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('item', 'run', 'kw1', 'queued', '2026-09-04 14:00Z');
      `);
      expect(
        (await claimDueRankCheckItems({ now: new Date("2026-09-04T10:00:00Z") }, database as never))
          .claimed,
      ).toBe(0);
      expect(await query('SELECT status, "startedAt" FROM rank_check_runs')).toEqual([
        { status: "queued", startedAt: null },
      ]);
      const first = new Date("2026-09-04T14:00:00Z");
      expect((await claimDueRankCheckItems({ now: first }, database as never)).claimed).toBe(1);
      expect(await query('SELECT status, "startedAt" FROM rank_check_runs')).toEqual([
        { status: "running", startedAt: first },
      ]);
      await db.exec(`UPDATE rank_check_run_items SET status = 'completed';
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('second', 'run', 'kw1', 'queued', '2026-09-04 15:00Z');`);
      expect(
        (await claimDueRankCheckItems({ now: new Date("2026-09-04T15:00:00Z") }, database as never))
          .claimed,
      ).toBe(1);
      expect(await query('SELECT "startedAt" FROM rank_check_runs')).toEqual([
        { startedAt: first },
      ]);
    } finally {
      await db.close();
    }
  });

  it("cancels scheduled rows whose market is archived after enqueue", async () => {
    const { audits, database, db, query } = await createFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES
          ('pm-active', 'project', 'active-market', 'active'),
          ('pm-archived', 'project', 'archived-market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES
            ('kw-runnable', '${publicId("kw", "kwrunnable")}', 'project', 'active-market',
              'desktop', NULL),
            ('kw-archived-market', '${publicId("kw", "kwarchivedmarket")}', 'project', 'archived-market',
              'desktop', NULL),
            ('kw-archived', '${publicId("kw", "kwarchived")}', 'project', 'active-market',
              'desktop', '2026-09-03 09:00Z');
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", trigger, status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 3, 'scheduled_due', 'scheduled', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES
            ('item-runnable', 'run', 'kw-runnable', 'queued', '2026-09-04 14:00Z'),
            ('item-archived-market', 'run', 'kw-archived-market', 'queued', '2026-09-04 14:00Z'),
            ('item-archived', 'run', 'kw-archived', 'queued', '2026-09-04 14:00Z');
        UPDATE project_markets SET status = 'removed' WHERE id = 'pm-archived';
      `);

      const claimed = await claimDueRankCheckItems(
        { now: new Date("2026-09-04T14:00:00Z") },
        database as never,
      );

      expect(claimed.claimed).toBe(1);
      expect(
        await query('SELECT id, status, "blockedReason" FROM rank_check_run_items ORDER BY id'),
      ).toEqual([
        { id: "item-archived", status: "cancelled", blockedReason: "keyword_archived" },
        { id: "item-archived-market", status: "cancelled", blockedReason: "market_inactive" },
        { id: "item-runnable", status: "running", blockedReason: null },
      ]);
      expect(await query('SELECT "cancelledCount" FROM rank_check_runs')).toEqual([
        { cancelledCount: 2 },
      ]);
      expect(audits.map((audit) => (audit.after as { reason: string }).reason).sort()).toEqual([
        "keyword_archived",
        "market_inactive",
      ]);
      expect(claimed.groups.flatMap((group) => group.keywordIds)).toEqual(["kw-runnable"]);
    } finally {
      await db.close();
    }
  });

  it.each(["manual", "api"])("does not claim immediate %s run items", async (trigger) => {
    const { audits, database, db, query } = await createFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm', 'project', 'market', 'removed');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES ('kw', '${publicId("kw", "immediate")}', 'project', 'market', 'desktop', NULL);
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", trigger, status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 1, 'single', '${trigger}', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('item', 'run', 'kw', 'queued', NULL);
      `);

      await expect(
        claimDueRankCheckItems({ now: new Date("2026-09-04T14:00:00Z") }, database as never),
      ).resolves.toMatchObject({ claimed: 0, groups: [] });
      expect(await query('SELECT status, "blockedReason" FROM rank_check_run_items')).toEqual([
        { status: "queued", blockedReason: null },
      ]);
      expect(audits).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
