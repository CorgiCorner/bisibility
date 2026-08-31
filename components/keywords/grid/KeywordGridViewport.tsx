"use client";

import { marketGridChild } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { DataGridProps, GridCellParams } from "@mui/x-data-grid";
import type { MouseEvent } from "react";
import { DeferredDataGrid } from "./DeferredDataGrid";
import { KeywordNoRowsOverlay, type KeywordNoRowsState } from "./KeywordTableStatus";
import { initialKeywordGridState, keywordGridSx } from "./keyword-data-grid-config";

const GRID_CHECKBOX_SELECTION_FIELD = "__check__";

type KeywordGridViewportProps = Pick<
  DataGridProps<KeywordRow>,
  | "columnVisibilityModel"
  | "columns"
  | "density"
  | "getRowHeight"
  | "onColumnVisibilityModelChange"
  | "onDensityChange"
  | "onPaginationModelChange"
  | "onRowSelectionModelChange"
  | "onSortModelChange"
  | "paginationMode"
  | "paginationModel"
  | "rowCount"
  | "rowSelectionModel"
  | "rows"
  | "sortingMode"
  | "sortModel"
> & {
  noRowsState?: KeywordNoRowsState;
  onNavigate: (keywordId: string) => void;
  toggleParent: (row: KeywordRow) => boolean;
};

function handleCellClick(params: GridCellParams, event: MouseEvent) {
  if (params.field === GRID_CHECKBOX_SELECTION_FIELD || params.field === "actions") {
    event.stopPropagation();
  }
}

export function KeywordGridViewport({
  noRowsState,
  onNavigate,
  toggleParent,
  ...gridProps
}: KeywordGridViewportProps) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] w-full min-w-0"
        data-testid="keywords-grid-viewport"
      >
        <DeferredDataGrid
          {...gridProps}
          checkboxSelection
          columnHeaderHeight={42}
          disableRowSelectionExcludeModel
          disableRowSelectionOnClick
          getRowClassName={(params) => (marketGridChild(params.row) ? "bv-market-grid-child" : "")}
          initialState={initialKeywordGridState}
          onCellClick={handleCellClick}
          onRowClick={(params) => {
            if (!toggleParent(params.row)) onNavigate(params.row.id);
          }}
          pageSizeOptions={[10, 25, 50]}
          pagination
          slotProps={{ noRowsOverlay: { state: noRowsState } }}
          slots={{ noRowsOverlay: KeywordNoRowsOverlay }}
          sx={keywordGridSx}
        />
      </div>
    </div>
  );
}
