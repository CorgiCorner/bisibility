import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const TOP_LEVEL_ROOTS = [
  "instrumentation-client.ts",
  "instrumentation.ts",
  "mdx-components.tsx",
  "middleware.ts",
];

function isProductionSource(file: string) {
  return (
    SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
    !/\.(?:test|spec|stories)\.[^.]+$/.test(file) &&
    !file.includes("/__tests__/") &&
    !file.endsWith(".d.ts")
  );
}

function listSources(directory: string): string[] {
  const absoluteDirectory = path.join(ROOT, directory);
  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const relative = path.posix.join(directory, entry);
    return statSync(path.join(ROOT, relative)).isDirectory()
      ? listSources(relative)
      : isProductionSource(relative)
        ? [relative]
        : [];
  });
}

function resolveImport(importer: string, specifier: string, sources: Set<string>) {
  let candidate: string;
  if (specifier.startsWith("@/")) {
    candidate = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  } else {
    return null;
  }

  const candidates = [
    candidate,
    ...SOURCE_EXTENSIONS.map((extension) => `${candidate}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.posix.join(candidate, `index${extension}`)),
  ];
  return candidates.find((source) => sources.has(source)) ?? null;
}

function importsFor(source: string, sources: Set<string>) {
  const contents = readFileSync(path.join(ROOT, source), "utf8");
  const imports = ts.preProcessFile(contents, true, true).importedFiles;
  return imports
    .map(({ fileName }) => resolveImport(source, fileName, sources))
    .filter((resolved): resolved is string => resolved !== null);
}

function isProductionRoot(source: string) {
  if (TOP_LEVEL_ROOTS.includes(source)) return true;
  if (source.startsWith("lib/actions/")) return true;
  return (
    source.startsWith("app/") &&
    /\/(?:actions|default|error|global-error|layout|loading|not-found|page|route|template)\.(?:ts|tsx)$/.test(
      source,
    )
  );
}

describe("settings production reachability", () => {
  it("keeps every settings source reachable from a production entry point", () => {
    const allSources = SOURCE_ROOTS.flatMap(listSources).concat(
      TOP_LEVEL_ROOTS.filter((source) => existsSync(path.join(ROOT, source))),
    );
    const sourceSet = new Set(allSources);
    const pending = allSources.filter(isProductionRoot);
    const reachable = new Set<string>();

    while (pending.length > 0) {
      const source = pending.pop();
      if (!source || reachable.has(source)) continue;
      reachable.add(source);
      pending.push(...importsFor(source, sourceSet));
    }

    const unreachableSettingsSources = allSources
      .filter((source) => source.startsWith("components/settings/"))
      .filter((source) => !reachable.has(source))
      .sort();

    expect(unreachableSettingsSources).toEqual([]);
  }, 10_000);
});
