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
};

export const initialKeywordGridState = {
  pagination: { paginationModel: { pageSize: 10 } },
  sorting: { sortModel: [{ field: "position", sort: "asc" }] },
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
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: "var(--bg-sunken)",
    borderRadius: 0,
    borderColor: "var(--border)",
    color: "var(--fg-muted)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
  },
  "& .MuiDataGrid-footerContainer": { borderColor: "var(--border)" },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  "& .MuiDataGrid-row:hover": { backgroundColor: "var(--bg-sunken)" },
  "& .MuiDataGrid-row:hover .bv-keyword-title": {
    color: "var(--accent)",
    textDecoration: "underline",
  },
};

export const keywordTableCardSx = { borderRadius: "14px", overflow: "hidden" } as const;
