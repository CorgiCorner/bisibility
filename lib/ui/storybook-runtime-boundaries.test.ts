// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import storybookConfig, {
  rankRunActionBoundaries,
  resolveRankRunActionBoundary,
} from "@/.storybook/main";
import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

const rankRunActionPrefix = "@/lib/actions/rank-check-run-";
const keywordActionImports = [
  "@/lib/actions/keyword-export-action",
  "@/lib/actions/keyword-import-refresh",
  "@/lib/actions/project-markets",
] as const;
const componentScanTimeoutMs = 15_000;

type AliasEntry = { find: string | RegExp; replacement: string };
type ViteConfigFixture = { resolve?: { alias?: AliasEntry[] | Record<string, string> } };

async function configuredAliases() {
  const viteFinal = storybookConfig.viteFinal as unknown as (
    config: ViteConfigFixture,
  ) => Promise<ViteConfigFixture>;
  const config = await viteFinal({});
  const aliases = config.resolve?.alias ?? {};
  if (!Array.isArray(aliases)) return new Map(Object.entries(aliases));
  return new Map(
    aliases.flatMap(({ find, replacement }) =>
      typeof find === "string" ? [[find, replacement] as const] : [],
    ),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function runtimeImports(path: string) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    false,
  );
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return [];
    return ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : [];
  });
}

function importedRankRunActions() {
  return sourceFiles(join(process.cwd(), "components"))
    .flatMap(runtimeImports)
    .filter((specifier) => specifier.startsWith(rankRunActionPrefix))
    .filter((specifier, index, imports) => imports.indexOf(specifier) === index)
    .sort();
}

describe("Storybook rank-run action boundaries", () => {
  it("maps every component runtime import to the dedicated browser stub", {
    timeout: componentScanTimeoutMs,
  }, () => {
    expect(importedRankRunActions()).toEqual(Object.keys(rankRunActionBoundaries).sort());
    expect(resolveRankRunActionBoundary("@/lib/actions/rank-check-run-launch")).toMatch(
      /[\\/]\.storybook[\\/]rank-run-action-stubs\.ts$/,
    );
  });

  it("rejects an unmapped rank-run server action", () => {
    expect(() => resolveRankRunActionBoundary("@/lib/actions/rank-check-run-unmapped")).toThrow(
      "Missing Storybook rank-run action boundary mapping",
    );
  });
});

describe("Storybook keyword action boundaries", () => {
  it("maps the keyword dialog server actions to browser fixtures", async () => {
    const aliases = await configuredAliases();

    for (const actionImport of keywordActionImports) {
      expect(aliases.get(actionImport)).toMatch(/[\\/]\.storybook[\\/]keyword-action-stubs\.ts$/);
    }
  });
});
