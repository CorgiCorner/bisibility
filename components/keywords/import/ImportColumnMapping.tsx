"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard.table");
  return (
    <div className="mt-4">
      <DataTable
        ariaLabel={t("mappingAria")}
        columns={importColumnMappingTableColumns(mapping, onChange, t)}
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
