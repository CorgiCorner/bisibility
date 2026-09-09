import { resolve } from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";
import { tableSource } from "./data-table-guard-fixtures";
import {
  findDataTableLibraryImportViolations,
  readTrackedApplicationSources,
} from "./data-table-guard-helpers";

const repoRoot = process.cwd();
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
});

const restrictedTableSpecifiers = [
  "@tanstack/react-table",
  "@tanstack/react-table/build/lib/index.mjs",
  "@tanstack/table-core",
  "@tanstack/table-core/build/lib/index.mjs",
  "@tanstack/react-virtual",
  "@tanstack/react-virtual/build/lib/index.mjs",
  "@tanstack/virtual-core",
  "@tanstack/virtual-core/build/lib/index.mjs",
];

async function restrictedImportMessages(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: resolve(repoRoot, filePath),
  });

  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

describe("data table import boundaries", () => {
  beforeAll(async () => {
    // Load the lint configuration in suite setup instead of the first rule assertion.
    await eslint.calculateConfigForFile(resolve(repoRoot, "app/app/table-consumer/page.tsx"));
  });

  it.each([
    "app/app/table-consumer/page.tsx",
    "components/overview/TableConsumer.tsx",
    "components/ui/TableConsumer.tsx",
    "hooks/use-table-consumer.ts",
    "lib/table-consumer.ts",
  ])("rejects table libraries from %s", async (filePath) => {
    const source = restrictedTableSpecifiers
      .map((specifier) => `export * from ${JSON.stringify(specifier)};`)
      .join("\n");
    const messages = await restrictedImportMessages(filePath, source);

    expect(messages).toHaveLength(restrictedTableSpecifiers.length);
    expect(messages.every((message) => message.message.includes("components/ui/data-table"))).toBe(
      true,
    );
  });

  it("allows the table libraries inside the primitive", async () => {
    const source = restrictedTableSpecifiers
      .map((specifier) => `export * from ${JSON.stringify(specifier)};`)
      .join("\n");

    expect(
      await restrictedImportMessages("components/ui/data-table/library-surface.tsx", source),
    ).toEqual([]);
  });

  it("rejects feature imports but allows direct generic UI imports inside the primitive", async () => {
    const rejected = await restrictedImportMessages(
      "components/ui/data-table/DataTableBody.tsx",
      'import "@/components/keywords/grid/keyword-data-table-config";',
    );
    const allowed = await restrictedImportMessages(
      "components/ui/data-table/DataTableColumnsMenu.tsx",
      'import "@/components/ui/MenuSelect";',
    );

    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.message).toContain("feature components");
    expect(allowed).toEqual([]);
  });

  it("does not reject package names that are only mentioned", async () => {
    expect(
      await restrictedImportMessages(
        "components/overview/TablePlan.tsx",
        'export const note = "Do not import @tanstack/react-table here";',
      ),
    ).toEqual([]);
  });

  it("keeps tracked TypeScript imports contained to the primitive", () => {
    expect(findDataTableLibraryImportViolations(readTrackedApplicationSources())).toEqual([]);
  }, 15_000);

  it("rejects static, type, re-export, and dynamic imports even in fixtures", () => {
    const sources = [
      tableSource(
        "app/app/report/page.tsx",
        'import { useReactTable } from "@tanstack/react-table";',
      ),
      tableSource(
        "lib/report-table.ts",
        'import type { Table } from "@tanstack/table-core/build/lib/index.mjs";',
      ),
      tableSource(
        "hooks/use-report-table.ts",
        'type Table = import("@tanstack/react-table").Table<unknown>;',
      ),
      tableSource(
        "components/feature/ReportTable.test.tsx",
        'const tableLibrary = import("@tanstack/react-virtual");',
      ),
      tableSource(
        "components/feature/ReportTable.stories.tsx",
        'export type { VirtualItem } from "@tanstack/virtual-core/build/lib/index.mjs";',
      ),
    ];

    expect(findDataTableLibraryImportViolations(sources)).toEqual([
      expect.objectContaining({ path: "app/app/report/page.tsx" }),
      expect.objectContaining({ path: "lib/report-table.ts" }),
      expect.objectContaining({ path: "hooks/use-report-table.ts" }),
      expect.objectContaining({ path: "components/feature/ReportTable.test.tsx" }),
      expect.objectContaining({ path: "components/feature/ReportTable.stories.tsx" }),
    ]);
  });

  it("allows imports inside the primitive and package mentions elsewhere", () => {
    const sources = [
      tableSource(
        "components/ui/data-table/library-surface.test.ts",
        'export type { Table } from "@tanstack/react-table";',
      ),
      tableSource(
        "components/feature/TablePlan.test.ts",
        'export const note = "import(\\"@tanstack/react-table\\") is forbidden here";',
      ),
    ];

    expect(findDataTableLibraryImportViolations(sources)).toEqual([]);
  });

  it("does not prefilter escaped module specifiers", () => {
    const sources = [
      tableSource(
        "components/feature/EscapedTable.test.ts",
        'export type { Table } from "\\x40tanstack/react-table";',
      ),
      tableSource(
        "components/feature/EscapedVirtualTable.stories.tsx",
        "const virtualLibrary = import(`\\u0040tanstack/react-virtual`);",
      ),
    ];

    expect(findDataTableLibraryImportViolations(sources)).toEqual([
      expect.objectContaining({
        path: "components/feature/EscapedTable.test.ts",
        specifier: "@tanstack/react-table",
      }),
      expect.objectContaining({
        path: "components/feature/EscapedVirtualTable.stories.tsx",
        specifier: "@tanstack/react-virtual",
      }),
    ]);
  });

  it("restricts the UI barrel and allows the per-module import it points at", async () => {
    const barrel = await restrictedImportMessages(
      "components/keywords/KeywordTable.tsx",
      'import "@/components/ui";',
    );

    expect(barrel).toHaveLength(1);
    expect(barrel[0]?.message).toContain("Import the specific components/ui module");

    const perModule = await restrictedImportMessages(
      "components/keywords/KeywordTable.tsx",
      'import "@/components/ui/Button";',
    );

    expect(perModule).toEqual([]);
  });
});
