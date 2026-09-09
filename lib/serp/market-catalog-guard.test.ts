import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketCatalogViolations,
  // @ts-expect-error The lint helper is a JavaScript module.
} from "./market-catalog-guard.mjs";

const createSourceFile = vi.hoisted(() => vi.fn());
vi.mock("@typescript/typescript6", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import("@typescript/typescript6") }>();
  createSourceFile.mockImplementation(actual.default.createSourceFile);
  return { ...actual, default: { ...actual.default, createSourceFile } };
});

function check(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "market-catalog-guard-"));
  try {
    for (const [fileName, source] of Object.entries(files)) {
      const target = path.join(root, fileName);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    return marketCatalogViolations(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe("retired market catalog guard", () => {
  beforeEach(() => {
    createSourceFile.mockClear();
  });

  it("avoids building an AST for sources without possible catalog references", () => {
    expect(check({ "app/plain.ts": "export const unrelated = 1;" })).toEqual([]);
    expect(createSourceFile).not.toHaveBeenCalled();
  });

  it("still parses escaped module specifiers and retired export identifiers", () => {
    expect(
      check({
        "app/escaped.ts": String.raw`import "@/lib/serp/mar\u006bets";`,
        "lib/escaped.ts": String.raw`export const DEFAULT_SERP_M\u0041RKET = "Spain";`,
        "lib/reexport.ts": String.raw`export { value as \u0053erpMarketName } from "./neutral";`,
      }),
    ).toEqual(["app/escaped.ts:1", "lib/escaped.ts:1", "lib/reexport.ts:1"]);
    expect(createSourceFile).toHaveBeenCalledTimes(3);
  });

  it("preserves relative catalog resolution when the name appears only in the file path", () => {
    expect(
      check({
        "lib/serp/markets/consumer.ts": 'import ".";',
        "lib/serp/markets/nested/consumer.ts": 'void import("..");',
      }),
    ).toEqual(["lib/serp/markets/consumer.ts:1", "lib/serp/markets/nested/consumer.ts:1"]);
  });

  it("rejects executable static, relative, dynamic, re-export and mock dependencies", () => {
    expect(
      check({
        "app/example.ts": 'import type { SerpDevice } from "@/lib/serp/markets";',
        "components/example.test.ts": 'vi.mock("@/lib/serp/markets", () => ({}));',
        "lib/example.ts": 'export * from "./serp/markets";',
        "lib/serp/example.ts": 'void import("./markets.ts");',
        "scripts/example.mjs": 'require("../lib/serp/markets");',
      }),
    ).toEqual([
      "app/example.ts:1",
      "components/example.test.ts:1",
      "lib/example.ts:1",
      "lib/serp/example.ts:1",
      "scripts/example.mjs:1",
    ]);
  });

  it("allows constant/location imports, fixture strings, comments and historical docs", () => {
    expect(
      check({
        "lib/example.ts":
          'import { serpDepthValues } from "@/lib/serp/constants";\nimport { countrySeed } from "./serp/location";',
        "lib/example.test.ts": `const fixture = 'import { serpMarketNames } from "@/lib/serp/markets";';`,
        "scripts/example.mjs": "// Previously read lib/serp/markets.ts",
        "docs/history.md": 'import { serpMarketNames } from "@/lib/serp/markets";',
      }),
    ).toEqual([]);
  });

  it("rejects recreating the old module or moving its exports behind another path", () => {
    expect(
      check({
        "lib/serp/markets.ts": "// empty resurrected module",
        "lib/serp/renamed.ts":
          'export const serpMarketNames = ["Spain"];\nexport type SerpMarketName = string;\nexport const DEFAULT_SERP_MARKET = "Spain";',
      }),
    ).toEqual([
      "lib/serp/markets.ts: retired module must not exist",
      "lib/serp/renamed.ts:1",
      "lib/serp/renamed.ts:2",
      "lib/serp/renamed.ts:3",
    ]);
  });
});
