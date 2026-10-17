import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("adds an optional project TTL without changing existing rows and enforces bounds", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE projects (id TEXT PRIMARY KEY); CREATE TABLE agent_reports (id TEXT PRIMARY KEY); INSERT INTO projects VALUES ('existing');",
    );
    await db.exec(
      await readFile("prisma/migrations/20261016190000_project_data_cache/migration.sql", "utf8"),
    );
    expect((await db.query('SELECT "lookupCacheTtlSeconds" FROM projects')).rows).toEqual([
      { lookupCacheTtlSeconds: null },
    ]);
    await db.exec('UPDATE projects SET "lookupCacheTtlSeconds" = 86400');
    await expect(db.exec('UPDATE projects SET "lookupCacheTtlSeconds" = 0')).rejects.toThrow();
    await expect(db.exec('UPDATE projects SET "lookupCacheTtlSeconds" = 604801')).rejects.toThrow();
  } finally {
    await db.close();
  }
});
