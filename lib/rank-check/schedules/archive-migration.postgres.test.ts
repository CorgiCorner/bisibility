import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("preserves schedule links and run results while enforcing inactive archives", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE check_schedules (id text PRIMARY KEY, "projectId" text, enabled boolean, "isDefault" boolean);
      CREATE TABLE rank_check_runs (id text PRIMARY KEY, "checkScheduleId" text REFERENCES check_schedules(id) ON DELETE SET NULL);
      CREATE TABLE rank_checks (id text PRIMARY KEY, "runId" text REFERENCES rank_check_runs(id), position integer);
      INSERT INTO check_schedules VALUES ('s', 'p', true, true);
      INSERT INTO rank_check_runs VALUES ('r', 's');
      INSERT INTO rank_checks VALUES ('c', 'r', 7);`);
    await db.exec(
      await readFile(
        new URL(
          "../../../prisma/migrations/20260908190000_archive_check_schedules/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await expect(
      db.exec(`UPDATE check_schedules SET "archivedAt" = now() WHERE id = 's'`),
    ).rejects.toThrow();
    await db.exec(
      `UPDATE check_schedules SET "archivedAt" = now(), enabled = false, "isDefault" = false WHERE id = 's'`,
    );
    expect(
      (
        await db.query(
          `SELECT "checkScheduleId", position FROM rank_check_runs r JOIN rank_checks c ON c."runId" = r.id`,
        )
      ).rows,
    ).toEqual([{ checkScheduleId: "s", position: 7 }]);
    await expect(
      db.exec(`UPDATE check_schedules SET enabled = true WHERE id = 's'`),
    ).rejects.toThrow();
    await expect(
      db.exec(`UPDATE check_schedules SET "isDefault" = true WHERE id = 's'`),
    ).rejects.toThrow();
    await db.exec(`UPDATE check_schedules SET "archivedAt" = null WHERE id = 's'`);
    expect((await db.query(`SELECT enabled, "isDefault" FROM check_schedules`)).rows).toEqual([
      { enabled: false, isDefault: false },
    ]);
  } finally {
    await db.close();
  }
});
