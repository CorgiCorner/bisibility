"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import {
  type SavedKeywordsTableRow,
  savedKeywordsTableColumns,
} from "./saved-keywords-table-columns";

type SavedKeywordsTableRowsProps = {
  canDelete: boolean;
  canTrack: boolean;
  onRemove: (row: SavedKeywordRow) => void;
  onSelectionChange: (selection: ReadonlySet<string>) => void;
  onToggle: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
  rows: readonly SavedKeywordsTableRow[];
  selectedIds: ReadonlySet<string>;
};

export function SavedKeywordsTableRows({
  canDelete,
  canTrack,
  onRemove,
  onSelectionChange,
  onToggle,
  onTrack,
  projectRef,
  rows,
  selectedIds,
}: Readonly<SavedKeywordsTableRowsProps>) {
  return (
    <DataTable
      ariaLabel="Saved keywords"
      columns={savedKeywordsTableColumns({
        canDelete,
        canTrack,
        onRemove,
        onTrack,
        projectRef,
      })}
      density="compact"
      id="saved-keywords-table"
      layout="auto"
      onRowClick={onToggle}
      onSelectionChange={onSelectionChange}
      onSortingChange={() => undefined}
      rowClassName={(row) =>
        selectedIds.has(row.publicId)
          ? "shadow-[inset_2px_0_0_var(--accent)] [&>[data-column-id=selection]]:shadow-[inset_2px_0_0_var(--accent)]"
          : undefined
      }
      rows={rows}
      selection={selectedIds}
      sorting={null}
    />
  );
}
