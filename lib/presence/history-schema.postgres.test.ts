import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("applies the actual migration on disposable Postgres, enforces both keys and cascades project deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE projects (id text PRIMARY KEY);
      CREATE TABLE project_defaults ("projectId" text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE);
      INSERT INTO projects VALUES ('p'); INSERT INTO project_defaults VALUES ('p');`);
    await db.exec(
      readFileSync("prisma/migrations/20261024220000_page_indexing_history/migration.sql", "utf8"),
    );
    const day = `INSERT INTO page_indexing_days VALUES ('d','p','2026-10-25','sc-domain:example.com',1,0,0,1,2,1,NULL,'{"count":0,"entries":[]}',NOW())`;
    await db.exec(day);
    await db.exec(
      `INSERT INTO page_indexing_sitemaps VALUES ('s','p','https://example.com/sitemap.xml',NULL,false,0,'web',false,0,0,NULL,NULL,2,NOW())`,
    );
    await expect(db.exec(day.replace("'d'", "'d2'"))).rejects.toThrow(/unique/);
    await expect(
      db.exec(
        `INSERT INTO page_indexing_sitemaps SELECT 's2', "projectId",path,"parentPath","isIndex","childCount","contentType","isPending",errors,warnings,"lastSubmitted","lastDownloaded",submitted,"readAt" FROM page_indexing_sitemaps`,
      ),
    ).rejects.toThrow(/unique/);
    await db.exec("DELETE FROM projects WHERE id='p'");
    for (const table of ["page_indexing_days", "page_indexing_sitemaps"])
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
