import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readGuardSourcePaths } from "./source-file-discovery";

const temporaryRoots: string[] = [];
const expectedPaths = [
  "lib/actions/use-server-exports.test.ts",
  "lib/ai-tracking/client-server-boundary.ts",
];
const roots = ["lib/ai-tracking", "missing", "lib/actions"];
const matchesSource = (file: string) => expectedPaths.includes(file);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("guard source file discovery", () => {
  it("discovers expected source files in the checkout", () => {
    expect(readGuardSourcePaths(process.cwd(), roots, matchesSource)).toEqual(expectedPaths);
  });

  it("discovers the same source paths in a snapshot without Git metadata", () => {
    const snapshot = mkdtempSync(join(tmpdir(), "guard-source-snapshot-"));
    temporaryRoots.push(snapshot);
    for (const file of [...expectedPaths].reverse()) {
      const target = join(snapshot, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "export const fixture = true;\n");
    }
    writeFileSync(join(snapshot, "lib/actions/ignored.txt"), "not a source file\n");

    expect(existsSync(join(snapshot, ".git"))).toBe(false);
    expect(readGuardSourcePaths(snapshot, roots, matchesSource)).toEqual(expectedPaths);
  });
});
