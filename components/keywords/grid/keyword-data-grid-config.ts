import type { GridColumnVisibilityModel } from "@mui/x-data-grid";

export const defaultKeywordColumnVisibility: GridColumnVisibilityModel = {
  change: true,
  frequency: true,
  intent: true,
  lastChecked: true,
  location: true,
  sparkline: true,
  tags: true,
  targetRanking: true,
  topic: true,
  volume: true,
  difficulty: true,
};

export const initialKeywordGridState = {
  pagination: { paginationModel: { pageSize: 10 } },
  sorting: { sortModel: [{ field: "position", sort: "asc" }] },
} as const;

/** Canonical MUI DataGrid column-header sx, shared by every DataGrid surface. */
export const dataGridHeaderSx = {
  backgroundColor: "var(--table-header-bg)",
  borderColor: "var(--border)",
  borderRadius: 0,
  color: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
} as const;

export const keywordGridSx = {
  "&.MuiDataGrid-root": { borderRadius: 0 },
  border: 0,
  color: "var(--fg)",
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  "& .MuiDataGrid-cell": {
    alignItems: "center",
    borderColor: "var(--border-soft)",
    display: "flex",
    lineHeight: "normal",
    outline: "none",
  },
  "& .MuiDataGrid-columnHeaders": dataGridHeaderSx,
  "& .MuiDataGrid-footerContainer": { borderColor: "var(--border)" },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  "& .MuiDataGrid-row:hover": { backgroundColor: "var(--bg-sunken)" },
  "& .MuiDataGrid-row:hover .bv-keyword-title": {
    color: "var(--accent-text)",
    textDecoration: "underline",
  },
  "& .bv-market-grid-child .MuiDataGrid-cell": {
    backgroundColor: "color-mix(in srgb, var(--bg-sunken) 52%, transparent)",
  },
};

export const keywordTableCardSx = { borderRadius: "14px", overflow: "hidden" } as const;
