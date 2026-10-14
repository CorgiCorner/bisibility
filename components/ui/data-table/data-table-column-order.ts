import { dataTableColumnId } from "./data-table-model";

/** Controlled presentation order never imports another account's browser layout. */
export function resolveDataTableColumnOrder(
  columns: readonly { accessorKey?: unknown; header?: unknown; id?: string }[],
  requested?: readonly string[],
) {
  const available = columns.flatMap((column) => {
    const id = dataTableColumnId(column);
    return id ? [id] : [];
  });
  const known = new Set(available);
  return [...new Set([...(requested ?? []).filter((id) => known.has(id)), ...available])];
}
