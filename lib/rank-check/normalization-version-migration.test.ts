import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const expandMigrationPath = join(
  process.cwd(),
  "prisma/migrations/20260730204200_rank_check_normalization_version/migration.sql",
);
const backfillMigrationPath = join(
  process.cwd(),
  "prisma/migrations/20260730204300_rank_check_normalization_backfill/migration.sql",
);

describe("rank-check normalization version migration", () => {
  it("commits the column DDL before backfilling technical attempts", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE "public_id_v3_write_gate" (
        id BOOLEAN PRIMARY KEY,
        phase TEXT NOT NULL
      );
      INSERT INTO "public_id_v3_write_gate" (id, phase)
      VALUES (TRUE, 'public-id-v3-n1');
      CREATE TABLE rank_checks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        "requestedDepth" INTEGER
      );
      INSERT INTO rank_checks (id, status, provider, "requestedDepth")
      VALUES
        ('native_dataforseo', 'completed', 'dataforseo', NULL),
        ('native_serpapi', 'completed', 'serpapi', 50),
        ('legacy_import', 'completed', 'self-hosted-import', NULL),
        ('custom_provider', 'completed', 'custom-serp', NULL),
        ('failed_native', 'failed', 'dataforseo', NULL),
        ('running_native', 'running', 'serpapi', NULL);
    `);

    const expandMigration = readFileSync(expandMigrationPath, "utf8");
    const backfillMigration = readFileSync(backfillMigrationPath, "utf8");
    expect(expandMigration).not.toContain("UPDATE");
    expect(backfillMigration).not.toContain("ALTER TABLE");

    await database.exec(expandMigration);
    await database.exec(backfillMigration);

    const result = await database.query<{
      id: string;
      normalizationVersion: string | null;
      requestedDepth: number | null;
    }>(`
      SELECT id, "normalizationVersion", "requestedDepth"
      FROM rank_checks
      ORDER BY id
    `);

    expect(result.rows).toEqual([
      { id: "custom_provider", normalizationVersion: "v1", requestedDepth: null },
      { id: "failed_native", normalizationVersion: null, requestedDepth: null },
      { id: "legacy_import", normalizationVersion: "v1", requestedDepth: null },
      { id: "native_dataforseo", normalizationVersion: "v1", requestedDepth: null },
      { id: "native_serpapi", normalizationVersion: "v1", requestedDepth: 50 },
      { id: "running_native", normalizationVersion: null, requestedDepth: null },
    ]);

    await database.close();
  });

  it("fails closed when the write-gate row is missing", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE "public_id_v3_write_gate" (
        id BOOLEAN PRIMARY KEY,
        phase TEXT NOT NULL
      );
      CREATE TABLE rank_checks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `);
    await database.exec(readFileSync(expandMigrationPath, "utf8"));

    await expect(database.exec(readFileSync(backfillMigrationPath, "utf8"))).rejects.toThrow(
      "Rank-check normalization backfill requires the public ID v3 write gate row.",
    );

    await database.close();
  });

  it("backfills after the completed public ID v3 cleanup removed temporary artifacts", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE rank_checks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO rank_checks (id, status)
      VALUES
        ('completed_check', 'completed'),
        ('failed_check', 'failed');
    `);
    await database.exec(readFileSync(expandMigrationPath, "utf8"));

    await database.exec(readFileSync(backfillMigrationPath, "utf8"));

    const result = await database.query<{
      id: string;
      normalizationVersion: string | null;
    }>(`
      SELECT id, "normalizationVersion"
      FROM rank_checks
      ORDER BY id
    `);
    expect(result.rows).toEqual([
      { id: "completed_check", normalizationVersion: "v1" },
      { id: "failed_check", normalizationVersion: null },
    ]);

    await database.close();
  });

  it("fails closed when write-gate cleanup left the trigger function behind", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE rank_checks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE FUNCTION "enforce_public_id_v3_write_gate"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        RETURN NULL;
      END
      $function$;
    `);
    await database.exec(readFileSync(expandMigrationPath, "utf8"));

    await expect(database.exec(readFileSync(backfillMigrationPath, "utf8"))).rejects.toThrow(
      "Rank-check normalization backfill found partial public ID v3 write-gate cleanup.",
    );

    await database.close();
  });
});
