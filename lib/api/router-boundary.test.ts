import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const appRoot = resolve(root, "app");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("API router boundary", () => {
  it("keeps the MCP preauthenticated API entry point out of app imports", () => {
    // Narrow signal only: this scans app/**/*.ts(x) for the exact exported identifier.
    // It does not resolve aliases or wrappers, follow imports, or inspect callers outside app/.
    const internalImports = sourceFiles(appRoot)
      .filter((file) => readFileSync(file, "utf8").includes("handleMcpPreauthenticatedApiRequest"))
      .map((file) => relative(root, file));

    expect(internalImports).toEqual([]);
  });
});
