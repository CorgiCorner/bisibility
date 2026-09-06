import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { runStartSemanticsMigration } from "./20260904210000_run_start_semantics";

describe("run start semantics data migration", () => {
  it("repairs only active starts, preserves claims and launch times, and is idempotent", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE rank_check_runs (
          id text PRIMARY KEY, status text NOT NULL,
          "startedAt" timestamptz, "launchedAt" timestamptz, "updatedAt" timestamptz
        );
        CREATE TABLE rank_checks (id text PRIMARY KEY, "startedAt" timestamptz, "checkedAt" timestamptz);
        CREATE TABLE rank_check_run_items (
          id text PRIMARY KEY, "runId" text, status text, "rankCheckId" text, "startedAt" timestamptz
        );
        INSERT INTO rank_check_runs
        SELECT id, status, '2026-09-04 00:00Z', '2026-09-04 00:00Z', '2026-09-04 00:00Z'
        FROM (VALUES ('a_waiting', 'running'), ('b_claimed', 'running'),
          ('c_started', 'running'), ('d_preallocated', 'running'),
          ('e_terminal', 'completed'), ('f_skipped', 'running'),
          ('g_cancelled_preallocated', 'running')) AS rows(id, status);
        INSERT INTO rank_checks VALUES ('check', '2026-09-04 00:00Z', '2026-09-04 00:00Z');
        INSERT INTO rank_check_run_items VALUES
          ('waiting', 'a_waiting', 'queued', NULL, NULL),
          ('claimed', 'b_claimed', 'running', NULL, '2026-09-04 10:00Z'),
          ('started', 'c_started', 'completed', 'check', '2026-09-04 09:00Z'),
          ('later', 'c_started', 'running', NULL, '2026-09-04 11:00Z'),
          ('preallocated', 'd_preallocated', 'queued', 'check', NULL),
          ('skipped', 'f_skipped', 'skipped', NULL, NULL),
          ('cancelled_preallocated', 'g_cancelled_preallocated', 'cancelled', 'check', NULL);
      `);
      const context = {
        batchSize: 2,
        db: { query: (sql: string, values?: readonly unknown[]) => db.query<Record<string, unknown>>(sql, values ? [...values] : []) },
        log: () => undefined,
      };
      await runStartSemanticsMigration.run(context);
      const result = await db.query<{ id: string; status: string; start: string | null }>(`
        SELECT id, status, to_char("startedAt" AT TIME ZONE 'UTC', 'HH24:MI') AS start
        FROM rank_check_runs ORDER BY id
      `);
      expect(result.rows).toEqual([
        { id: "a_waiting", status: "queued", start: null },
        { id: "b_claimed", status: "running", start: "10:00" },
        { id: "c_started", status: "running", start: "09:00" },
        { id: "d_preallocated", status: "queued", start: null },
        { id: "e_terminal", status: "completed", start: "00:00" },
        { id: "f_skipped", status: "queued", start: null },
        { id: "g_cancelled_preallocated", status: "queued", start: null },
      ]);
      const before = await db.query("SELECT * FROM rank_check_runs ORDER BY id");
      await runStartSemanticsMigration.run(context);
      expect((await db.query("SELECT * FROM rank_check_runs ORDER BY id")).rows).toEqual(before.rows);
      expect((await db.query(`SELECT COUNT(*)::int AS count FROM rank_check_runs WHERE "launchedAt" = '2026-09-04 00:00Z'`)).rows).toEqual([{ count: 7 }]);
      expect((await db.query("SELECT COUNT(*)::int AS count FROM rank_check_run_items")).rows).toEqual([{ count: 7 }]);
    } finally {
      await db.close();
    }
  });
});
