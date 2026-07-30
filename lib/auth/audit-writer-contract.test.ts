import { readdirSync, readFileSync } from "node:fs";
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
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

describe("audit writer contract", () => {
  it("routes every application audit write through writeAudit", () => {
    const directWriters = sourceRoots
      .flatMap(sourceFiles)
      .filter((file) => /\bauditLog\.create\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));

    expect(directWriters).toEqual(["lib/auth/audit.ts"]);
  });
});
