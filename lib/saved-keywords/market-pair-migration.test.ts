import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260814021500_saved_keyword_market_pair/migration.sql"),
  "utf8",
);

describe("saved keyword market pair migration", () => {
  it("preserves legacy rows while backfilling pair columns before the scoped unique key", () => {
    expect(migration).toContain('LEFT JOIN "locations" AS location');
    expect(migration).toContain('location."canonicalKey" = saved."location"');
    expect(migration).toContain("NULLIF(LOWER(SPLIT_PART(saved.\"location\", '@', 2)), '')");
    expect(migration).toContain("'und'");
    expect(migration).not.toContain("RAISE EXCEPTION");
    expect(migration).toMatch(/ALTER COLUMN "countryCode" SET NOT NULL/);
    expect(migration).toMatch(/ALTER COLUMN "languageCode" SET NOT NULL/);
    expect(migration).toContain(
      '("projectId", "normalizedText", "location", "countryCode", "languageCode")',
    );
  });

  it("does not alter tracked keyword or Temporal storage", () => {
    expect(migration).not.toMatch(/ALTER TABLE "keywords"/);
    expect(migration).not.toMatch(/temporal/i);
  });
});
