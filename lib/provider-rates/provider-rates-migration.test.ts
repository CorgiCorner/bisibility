import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260727010000_provider_connection_feature_rates/migration.sql",
);

describe("provider connection feature-rate migration", () => {
  it("moves existing rank-check rates into per-feature rows", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TYPE "ProviderCostFeature" AS ENUM (
        'keyword_metrics',
        'keyword_research',
        'ranked_keywords'
      );
      CREATE TABLE "projects" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "provider_cost_entries" (
        "id" TEXT PRIMARY KEY,
        "feature" "ProviderCostFeature" NOT NULL DEFAULT 'ranked_keywords'
      );
      CREATE TABLE "provider_connections" (
        "id" TEXT PRIMARY KEY,
        "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "costPerCheckCents" DECIMAL(10,4)
      );
      INSERT INTO "projects" ("id") VALUES ('project_1');
      INSERT INTO "provider_connections" ("id", "projectId", "costPerCheckCents")
      VALUES
        ('paid', 'project_1', 1.5500),
        ('free', 'project_1', 0.0000),
        ('unset', 'project_1', NULL);
    `);

    await database.exec(readFileSync(migrationPath, "utf8"));

    const result = await database.query<{
      amountCents: string;
      connectionId: string;
      feature: string;
    }>(`
      SELECT "amountCents"::text AS "amountCents", "connectionId", "feature"::text AS "feature"
      FROM "provider_connection_rates"
      ORDER BY "connectionId"
    `);

    expect(result.rows).toEqual([
      { amountCents: "0.0000", connectionId: "free", feature: "rank_check" },
      { amountCents: "1.5500", connectionId: "paid", feature: "rank_check" },
    ]);
    await database.close();
  });
});
