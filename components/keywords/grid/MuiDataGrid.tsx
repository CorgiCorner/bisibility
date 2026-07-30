"use client";

import type { DataGridProps } from "@mui/x-data-grid";
import { DataGrid } from "@mui/x-data-grid/DataGrid";
import { useEffect } from "react";

type MuiDataGridProps = DataGridProps & { onReady: () => void };

export function MuiDataGrid({ onReady, ...props }: MuiDataGridProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return <DataGrid {...props} />;
}
