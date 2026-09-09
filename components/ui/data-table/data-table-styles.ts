export const dataTableRootClassName =
  "group/table relative min-w-0 border border-border bg-bg-elev text-fg";

export const dataTableCellClassName =
  "flex min-w-0 shrink-0 items-center overflow-hidden border-b border-border-soft px-3 text-[13px] group-data-[last-row=true]:border-b-0";

export const dataTableHeaderCellClassName =
  "relative flex min-w-0 shrink-0 items-center overflow-hidden px-3 font-semibold";

export const dataTablePinnedEdgeClassName = {
  left: "group-data-[scrolled=true]/table:shadow-[1px_0_0_var(--border)]",
  right: "group-data-[scrolled=true]/table:shadow-[-1px_0_0_var(--border)]",
} as const;
