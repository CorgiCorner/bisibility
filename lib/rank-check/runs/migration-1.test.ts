import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const previous = "20260831020000_search_import_planning_provenance";
const migration = "20260902030000_rank_check_runs";
const sql = readFileSync(
  join(process.cwd(), "prisma/migrations", migration, "migration.sql"),
  "utf8",
);

describe("rank check runs migration", () => {
  it("uses a later maintenance-window timestamp", () => {
    expect(migration.localeCompare(previous)).toBeGreaterThan(0);
    expect(migration.slice(8, 12)).toBe("0300");
    const hhmm = Number(migration.slice(8, 12));
    expect(hhmm < 800 || hhmm > 1900).toBe(true);
  });

  it("creates the run, item, and schedule tables with required uniqueness", () => {
    for (const table of ["rank_check_runs", "rank_check_run_items", "check_schedules"])
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "rank_check_runs_projectId_idempotencyKey_key" ON "rank_check_runs"("projectId", "idempotencyKey")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "rank_check_run_items_runId_keywordId_key" ON "rank_check_run_items"("runId", "keywordId")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "check_schedules_one_default_per_project" ON "check_schedules" ("projectId") WHERE "isDefault" = true;',
    );
    expect(sql).toContain('"claimExpiresAt" TIMESTAMP(3)');
    expect(sql).toContain('"claimAttempts" INTEGER NOT NULL DEFAULT 0');
  });

  it("adds nullable foreign keys to existing tables", () => {
    expect(sql).toMatch(/ALTER TABLE "keywords" ADD COLUMN\s+"checkScheduleId" TEXT;/);
    expect(sql).toMatch(/ALTER TABLE "rank_checks" ADD COLUMN\s+"runId" TEXT;/);
    expect(sql).toMatch(/ALTER TABLE "queued_rank_check_batches" ADD COLUMN\s+"runId" TEXT;/);
  });

  it("is forward-only and contains no pasted transcript markers", () => {
    expect(sql).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE)\b/im);
    expect(sql).not.toMatch(/^\s*\d+\|/m);
  });
});
