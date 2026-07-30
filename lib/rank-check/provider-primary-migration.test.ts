import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260726071500_drop_provider_primary/migration.sql",
);

describe("provider primary migration", () => {
  it("preserves the flagged primary when existing priorities collide", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE "provider_connections" (
        "id" TEXT PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "isPrimary" BOOLEAN NOT NULL DEFAULT false,
        "priority" INTEGER NOT NULL DEFAULT 100
      );
      INSERT INTO "provider_connections"
        ("id", "projectId", "kind", "provider", "isPrimary", "priority")
      VALUES
        ('first', 'project_1', 'serp', 'dataforseo', false, 0),
        ('second', 'project_1', 'serp', 'serpapi', true, 0);
    `);

    await database.exec(readFileSync(migrationPath, "utf8"));

    const result = await database.query<{ id: string; priority: number }>(`
      SELECT "id", "priority"
      FROM "provider_connections"
      WHERE "projectId" = 'project_1' AND "kind" = 'serp'
      ORDER BY "priority" ASC, "provider" ASC
    `);
    const columns = await database.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'provider_connections'
    `);

    expect(result.rows).toEqual([
      { id: "second", priority: 0 },
      { id: "first", priority: 1 },
    ]);
    expect(columns.rows.map((column) => column.column_name)).not.toContain("isPrimary");
    await database.close();
  });
});
