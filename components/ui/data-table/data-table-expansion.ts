"use client";

import { useCallback, useState } from "react";
import { dataTableRowKind, defaultExpandedDataTableRows } from "./data-table-model";
import type { DataTableRowBase } from "./data-table-types";

export function dataTableExpandedRecord<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  expanded: ReadonlySet<string>,
): Record<string, boolean> {
  const result = Object.fromEntries([...expanded].map((id) => [id, true]));
  for (const row of rows) {
    if (dataTableRowKind(row) === "section") result[row.id] = true;
  }
  return result;
}

export function useDataTableExpansion<TRow extends DataTableRowBase>({
  defaultExpanded = "none",
  expanded,
  onExpandedChange,
  rows,
}: {
  defaultExpanded?: "all" | "none";
  expanded?: ReadonlySet<string>;
  onExpandedChange?: (next: ReadonlySet<string>) => void;
  rows: readonly TRow[];
}) {
  const [internal, setInternal] = useState<ReadonlySet<string>>(() =>
    defaultExpandedDataTableRows(rows, defaultExpanded),
  );
  const current = expanded ?? internal;
  const toggle = useCallback(
    (row: TRow) => {
      if (dataTableRowKind(row) !== "group") return;
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      if (expanded === undefined) setInternal(next);
      onExpandedChange?.(next);
    },
    [current, expanded, onExpandedChange],
  );

  return {
    expanded: current,
    toggle,
  };
}
