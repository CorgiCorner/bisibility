import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCANNED_DIRECTORIES = ["app", "components", "lib"];
// The two instrumentation modules are the only intended loaders. They may name the SDK in a
// type-only import and in the deferred `await import(...)`, but never in a static value
// import, which would put the SDK back into the client entry and the server bootstrap.
const LOADER_FILES = ["instrumentation-client.ts", "instrumentation.ts"];
const SDK = "@sentry/nextjs";

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }

    if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      files.push(path);
    }
  }

  return files;
}

function staticValueImportsOfSdk(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.includes(SDK))
    .filter((line) => !line.trimStart().startsWith("import type"))
    .filter((line) => !line.includes("await import("))
    .filter((line) => !line.trimStart().startsWith("//"));
}

describe("error reporting stays optional", () => {
  it("keeps the reporting SDK out of application sources", () => {
    const offenders = SCANNED_DIRECTORIES.flatMap(collectSourceFiles).filter(
      (path) => staticValueImportsOfSdk(path).length > 0,
    );

    // Boundaries and library code go through lib/observability/error-reporting, so a
    // deployment with no error sink configured never loads or compiles the SDK.
    expect(offenders).toEqual([]);
  });

  it("keeps the instrumentation loaders free of static SDK imports", () => {
    const offenders = LOADER_FILES.filter((path) => staticValueImportsOfSdk(path).length > 0);

    expect(offenders).toEqual([]);
  });
});
