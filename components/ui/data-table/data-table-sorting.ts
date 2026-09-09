import type { DataTableSort } from "./data-table-types";

export function nextDataTableSort(
  current: DataTableSort | null,
  field: string,
  descendingFirst: boolean,
): DataTableSort | null {
  const first = descendingFirst ? "desc" : "asc";
  const second = descendingFirst ? "asc" : "desc";
  if (current?.field !== field) return { direction: first, field };
  if (current.direction === first) return { direction: second, field };
  return null;
}

export function dataTableColumnIsSortable(
  sortable: boolean | ((state: { grouped: boolean }) => boolean) | undefined,
  grouped: boolean,
): boolean {
  if (typeof sortable === "function") return sortable({ grouped });
  return sortable ?? true;
}
