/**
 * Shared HTML table-header class vocabulary. Every HTML table header and its
 * matching loading skeleton apply this class so the background token, muted
 * text, Sans family, 11px size, and 0.5px tracking stay in lockstep. Borders
 * remain per-table (border-b/border-t, border vs border-control) because each
 * table already declares its own canonical header border.
 */
export const tableHeaderTypographyClassName =
  "text-[11px] uppercase tracking-[0.5px] text-fg-muted";

/**
 * The head treatment for dense grids, where a tinted band separates head from body. A table that
 * instead rules its head off with the row border takes the typography alone and paints its own
 * surface, so the two never drift apart.
 */
export const tableHeaderClassName = `bg-table-header-bg ${tableHeaderTypographyClassName}`;
