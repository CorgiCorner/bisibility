"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import { dataTableRowHeight } from "@/components/ui/data-table/data-table-density";
import {
  importPreviewTableColumns,
  type KeywordImportPreviewRow,
} from "./import-preview-table-columns";

export type { KeywordImportPreviewRow } from "./import-preview-table-columns";

const ignoreSorting = () => undefined;
const previewDensity = "compact";
const previewHeaderHeight = 42;
const previewViewportHeight = 456;

function previewLayout(rows: readonly KeywordImportPreviewRow[]) {
  return previewHeaderHeight + rows.length * dataTableRowHeight(previewDensity) >
    previewViewportHeight
    ? "fill"
    : "auto";
}

export function ParsedRowsPreview({
  rows,
}: Readonly<{ rows: readonly KeywordImportPreviewRow[] }>) {
  if (rows.length === 0) return null;
  const layout = previewLayout(rows);
  return (
    <div className="mt-4">
      <div
        className="min-w-0"
        style={layout === "fill" ? { height: previewViewportHeight } : undefined}
      >
        <DataTable
          ariaLabel="Imported rows preview"
          columns={importPreviewTableColumns}
          density={previewDensity}
          id="imported-rows-preview"
          layout={layout}
          onSortingChange={ignoreSorting}
          rows={rows.map((row) => ({ ...row, id: `import-row-${row.row}` }))}
          sorting={null}
        />
      </div>
    </div>
  );
}
