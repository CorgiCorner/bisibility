import { dataTableViewportHeight } from "@/components/ui/data-table/data-table-density";
import type { DataTableDensity } from "@/components/ui/data-table/data-table-types";
import type { ExpandableCardView } from "@/components/ui/ExpandableCard";
import { FIRST_VIEW_ROWS } from "@/lib/search-insights/constants";
import type { ReactNode } from "react";

export type SearchInsightsTableFrameProps = {
  children: ReactNode;
  /** The table draws its pagination footer. */
  paged: boolean;
  /** The rows on the current page. */
  rows: number;
  /** Where the card draws the table. Without it the table keeps its natural height. */
  view?: ExpandableCardView;
};

export const SEARCH_INSIGHTS_TABLE_DENSITY = "compact" satisfies DataTableDensity;

/** `fill` when the table sits in a card view, so its body scrolls inside the frame. */
export function searchInsightsTableLayout(view?: ExpandableCardView) {
  return view ? ("fill" as const) : ("auto" as const);
}

/**
 * In the card the table is as tall as the first page, so a larger page scrolls in place instead
 * of growing the card; in the modal it takes the height the toolbar leaves.
 */
export function SearchInsightsTableFrame({
  children,
  paged,
  rows,
  view,
}: Readonly<SearchInsightsTableFrameProps>) {
  if (!view) return children;
  if (view === "expanded") {
    return (
      <div className="min-h-0 min-w-0 flex-1" data-view="expanded">
        {children}
      </div>
    );
  }
  const height = dataTableViewportHeight({
    density: SEARCH_INSIGHTS_TABLE_DENSITY,
    footer: paged,
    maxRows: FIRST_VIEW_ROWS,
    rows,
  });
  return (
    <div className="min-w-0" data-view="inline" style={{ height }}>
      {children}
    </div>
  );
}
