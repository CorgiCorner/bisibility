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
type ViteConfigFixture = {
  resolve?: { alias?: AliasEntry[] | Record<string, string> };
  plugins?: { name: string; resolveId?: (source: string, importer?: string) => string | null }[];
};

async function configuredViteConfig() {
  const viteFinal = storybookConfig.viteFinal as unknown as (
    config: ViteConfigFixture,
  ) => Promise<ViteConfigFixture>;
  return viteFinal({});
}

async function configuredAliases() {
  const config = await configuredViteConfig();
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
  it("maps rank-check status polling to browser runtime stubs", async () => {
    const aliases = await configuredAliases();

    expect(aliases.get("@/lib/actions/rank-check-status")).toMatch(
      /[\\/]\.storybook[\\/]browser-runtime-stubs\.tsx$/,
    );
  });

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

describe("Storybook instance administration action boundaries", () => {
  it("retains dedicated announcement and recovery fixtures in the combined configuration", async () => {
    const aliases = await configuredAliases();
    expect(aliases.get("@/lib/actions/instance-announcements")).toMatch(
      /[\\/]\.storybook[\\/]instance-announcement-stubs\.ts$/,
    );
    expect(aliases.get("@/lib/actions/metering-recovery")).toMatch(
      /[\\/]\.storybook[\\/]recovery-action-stubs\.ts$/,
    );
    expect(aliases.get("@/lib/actions/instance-announcements")).not.toBe(
      aliases.get("@/lib/actions/metering-recovery"),
    );
  });
});

describe("Storybook provider-management action boundary", () => {
  it("aliases the verified provider context's server actions to readonly browser fixtures", async () => {
    const aliases = await configuredAliases();
    expect(aliases.get("@/lib/actions/provider-ui")).toMatch(
      /[\\/]\.storybook[\\/]browser-runtime-stubs\.tsx$/,
    );
  });

  it("intercepts provider actions before traversing their server implementation", async () => {
    const config = await configuredViteConfig();
    const plugin = config.plugins?.find(
      (candidate) => candidate.name === "storybook-runtime-stubs",
    );
    expect(
      plugin?.resolveId?.(
        "@/lib/actions/provider-ui",
        join(process.cwd(), "components/provider-management/ProviderUiProvider.tsx"),
      ),
    ).toMatch(/[\\/]\.storybook[\\/]browser-runtime-stubs\.tsx$/);
  });
});
