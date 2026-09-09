import { describe, expect, it } from "vitest";
import {
  directMuiTableImport,
  escapedMuiTableImport,
  namedMuiTableImport,
  splitTableOpeningTag,
  tableMentionsOnly,
  tableSource,
} from "./data-table-guard-fixtures";
import {
  findTableOwnershipViolations,
  inspectTableSource,
  isTableFixturePath,
  mayContainTableOwnershipSyntax,
  readTrackedTablePaths,
  readTrackedTableSources,
  type TableOwnershipExemptions,
} from "./data-table-guard-helpers";

// Tables written before the shared DataTable existed. Each entry must be migrated and removed;
// the assertion below fails if an entry no longer contains a raw table, so the list cannot rot.
const temporaryMigrationPaths = new Set<string>();

const exemptions: TableOwnershipExemptions = {
  permanentStaticPaths: new Set(["app/(marketing)/alternatives/[slug]/page.tsx"]),
  permanentStaticRoots: ["components/marketing"],
  temporaryMigrationPaths,
};

describe("data table ownership guard", () => {
  it("includes tracked root-level app TSX files", () => {
    expect(readTrackedTablePaths()).toContain("app/layout.tsx");
  });

  it("keeps tracked production tables limited to the migration and static-content lists", () => {
    const sources = readTrackedTableSources();
    const detectedMigrationPaths = new Set(
      sources
        .filter((source) => temporaryMigrationPaths.has(source.path))
        .filter((source) => inspectTableSource(source).length > 0)
        .map((source) => source.path),
    );

    expect([...detectedMigrationPaths].sort()).toEqual([...temporaryMigrationPaths].sort());
    expect(findTableOwnershipViolations(sources, exemptions)).toEqual([]);
  });

  it("detects split raw-table tags and both supported MUI import forms", () => {
    expect(
      inspectTableSource(tableSource("components/feature/RawTable.tsx", splitTableOpeningTag)),
    ).toEqual([
      expect.objectContaining({ kind: "html-table", path: "components/feature/RawTable.tsx" }),
    ]);
    expect(
      inspectTableSource(tableSource("components/feature/DirectTable.tsx", directMuiTableImport)),
    ).toEqual([
      expect.objectContaining({
        kind: "mui-table-import",
        path: "components/feature/DirectTable.tsx",
      }),
    ]);
    expect(
      inspectTableSource(tableSource("components/feature/NamedTable.tsx", namedMuiTableImport)),
    ).toEqual([
      expect.objectContaining({
        kind: "mui-table-import",
        path: "components/feature/NamedTable.tsx",
      }),
    ]);
  });

  it("does not treat comments or string diagnostics as imports or JSX", () => {
    expect(
      inspectTableSource(tableSource("components/feature/Notes.tsx", tableMentionsOnly)),
    ).toEqual([]);
  });

  it("only fast-paths source without supported table syntax", () => {
    expect(mayContainTableOwnershipSyntax('export const body = <div role="row" />;')).toBe(false);
    expect(mayContainTableOwnershipSyntax('export const label = "table";')).toBe(false);
    expect(mayContainTableOwnershipSyntax(splitTableOpeningTag)).toBe(true);
    expect(mayContainTableOwnershipSyntax(escapedMuiTableImport)).toBe(true);
  });

  it("does not fast-path supported raw-table and escaped MUI import violations", () => {
    const sources = [
      tableSource("components/feature/RawTable.tsx", splitTableOpeningTag),
      tableSource("components/feature/DirectTable.tsx", directMuiTableImport),
      tableSource("components/feature/NamedTable.tsx", namedMuiTableImport),
      tableSource("components/feature/EscapedTable.tsx", escapedMuiTableImport),
    ];

    expect(findTableOwnershipViolations(sources, exemptions)).toEqual([
      expect.objectContaining({ kind: "html-table", path: "components/feature/RawTable.tsx" }),
      expect.objectContaining({
        kind: "mui-table-import",
        path: "components/feature/DirectTable.tsx",
      }),
      expect.objectContaining({
        kind: "mui-table-import",
        path: "components/feature/NamedTable.tsx",
      }),
      expect.objectContaining({
        kind: "mui-table-import",
        path: "components/feature/EscapedTable.tsx",
      }),
    ]);
  });

  it("keeps fixture classification separate from production exceptions", () => {
    expect(isTableFixturePath("components/feature/Table.test.tsx")).toBe(true);
    expect(isTableFixturePath("components/feature/Table.stories.tsx")).toBe(true);
    expect(isTableFixturePath("components/feature/__fixtures__/Table.tsx")).toBe(true);
    expect(isTableFixturePath("components/feature/Table.tsx")).toBe(false);

    const adminPath = "components/admin/AdminDashboard.tsx";
    const productionPath = "components/feature/NewProductionTable.tsx";
    const sources = [
      tableSource(adminPath, splitTableOpeningTag),
      tableSource(productionPath, splitTableOpeningTag),
      tableSource("components/feature/NewProductionTable.test.tsx", splitTableOpeningTag),
    ];

    expect(findTableOwnershipViolations(sources, exemptions)).toEqual([
      expect.objectContaining({ kind: "html-table", path: adminPath }),
      expect.objectContaining({ kind: "html-table", path: productionPath }),
    ]);
  });

  it("keeps permanent static-content exemptions exact", () => {
    const sources = [
      tableSource("components/marketing/content/StaticMatrix.tsx", splitTableOpeningTag),
      tableSource("app/(marketing)/alternatives/[slug]/page.tsx", splitTableOpeningTag),
      tableSource("app/(marketing)/alternatives/page.tsx", splitTableOpeningTag),
    ];

    expect(findTableOwnershipViolations(sources, exemptions)).toEqual([
      expect.objectContaining({
        kind: "html-table",
        path: "app/(marketing)/alternatives/page.tsx",
      }),
    ]);
  });
});
