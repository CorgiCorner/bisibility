import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const legacyFlag = ["auto", "Schedule"].join("");
const migrationDirectory = ["drop", "auto", "schedule"].join("_");
const migrationPath = join(
  process.cwd(),
  `prisma/migrations/20260716053619_${migrationDirectory}/migration.sql`,
);

describe("legacy schedule flag migration", () => {
  it("pauses disabled automatic schedules before dropping the legacy columns", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of ["keyword_schedules", "project_defaults"]) {
      const update = sql.indexOf(`UPDATE "${table}"`);
      const drop = sql.indexOf(`ALTER TABLE "${table}" DROP COLUMN "${legacyFlag}"`);

      expect(update).toBeGreaterThan(-1);
      expect(drop).toBeGreaterThan(update);
    }

    expect(sql.match(/SET "frequency" = 'paused'/g)).toHaveLength(2);
    expect(sql.match(new RegExp(`WHERE "${legacyFlag}" = false`, "g"))).toHaveLength(2);
    expect(sql.match(/AND "frequency" NOT IN \('manual', 'paused'\)/g)).toHaveLength(2);
  });
});
