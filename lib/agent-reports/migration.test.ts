import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("applies the workspace migration, enforces project isolation FKs and cascades deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE TYPE "ProviderCostFeature" AS ENUM ('rank_check'); CREATE TABLE projects (id TEXT PRIMARY KEY);`,
    );
    const sql = await readFile(
      new URL(
        "../../prisma/migrations/20261002070000_agent_workspace/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(
      `INSERT INTO projects VALUES ('project1'); INSERT INTO project_contexts ("projectId",business,"updatedAt") VALUES ('project1','Acme',NOW());`,
    );
    await db.query(
      `INSERT INTO agent_reports (id,"publicId","projectId",kind,title,body,provenance) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        "r1",
        "agr_abcdefghijklmnopqrstuvwx",
        "project1",
        "site_audit",
        "Audit",
        { statusCode: 200 },
        {},
      ],
    );
    expect((await db.query(`SELECT body FROM agent_reports`)).rows).toEqual([
      { body: { statusCode: 200 } },
    ]);
    expect(
      (
        await db.query(
          `SELECT convalidated AS validated, pg_get_constraintdef(oid, false) AS definition FROM pg_constraint WHERE conname='agent_reports_public_id_contract_format'`,
        )
      ).rows,
    ).toEqual([
      { validated: true, definition: `CHECK (("publicId" ~ '^agr_[a-z][a-z0-9]{23}$'::text))` },
    ]);
    for (const invalidId of [
      "internal-report",
      "agr_legacy",
      "kw_abcdefghijklmnopqrstuvwx",
      "agr_Abcdefghijklmnopqrstuvwx",
    ]) {
      await expect(db.query(`UPDATE agent_reports SET "publicId"=$1`, [invalidId])).rejects.toThrow(
        "agent_reports_public_id_contract_format",
      );
    }
    await expect(
      db.query(`INSERT INTO project_contexts ("projectId","updatedAt") VALUES ('other',NOW())`),
    ).rejects.toThrow();
    await expect(
      db.query(`UPDATE agent_reports SET body=$1`, [{ analysis: "x".repeat(524289) }]),
    ).rejects.toThrow();
    await db.exec(`DELETE FROM projects WHERE id='project1';`);
    expect((await db.query(`SELECT * FROM agent_reports`)).rows).toEqual([]);
    expect((await db.query(`SELECT * FROM project_contexts`)).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 10000);
