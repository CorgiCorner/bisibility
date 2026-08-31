import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = "20260831020000_search_import_planning_provenance";

describe("search import planning provenance migration", () => {
  it("uses an off-hours timestamp and adds nullable compatibility fields", () => {
    const hour = Number(migration.slice(8, 10));
    expect(hour < 8 || hour >= 19).toBe(true);

    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations", migration, "migration.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "firstDataDate" DATE');
    expect(sql).toContain('ADD COLUMN "firstDataDetectedAt" TIMESTAMP(3)');
    expect(sql).toContain('ADD COLUMN "historyBoundarySource" TEXT');
    expect(sql).toContain('ADD COLUMN "waitingForFirstDataAt" TIMESTAMP(3)');
    expect(sql).toContain('ADD COLUMN "failureClass" TEXT');
    expect(sql).not.toContain("NOT NULL");
  });
});
