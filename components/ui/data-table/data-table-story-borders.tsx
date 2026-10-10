"use client";

import { Card } from "@/components/ui/Card";
import { TableCardHeader } from "@/components/ui/TableCardHeader";
import { useState } from "react";
import { DataTable } from "./DataTable";
import { dataTableStoryColumns, dataTableStoryRows } from "./data-table-story-fixtures";
import type { DataTableSort } from "./data-table-types";

export function DataTableBorderlessStory() {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  return (
    <Card className="max-w-[720px] min-w-0 overflow-hidden p-0">
      <TableCardHeader
        actions={null}
        title="Table inside a clipped card body"
        titleId="borderless-clipped-title"
      />
      <div className="h-[260px] min-w-0 overflow-hidden" data-testid="borderless-clip-boundary">
        <DataTable
          ariaLabel="Clipped borderless table"
          bordered={false}
          columns={dataTableStoryColumns}
          defaultExpanded="all"
          id="borderless-clipped"
          layout="fill"
          onSelectionChange={setSelection}
          onSortingChange={setSorting}
          renderSection={(row) => row.keyword}
          rows={dataTableStoryRows}
          selection={selection}
          sorting={sorting}
        />
      </div>
    </Card>
  );
}
