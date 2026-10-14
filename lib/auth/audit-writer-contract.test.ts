import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const sourceRoots = [resolve(root, "app"), resolve(root, "components"), resolve(root, "lib")];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") return [];
      return sourceFiles(path);
    }
    if (
      ![".ts", ".tsx"].includes(extname(entry.name)) ||
      entry.name.includes(".test.") ||
      /[.-]test-fixtures?\.[cm]?[jt]sx?$/u.test(entry.name)
    )
      return [];
    return [path];
  });
}

describe("audit writer contract", () => {
  it("excludes explicit test fixtures while retaining production fixture-named writers", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "audit-scope-"));
    try {
      for (const name of [
        "owned.postgres.test-fixture.ts",
        "owned.test-fixtures.ts",
        "postgres-test-fixture.ts",
        "FixtureCard.tsx",
        "fixture-writer.ts",
        "business.test.ts",
      ])
        writeFileSync(resolve(directory, name), "export const write = () => auditLog.create({});");
      expect(
        sourceFiles(directory)
          .map((path) => relative(directory, path))
          .sort(),
      ).toEqual(["FixtureCard.tsx", "fixture-writer.ts"]);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
  it("routes every application audit write through writeAudit", () => {
    const directWriters = sourceRoots
      .flatMap(sourceFiles)
      .filter((file) => /\bauditLog\.create\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));

    expect(directWriters).toEqual(["lib/auth/audit.ts"]);
  });
});
