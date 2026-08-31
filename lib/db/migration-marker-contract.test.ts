import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsRoot = join(process.cwd(), "prisma/migrations");
const migrationPaths = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
  .filter(existsSync)
  .sort();

const transcriptMarker = /^\s*(?:\d+\||(?:L|line)\s*\d+[:|])/im;

describe("Prisma migration artifact contract", () => {
  it("scans every migration SQL file for pasted transcript markers", () => {
    expect(migrationPaths.length).toBeGreaterThan(0);
    const contaminated = migrationPaths
      .filter((path) => transcriptMarker.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(contaminated).toEqual([]);
  });
});
