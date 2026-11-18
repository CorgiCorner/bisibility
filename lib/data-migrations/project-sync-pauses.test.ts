import { readFileSync } from "node:fs";
import { projectSyncPausesMigration } from "@/scripts/data-migrations/20261117213100_project_sync_pauses";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("copies both disabled flags and preserves existing pause metadata on replay", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        "domainRatingEnabled" BOOLEAN NOT NULL,
        "sitemapMonitoringEnabled" BOOLEAN NOT NULL
      );
      INSERT INTO projects VALUES ('active', true, true), ('rating', false, true),
        ('sitemap', true, false), ('both', false, false);
    `);
    await db.exec(
      readFileSync("prisma/migrations/20261117213000_project_sync_pauses/migration.sql", "utf8"),
    );
    await db.exec(`
      INSERT INTO project_sync_pauses VALUES
        ('existing', 'both', 'domain_rating', '2026-11-17T00:00:00', 'actor')
    `);
    const context = { db, batchSize: 1, log: () => undefined };
    await projectSyncPausesMigration.run(context);
    const read = () =>
      db.query(
        'SELECT id, "projectId", kind, "pausedAt", "actorId" FROM project_sync_pauses ORDER BY "projectId", kind',
      );
    const before = (await read()).rows;
    expect(before).toMatchObject([
      { id: "existing", projectId: "both", kind: "domain_rating", actorId: "actor" },
      { projectId: "both", kind: "sitemap_fetch", actorId: null },
      { projectId: "rating", kind: "domain_rating", actorId: null },
      { projectId: "sitemap", kind: "sitemap_fetch", actorId: null },
    ]);
    await projectSyncPausesMigration.run(context);
    expect((await read()).rows).toEqual(before);
  } finally {
    await db.close();
  }
});
