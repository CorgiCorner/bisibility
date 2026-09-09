import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationName = "20260905210000_competitor_membership_contract";
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations", migrationName, "migration.sql"),
  "utf8",
);

const legacySchema = `
  CREATE TABLE "projects" ("id" TEXT PRIMARY KEY);
  CREATE TABLE "project_markets" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL);
  CREATE TABLE "competitors" (
    "id" TEXT PRIMARY KEY,
    "publicId" TEXT NOT NULL UNIQUE,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    UNIQUE ("projectId", "domain")
  );
`;

type LegacyCompetitorRow = {
  createdAt: Date;
  updatedAt: Date;
};

async function legacyDatabase() {
  const database = new PGlite();
  await database.exec(legacySchema);
  await database.exec(`
    INSERT INTO "projects" ("id") VALUES ('project_legacy');
    INSERT INTO "competitors" (
      "id", "publicId", "projectId", "domain", "label", "createdAt", "updatedAt"
    ) VALUES (
      'competitor_legacy', 'cmp_legacyyyyyyyyyyyyyyyyyyy', 'project_legacy',
      'legacy.example.com', 'Legacy', '2026-09-01 06:00:00Z', '2026-09-01 06:30:00Z'
    );
  `);
  return database;
}

describe("competitor membership migration", () => {
  it("keeps the Prisma schema and SQL migration aligned while backfilling legacy competitors", async () => {
    expect(schema).toContain("enum CompetitorSource");
    expect(schema).toContain("enum CompetitorScopePolicy");
    expect(schema).toContain("enum CompetitorMarketOverrideMode");
    expect(schema).toContain("enum CompetitorSetupOutcome");
    expect(schema).toMatch(/aliases\s+String\[\]\s+@default\(\[\]\)/);
    expect(schema).toMatch(/source\s+CompetitorSource\s+@default\(manual\)/);
    expect(schema).toMatch(/evidence\s+Json\?/);
    expect(schema).toMatch(/scopePolicy\s+CompetitorScopePolicy\s+@default\(all_markets\)/);
    expect(schema).toMatch(/@@unique\(\[competitorId, projectMarketId\]\)/);
    expect(schema).toMatch(/@@unique\(\[projectId, domain\]\)/);
    expect(schema).toMatch(/competitorSetupOutcome\s+CompetitorSetupOutcome\?/);
    expect(schema).toMatch(/competitorSetupDecidedAt\s+DateTime\?/);
    expect(migration).toContain("CREATE TYPE \"CompetitorSource\" AS ENUM ('suggested', 'manual')");
    expect(migration).toContain('ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]');
    expect(migration).toContain(
      'ADD COLUMN "source" "CompetitorSource" NOT NULL DEFAULT \'manual\'',
    );
    expect(migration).toContain('ADD COLUMN "evidence" JSONB');
    expect(migration).toContain(
      'ADD COLUMN "scopePolicy" "CompetitorScopePolicy" NOT NULL DEFAULT \'all_markets\'',
    );
    expect(migration).toContain('CREATE TABLE "competitor_market_overrides"');
    expect(migration).toContain('CREATE TABLE "competitor_suggestion_dismissals"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "competitor_market_overrides_competitorId_projectMarketId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "competitor_suggestion_dismissals_projectId_domain_key"',
    );

    const database = await legacyDatabase();
    try {
      const before = await database.query<LegacyCompetitorRow>(
        'SELECT * FROM "competitors" WHERE "id" = \'competitor_legacy\'',
      );
      await database.exec(migration);
      const after = await database.query<LegacyCompetitorRow>(
        'SELECT * FROM "competitors" WHERE "id" = \'competitor_legacy\'',
      );

      expect(after.rows).toEqual([
        expect.objectContaining({
          aliases: [],
          createdAt: before.rows[0]?.createdAt,
          domain: "legacy.example.com",
          evidence: null,
          label: "Legacy",
          projectId: "project_legacy",
          publicId: "cmp_legacyyyyyyyyyyyyyyyyyyy",
          scopePolicy: "all_markets",
          source: "manual",
          updatedAt: before.rows[0]?.updatedAt,
        }),
      ]);
    } finally {
      await database.close();
    }
  });

  it("enforces one override per competitor and project market in the database", async () => {
    const database = await legacyDatabase();
    try {
      await database.exec(migration);
      await database.exec(`
        INSERT INTO "project_markets" ("id", "projectId") VALUES ('market_flanders', 'project_legacy');
        INSERT INTO "competitor_market_overrides" (
          "id", "competitorId", "projectMarketId", "mode", "createdAt", "updatedAt"
        ) VALUES (
          'override_first', 'competitor_legacy', 'market_flanders', 'excluded',
          '2026-09-01 07:00:00Z', '2026-09-01 07:00:00Z'
        );
      `);

      await expect(
        database.exec(`
          INSERT INTO "competitor_market_overrides" (
            "id", "competitorId", "projectMarketId", "mode", "createdAt", "updatedAt"
          ) VALUES (
            'override_duplicate', 'competitor_legacy', 'market_flanders', 'excluded',
            '2026-09-01 07:00:00Z', '2026-09-01 07:00:00Z'
          );
        `),
      ).rejects.toThrow(/unique/i);
    } finally {
      await database.close();
    }
  });
});
