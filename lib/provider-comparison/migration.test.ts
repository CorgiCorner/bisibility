import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("additive comparison schema enforces tenant custody, request deduplication, immutable scope and one CAS winner", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE keywords(id TEXT PRIMARY KEY);
      CREATE TABLE rank_checks(id TEXT PRIMARY KEY); CREATE TABLE keyword_schedules(id TEXT PRIMARY KEY);
      INSERT INTO projects VALUES('a'),('b'); INSERT INTO users VALUES('actor'); INSERT INTO keywords VALUES('keyword');
      INSERT INTO rank_checks VALUES('existing-history'); INSERT INTO keyword_schedules VALUES('existing-schedule');`);
    await db.exec(
      await readFile(
        new URL(
          "../../prisma/migrations/20261014212600_provider_comparison_requests/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const preview = (id: string, projectId: string) =>
      db.query(
        `INSERT INTO provider_comparison_previews(id,"projectId","actorId","keywordId",snapshot,"sourceHash","expiresAt") VALUES($1,$2,'actor','keyword','{"version":1}','hash',NOW()+INTERVAL '5 minutes')`,
        [id, projectId],
      );
    const run = (id: string, projectId: string, key: string, previewId: string) =>
      db.query(
        `INSERT INTO provider_comparison_runs(id,"projectId","actorId","keywordId","requestKey","previewId",snapshot,"sourceHash") VALUES($1,$2,'actor','keyword',$3,$4,'{"version":1}','hash')`,
        [id, projectId, key, previewId],
      );
    await preview("pa", "a");
    await preview("pb", "b");
    await run("ra", "a", "request", "pa");
    await expect(run("duplicate", "a", "request", "pa")).rejects.toThrow(/unique/);
    await run("rb", "b", "request", "pb");
    await expect(run("cross-preview", "b", "other", "pa")).rejects.toThrow(/foreign key/);
    const side = (id: string, projectId: string, runId: string, provider = "dataforseo") =>
      db.query(
        `INSERT INTO provider_comparison_sides(id,"projectId","runId",provider,"connectionId") VALUES($1,$2,$3,$4,'connection')`,
        [id, projectId, runId, provider],
      );
    await side("side", "a", "ra");
    await expect(side("cross-side", "b", "ra", "serpapi")).rejects.toThrow(/foreign key/);
    await expect(
      db.query(`UPDATE provider_comparison_runs SET snapshot='{"version":2}' WHERE id='ra'`),
    ).rejects.toThrow(/immutable/);
    await db.query(`UPDATE provider_comparison_sides SET "customerCostCents"=2.6 WHERE id='side'`);
    expect(
      (
        await db.query(
          `SELECT "customerCostCents"::text AS charged FROM provider_comparison_sides WHERE id='side'`,
        )
      ).rows,
    ).toEqual([{ charged: "2.6000" }]);
    await expect(
      db.query(`UPDATE provider_comparison_sides SET "customerCostCents"=-1 WHERE id='side'`),
    ).rejects.toThrow(/check constraint/);
    const attempts = await Promise.all(
      ["claim-a", "claim-b"].map((token) =>
        db.query(
          `UPDATE provider_comparison_sides SET status='claimed',"claimToken"=$1 WHERE id='side' AND status='queued' RETURNING id`,
          [token],
        ),
      ),
    );
    expect(attempts.reduce((sum, result) => sum + result.rows.length, 0)).toBe(1);
    await db.query(`UPDATE provider_comparison_sides SET status='unknown' WHERE id='side'`);
    expect(
      (
        await db.query(
          `UPDATE provider_comparison_sides SET status='claimed' WHERE id='side' AND status='queued' RETURNING id`,
        )
      ).rows,
    ).toEqual([]);
    expect((await db.query(`SELECT id FROM rank_checks`)).rows).toEqual([
      { id: "existing-history" },
    ]);
    expect((await db.query(`SELECT id FROM keyword_schedules`)).rows).toEqual([
      { id: "existing-schedule" },
    ]);
    await db.query(`DELETE FROM projects WHERE id='a'`);
    expect((await db.query(`SELECT "projectId" FROM provider_comparison_sides`)).rows).toEqual([]);
    expect((await db.query(`SELECT id FROM provider_comparison_runs`)).rows).toEqual([
      { id: "rb" },
    ]);
  } finally {
    await db.close();
  }
}, 20_000);
