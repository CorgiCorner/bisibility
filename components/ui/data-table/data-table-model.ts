import type { DataTableRowBase, DataTableRowKind } from "./data-table-types";

export type FlatDataTableRow<TRow> = {
  depth: 0 | 1;
  parentId?: string;
  row: TRow;
};

export function dataTableRowKind(row: DataTableRowBase): DataTableRowKind {
  return row.kind ?? "row";
}

export function validateDataTableRows<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  production = process.env.NODE_ENV === "production",
): void {
  for (const row of rows) {
    for (const child of row.subRows ?? []) {
      if ((child.subRows?.length ?? 0) > 0 && !production) {
        throw new Error(`DataTable row "${child.id}" exceeds the supported depth of 1`);
      }
    }
  }
}

export function flattenDataTableRows<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  expanded: ReadonlySet<string>,
): FlatDataTableRow<TRow>[] {
  const result: FlatDataTableRow<TRow>[] = [];
  for (const row of rows) {
    result.push({ depth: 0, row });
    const kind = dataTableRowKind(row);
    if (kind === "row" || (kind === "group" && !expanded.has(row.id))) continue;
    for (const child of row.subRows ?? []) {
      result.push({ depth: 1, parentId: row.id, row: child as TRow });
    }
  }
  return result;
}

export function defaultExpandedDataTableRows<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  mode: "none" | "all",
): Set<string> {
  if (mode === "none") return new Set();
  return new Set(rows.filter((row) => dataTableRowKind(row) === "group").map((row) => row.id));
}

export function dataTableHasGroups(rows: readonly DataTableRowBase[]): boolean {
  return rows.some((row) => dataTableRowKind(row) === "group");
}

export function dataTableRootIds(rows: readonly DataTableRowBase[]): ReadonlySet<string> {
  return new Set(rows.map((row) => row.id));
}

export function dataTableColumnId(column: {
  accessorKey?: unknown;
  header?: unknown;
  id?: string;
}): string | null {
  if (column.id) return column.id;
  if (typeof column.accessorKey === "string") return column.accessorKey.replaceAll(".", "_");
  return typeof column.header === "string" ? column.header : null;
}

export function dataTableRowLabel(row: DataTableRowBase): string {
  const record = row as DataTableRowBase & Record<string, unknown>;
  for (const key of ["label", "keyword", "name", "title"] as const) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return row.id;
}
