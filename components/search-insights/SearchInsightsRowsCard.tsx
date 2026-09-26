"use client";

import {
  ExpandableCard,
  type ExpandableCardContent,
  renderExpandableCardContent,
} from "@/components/ui/ExpandableCard";
import type { ReactNode } from "react";

export type SearchInsightsRowsCardProps = {
  caption: ReactNode;
  /** The table. The function form draws it once per view, so the expanded copy can fill the modal. */
  children?: ExpandableCardContent;
  /** The window holds no rows at all, so the card explains why instead of showing a table. */
  empty: boolean;
  emptyReason?: string;
  /** Offers the full-screen view of the table. An empty card never offers it. */
  expandable?: boolean;
  title: string;
  /**
   * Controls between the heading and the table: the search, and the table's own switches. Use the
   * function form when they hold ids, so the expanded copy can suffix them.
   */
  toolbar?: ExpandableCardContent;
};

export function SearchInsightsRowsCard({
  caption,
  children,
  empty,
  emptyReason,
  expandable = true,
  title,
  toolbar,
}: Readonly<SearchInsightsRowsCardProps>) {
  return (
    <ExpandableCard caption={caption} expandable={expandable && !empty} title={title}>
      {(view) =>
        empty ? (
          <p className="m-0 border-t border-border px-4 py-5 text-ui-body text-fg-muted">
            {emptyReason}
          </p>
        ) : (
          <>
            {toolbar ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 px-4 pb-3">
                {renderExpandableCardContent(toolbar, view)}
              </div>
            ) : null}
            {view === "expanded" ? (
              // The modal body has a fixed height: the table takes what the toolbar leaves.
              <div className="flex min-h-0 flex-1 flex-col">
                {renderExpandableCardContent(children, view)}
              </div>
            ) : (
              renderExpandableCardContent(children, view)
            )}
          </>
        )
      }
    </ExpandableCard>
  );
}
