import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const original = "20260828201000_search_data_sync_settings";
const repair = "20260828220000_repair_search_request_usage";
const sql = readFileSync(join(process.cwd(), "prisma/migrations", repair, "migration.sql"), "utf8");

describe("search request usage repair migration", () => {
  it("contains no pasted transcript line markers", () => {
    expect(sql).not.toMatch(/^\s*\d+\|/m);
    expect(sql).not.toMatch(/^\s*(?:L|line)\s*\d+[:|]/im);
  });

  it("is forward-only and repairs every required ledger column", () => {
    expect(repair.localeCompare(original)).toBeGreaterThan(0);
    for (const column of [
      "dimensions",
      "startDate",
      "endDate",
      "startRow",
      "rowLimit",
      "returnedRows",
      "capHit",
      "dataState",
      "searchType",
      "source",
      "persistedAt",
    ])
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
  });

  it("keeps legacy requests non-qualifying before enforcing required fields", () => {
    expect(sql).toContain('"startDate" = COALESCE("startDate", "attemptedAt"::date)');
    expect(sql).toContain(`"dimensions" = COALESCE("dimensions", '')`);
    expect(sql).toContain(`"dataState" = 'legacy'`);
    expect(sql).toContain('"persistedAt" = NULL');
    for (const column of [
      "dimensions",
      "startDate",
      "endDate",
      "startRow",
      "rowLimit",
      "dataState",
      "searchType",
      "source",
    ])
      expect(sql).toContain(`ALTER COLUMN "${column}" SET NOT NULL`);
  });
});
