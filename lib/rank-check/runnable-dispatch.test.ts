import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { selectFairDueStates } from "./dispatcher-query";
import { seedKeywordDispatchStates } from "./dispatcher-state";

vi.mock("server-only", () => ({}));

const now = new Date("2026-09-04T10:00:00.000Z");
const due = "2026-09-04 09:00Z";
const archivedAt = "2026-09-01 06:00Z";

/**
 * One project, three markets and four keywords, so every raw-SQL dispatch path can be run
 * against the same fixture in a real Postgres:
 *   keyword_active   - active market, live row      -> runnable
 *   keyword_paused   - paused market                -> not runnable
 *   keyword_removed  - removed market               -> not runnable
 *   keyword_archived - active market, archived row  -> not runnable
 */
const FIXTURE = `
  CREATE TYPE "ProjectMarketStatus" AS ENUM ('active', 'paused', 'removed');
  CREATE TABLE users (id text PRIMARY KEY, "deactivatedAt" timestamptz);
  CREATE TABLE projects (
    id text PRIMARY KEY, "ownerId" text, "writeMode" text, domain text
  );
  CREATE TABLE keywords (
    id text PRIMARY KEY, "projectId" text, "locationId" text,
    device text, "archivedAt" timestamptz
  );
  CREATE TABLE project_markets (
    "projectId" text, "locationId" text, status "ProjectMarketStatus",
    PRIMARY KEY ("projectId", "locationId")
  );
  CREATE TABLE keyword_dispatch_states (
    "keywordId" text PRIMARY KEY, "nextCheckAt" timestamptz
  );
  CREATE TABLE keyword_schedules (
    id text PRIMARY KEY, "keywordId" text, frequency text, "cronExpression" text,
    timezone text, "jitterMinutes" int, "nextCheckAt" timestamptz
  );
  CREATE TABLE project_defaults (
    "projectId" text PRIMARY KEY, frequency text, "cronExpression" text,
    timezone text, "jitterMinutes" int, "nextCheckAt" timestamptz
  );

  INSERT INTO users VALUES ('owner', NULL);
  INSERT INTO projects VALUES ('project', 'owner', 'active', 'example.com');
  INSERT INTO project_defaults VALUES ('project', 'daily', NULL, 'UTC', 0, NULL);
  INSERT INTO project_markets VALUES
    ('project', 'location_active', 'active'),
    ('project', 'location_paused', 'paused'),
    ('project', 'location_removed', 'removed');
  INSERT INTO keywords VALUES
    ('keyword_active', 'project', 'location_active', 'desktop', NULL),
    ('keyword_paused', 'project', 'location_paused', 'desktop', NULL),
    ('keyword_removed', 'project', 'location_removed', 'desktop', NULL),
    ('keyword_archived', 'project', 'location_active', 'desktop', '${archivedAt}');
  INSERT INTO keyword_dispatch_states VALUES
    ('keyword_active', '${due}'),
    ('keyword_paused', '${due}'),
    ('keyword_removed', '${due}'),
    ('keyword_archived', '${due}');
`;

type RawQuery = { text: string; values: unknown[] };

let db: PGlite;

function transaction() {
  return {
    $executeRaw: async (sql: RawQuery) => (await db.query(sql.text, sql.values)).rows.length,
    $queryRaw: async (sql: RawQuery) => (await db.query(sql.text, sql.values)).rows,
  };
}

async function inTransaction<T>(callback: (tx: never) => Promise<T>) {
  await db.exec("BEGIN");
  try {
    const result = await callback(transaction() as never);
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

describe("runnable predicate in the raw dispatch SQL", () => {
  beforeAll(() => {
    db = new PGlite();
  });

  beforeEach(async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    // Reuse the engine while rebuilding all schema and fixture state per test.
    await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await db.exec(FIXTURE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => db.close());

  it("selects only the active market's live row as due", async () => {
    const rows = await inTransaction((tx) => selectFairDueStates(tx, now, 100, 100));

    expect(rows.map(({ keywordId }) => keywordId)).toEqual(["keyword_active"]);
  });

  it("returns the paused market's rows again once the market is reactivated", async () => {
    await db.exec(
      "UPDATE project_markets SET status = 'active' WHERE \"locationId\" = 'location_paused';",
    );

    const rows = await inTransaction((tx) => selectFairDueStates(tx, now, 100, 100));

    expect(rows.map(({ keywordId }) => keywordId).sort()).toEqual([
      "keyword_active",
      "keyword_paused",
    ]);
  });

  it("keeps the archived row out even after its market is reactivated", async () => {
    await db.exec("UPDATE project_markets SET status = 'active';");

    const rows = await inTransaction((tx) => selectFairDueStates(tx, now, 100, 100));

    expect(rows.map(({ keywordId }) => keywordId)).not.toContain("keyword_archived");
  });

  it("seeds dispatcher state only for runnable rows", async () => {
    await db.exec("DELETE FROM keyword_dispatch_states;");

    await seedKeywordDispatchStates(
      ["keyword_active", "keyword_paused", "keyword_removed", "keyword_archived"],
      { now },
      { $transaction: inTransaction } as never,
    );

    expect((await db.query('SELECT "keywordId" FROM keyword_dispatch_states')).rows).toEqual([
      { keywordId: "keyword_active" },
    ]);
  });
});
