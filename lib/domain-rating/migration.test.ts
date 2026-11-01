import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("defaults tracking on, claims a day once, and cascades history on project deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE projects (id TEXT PRIMARY KEY); INSERT INTO projects VALUES ('p1');",
    );
    await db.exec(
      readFileSync("prisma/migrations/20261028205004_domain_rating_history/migration.sql", "utf8"),
    );
    expect(
      (
        await db.query<{ domainRatingEnabled: boolean }>(
          'SELECT "domainRatingEnabled" FROM projects',
        )
      ).rows[0].domainRatingEnabled,
    ).toBe(true);
    const insert = `INSERT INTO domain_rating_checks (id, "projectId", domain, day, source) VALUES ($1, 'p1', 'example.com', '2026-10-28', 'own') ON CONFLICT ("projectId",domain,day) DO NOTHING RETURNING id`;
    expect((await db.query(insert, ["a"])).rows).toHaveLength(1);
    expect((await db.query(insert, ["b"])).rows).toHaveLength(0);
    await expect(db.exec("UPDATE domain_rating_checks SET rating = 101")).rejects.toThrow();
    await db.exec("UPDATE domain_rating_checks SET rating = 0");
    await db.exec("DELETE FROM projects");
    expect((await db.query("SELECT * FROM domain_rating_checks")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});
