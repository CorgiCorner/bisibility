import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("keeps deleted run idempotency and ranking data while excluding it from history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE rank_check_runs (id TEXT PRIMARY KEY, "idempotencyKey" TEXT UNIQUE);
      CREATE TABLE rank_checks (id TEXT PRIMARY KEY, "runId" TEXT REFERENCES rank_check_runs(id), position INTEGER);
      INSERT INTO rank_check_runs VALUES ('run_1', 'request_1');
      INSERT INTO rank_checks VALUES ('check_1', 'run_1', 3);`);
    await db.exec(
      readFileSync(
        "prisma/migrations/20260909190430_rank_check_run_history_deletion/migration.sql",
        "utf8",
      ),
    );
    expect(
      (await db.query('SELECT id FROM rank_check_runs WHERE "deletedAt" IS NULL')).rows,
    ).toHaveLength(1);
    await db.exec('UPDATE rank_check_runs SET "deletedAt" = CURRENT_TIMESTAMP');
    expect(
      (await db.query('SELECT id FROM rank_check_runs WHERE "deletedAt" IS NULL')).rows,
    ).toHaveLength(0);
    expect((await db.query("SELECT position FROM rank_checks")).rows).toEqual([{ position: 3 }]);
    await expect(
      db.exec("INSERT INTO rank_check_runs (id, \"idempotencyKey\") VALUES ('run_2', 'request_1')"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
