"use client";

import { Button, tableHeaderClassName } from "@/components/ui";
import type { SearchInsightsQueryRow } from "@/lib/search-insights/queries/top-rows-model";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import {
  TRACK_DIALOG_COPY,
  TRACK_LABEL,
  TRACK_TITLE,
  TRACKED_LABEL,
  TRACKED_TITLE,
} from "./search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
  ROW_HEIGHT_CLASS,
  SCROLL_REGION_CLASS,
  SCROLL_REGION_HEIGHT,
  tableRowKeys,
  windowedPadding,
  windowedRange,
} from "./search-insights-rows-model";
import {
  type ModuleTableHeader,
  type ModuleTableVariant,
  moduleTableColumnClasses,
  moduleTableHeaders,
  moduleTableMinWidth,
} from "./search-insights-table-columns";

export { ROW_HEIGHT_CLASS } from "./search-insights-rows-model";

export const CELL = "px-4 py-0 align-middle";
export const NUMERIC = "px-1 text-right font-mono text-ui-caption";
export const ROW =
  "group cursor-pointer border-b border-border-soft text-ui-body transition-colors hover:bg-bg-sunken focus-visible:bg-bg-sunken";
// Quick actions are hover-or-focus only where a pointer can hover. A touch device has no
// hover, so there the action gives way to a caret and the whole row is the target.
const QUICK_ACTION =
  "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid pointer-coarse:hidden";
const COARSE_CARET = "hidden opacity-60 pointer-coarse:inline-block";
const NO_ADDING: ReadonlySet<string> = new Set();

export type HeaderCell = ModuleTableHeader;

export function SearchInsightsTableShell({
  children,
  count,
  headers,
  label,
  scroll,
  variant,
}: Readonly<{
  children: (range: { end: number; start: number }) => ReactNode;
  count: number;
  headers: readonly HeaderCell[];
  label: string;
  scroll: boolean;
  variant: ModuleTableVariant;
}>) {
  const [scrollTop, setScrollTop] = useState(0);
  // Collapsing takes the overflow away, so the browser clamps the element's own scrollTop to
  // zero without firing a scroll event. The offset is dropped here, during render, or the next
  // expansion would paint a band the region has already scrolled away from.
  if (!scroll && scrollTop !== 0) setScrollTop(0);
  const range = scroll
    ? windowedRange({ count, height: SCROLL_REGION_HEIGHT, scrollTop })
    : { end: count, start: 0 };
  const padding = windowedPadding(range, count);

  return (
    <div
      className={cn("overflow-x-auto", scroll && `${SCROLL_REGION_CLASS} overflow-y-auto`)}
      onScroll={scroll ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
    >
      <table
        aria-label={label}
        className={cn("w-full table-fixed border-collapse", moduleTableMinWidth[variant])}
      >
        <colgroup>
          {moduleTableColumnClasses(variant).map((columnClass, index) => (
            <col className={columnClass} key={`${columnClass}-${index}`} />
          ))}
        </colgroup>
        <thead className={tableHeaderClassName}>
          <tr>
            {headers.map((header) => (
              <th
                className={cn(
                  // A header never wraps: it names the column, and AVG POS breaking in two is the one label in
                  // this table wide enough to try. The numeric headers take the padding of the numbers below
                  // them, so the two right edges line up.
                  "sticky top-0 z-1 whitespace-nowrap bg-table-header-bg px-4 py-2 font-normal",
                  header.align ? "px-1 text-right" : "text-left",
                  header.title && "cursor-help",
                )}
                key={header.label}
                scope="col"
                title={header.title}
              >
                {header.label === "Actions" ? (
                  <span className="sr-only">Actions</span>
                ) : (
                  header.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* The rows above and below the rendered band are accounted for by their height, so
              the scrollbar still describes the whole list without their markup existing. */}
          {padding.top > 0 ? (
            <tr aria-hidden style={{ height: padding.top }}>
              <td colSpan={headers.length} />
            </tr>
          ) : null}
          {children(range)}
          {padding.bottom > 0 ? (
            <tr aria-hidden style={{ height: padding.bottom }}>
              <td colSpan={headers.length} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

const QUERY_HEADERS = moduleTableHeaders("queries");

export type SearchInsightsQueriesTableProps = {
  /** The queries whose Rank Tracker write is in flight, so their rows say so rather than inviting
      a second click at the same daily cost. */
  adding?: ReadonlySet<string>;
  onOpen?: (row: SearchInsightsQueryRow) => void;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  rows: readonly SearchInsightsQueryRow[];
  scroll?: boolean;
  tracked: ReadonlySet<string>;
};

export function SearchInsightsQueriesTable({
  adding = NO_ADDING,
  onOpen,
  onTrack,
  rows,
  scroll = false,
  tracked,
}: Readonly<SearchInsightsQueriesTableProps>) {
  return (
    <SearchInsightsTableShell
      count={rows.length}
      headers={QUERY_HEADERS}
      label="Top queries"
      scroll={scroll}
      variant="queries"
    >
      {(range) =>
        rows.slice(range.start, range.end).map((row) => {
          const open = () => onOpen?.(row);
          const isTracked = tracked.has(trackedKey(row.query));
          return (
            <tr
              className={cn(ROW, ROW_HEIGHT_CLASS)}
              key={row.query}
              onClick={open}
              onKeyDown={tableRowKeys(open)}
              tabIndex={0}
            >
              <td className={cn(CELL, "truncate")} title={row.query}>
                {row.query}
              </td>
              <td className={cn(CELL, NUMERIC, "font-semibold")}>{formatRowCount(row.clicks)}</td>
              <td className={cn(CELL, NUMERIC, "text-fg-muted")}>
                {formatRowCount(row.impressions)}
              </td>
              <td className={cn(CELL, NUMERIC, "text-fg-muted")}>{formatRowCtr(row.ctr)}</td>
              <td className={cn(CELL, NUMERIC, positionClassName(row.position))}>
                {formatRowPosition(row.position)}
              </td>
              <td className={cn(CELL, "text-right")}>
                {isTracked || adding.has(row.query) ? (
                  <span
                    className="inline-flex items-center font-mono text-ui-micro text-fg-muted"
                    title={isTracked ? TRACKED_TITLE : undefined}
                  >
                    {isTracked ? TRACKED_LABEL : TRACK_DIALOG_COPY.adding}
                  </span>
                ) : (
                  <Button
                    className={QUICK_ACTION}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTrack?.(row);
                    }}
                    size="xs"
                    title={TRACK_TITLE}
                    variant="secondary"
                  >
                    {TRACK_LABEL}
                  </Button>
                )}
                <CaretRight aria-hidden className={COARSE_CARET} size={12} weight="regular" />
              </td>
            </tr>
          );
        })
      }
    </SearchInsightsTableShell>
  );
}
