"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { importColumnMappingTableColumns } from "./import-preview-table-columns";

const ignoreSorting = () => undefined;

export function ImportColumnMapping({
  mapping,
  onChange,
  sourceColumns,
}: Readonly<{
  mapping: KeywordImportColumnMapping;
  onChange: (sourceIndex: number, destination: KeywordImportField | null) => void;
  sourceColumns: readonly KeywordImportSourceColumn[];
}>) {
  return (
    <div className="mt-4">
      <DataTable
        ariaLabel="Import column mapping"
        columns={importColumnMappingTableColumns(mapping, onChange)}
        density="compact"
        id="import-column-mapping"
        layout="auto"
        onSortingChange={ignoreSorting}
        rows={sourceColumns.map((source) => ({ ...source, id: `import-column-${source.index}` }))}
        sorting={null}
      />
    </div>
  );
}
