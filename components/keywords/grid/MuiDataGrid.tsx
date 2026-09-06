"use client";

import type { DataGridProps } from "@mui/x-data-grid";
import { DataGrid } from "@mui/x-data-grid/DataGrid";
import { useCallback } from "react";

type MuiDataGridProps = DataGridProps & { onReady: () => void };

export function MuiDataGrid({ onReady, ...props }: MuiDataGridProps) {
  const handleMount = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) onReady();
    },
    [onReady],
  );

  return (
    <div ref={handleMount}>
      <DataGrid {...props} />
    </div>
  );
}
