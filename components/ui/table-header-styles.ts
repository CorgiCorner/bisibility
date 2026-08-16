/**
 * Shared HTML table-header class vocabulary. Every HTML table header and its
 * matching loading skeleton apply this class so the background token, muted
 * text, mono family, 11px size, and 0.5px tracking stay in lockstep. Borders
 * remain per-table (border-b/border-t, border vs border-strong) because each
 * table already declares its own canonical header border.
 */
export const tableHeaderClassName =
  "bg-table-header-bg font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted";
