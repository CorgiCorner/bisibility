import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, expect, it } from "vitest";
import { defaultUsageDisplayOptions, usageDisplayDocumentSchema } from "./schema";

const migration = readFileSync(
  "prisma/migrations/20261013221300_project_usage_display/migration.sql",
  "utf8",
);
const db = new PGlite();
beforeEach(async () => {
  await db.exec(`DROP TABLE IF EXISTS project_defaults; DROP TABLE IF EXISTS projects;
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE project_defaults ("projectId" text UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      timezone text DEFAULT 'UTC', "serpDepth" int DEFAULT 100);
    INSERT INTO projects VALUES ('A'), ('B');
    INSERT INTO project_defaults("projectId", timezone, "serpDepth") VALUES ('A', 'Europe/Warsaw', 200), ('B', 'UTC', 100);`);
  await db.exec(migration);
});
afterAll(() => db.close());
const document = { version: 1, revision: 1, options: defaultUsageDisplayOptions };

it("keeps existing project defaults and does not backfill browser/user settings", async () => {
  const { rows } = await db.query(
    `SELECT d.timezone, d."serpDepth", p."usageDisplaySettings" FROM project_defaults d JOIN projects p ON p.id=d."projectId" WHERE p.id='A'`,
  );
  expect(rows).toEqual([{ timezone: "Europe/Warsaw", serpDepth: 200, usageDisplaySettings: null }]);
});

it("persists a validated document for only its project and preserves cascade ownership", async () => {
  await db.query(`UPDATE projects SET "usageDisplaySettings"=$1::jsonb WHERE id='A'`, [
    JSON.stringify(document),
  ]);
  const { rows } = await db.query<{ projectId: string; usageDisplaySettings: unknown }>(
    `SELECT id AS "projectId", "usageDisplaySettings" FROM projects ORDER BY id`,
  );
  expect(rows[0].usageDisplaySettings).toEqual(document);
  expect(rows[1].usageDisplaySettings).toBeNull();
  await db.exec(`DELETE FROM projects WHERE id='A'`);
  expect((await db.query(`SELECT "projectId" FROM project_defaults`)).rows).toEqual([
    { projectId: "B" },
  ]);
});

it.each([
  { ...document, version: 2 },
  { ...document, revision: 0 },
  { ...document, revision: 1.5 },
  { ...document, revision: "1" },
  { ...document, revision: 2147483648 },
  { version: 1 },
  { ...document, ownerId: "viewer" },
  { ...document, options: { ...document.options, moneyDisplay: "EUR" } },
  { ...document, options: { ...document.options, moneyFractionDigits: 5 } },
  { ...document, options: { ...document.options, quantityFractionDigits: "4" } },
  { ...document, options: { ...document.options, exchangeRate: 1.2 } },
  [],
])(
  "database and application both reject unbounded or future display documents",
  async (invalid) => {
    expect(usageDisplayDocumentSchema.safeParse(invalid).success).toBe(false);
    await expect(
      db.query(`UPDATE projects SET "usageDisplaySettings"=$1::jsonb WHERE id='A'`, [
        JSON.stringify(invalid),
      ]),
    ).rejects.toThrow();
  },
);
