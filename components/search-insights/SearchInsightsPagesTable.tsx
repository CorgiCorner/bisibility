"use client";

import { pageHref, type SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { cn } from "@/lib/ui/cn";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react";
import {
  CELL,
  NUMERIC,
  ROW,
  ROW_HEIGHT_CLASS,
  SearchInsightsTableShell,
} from "./SearchInsightsRowsTable";
import { NO_SESSIONS_MATCH_TITLE } from "./search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
  tableRowKeys,
} from "./search-insights-rows-model";
import { moduleTableHeaders } from "./search-insights-table-columns";

export type SearchInsightsPagesTableProps = {
  onOpen?: (row: SearchInsightsPageRow) => void;
  rows: readonly SearchInsightsPageRow[];
  scroll?: boolean;
  showSessions?: boolean;
};

export function SearchInsightsPagesTable({
  onOpen,
  rows,
  scroll = false,
  showSessions = false,
}: Readonly<SearchInsightsPagesTableProps>) {
  return (
    <SearchInsightsTableShell
      count={rows.length}
      headers={moduleTableHeaders(showSessions ? "pagesWithSessions" : "pages")}
      label="Top pages"
      scroll={scroll}
      variant={showSessions ? "pagesWithSessions" : "pages"}
    >
      {(range) =>
        rows.slice(range.start, range.end).map((row) => {
          const open = () => onOpen?.(row);
          const href = pageHref(row.url);
          return (
            <tr
              className={cn(ROW, ROW_HEIGHT_CLASS)}
              key={row.url}
              onClick={open}
              onKeyDown={tableRowKeys(open)}
              tabIndex={0}
            >
              <td className={cn(CELL, "truncate font-mono text-ui-caption")} title={row.url}>
                {row.path}
              </td>
              <td className={cn(CELL, NUMERIC, "font-semibold")}>{formatRowCount(row.clicks)}</td>
              {showSessions ? null : (
                <td className={cn(CELL, NUMERIC, "text-fg-muted")}>
                  {formatRowCount(row.impressions)}
                </td>
              )}
              <td className={cn(CELL, NUMERIC, "text-fg-muted")}>{formatRowCtr(row.ctr)}</td>
              <td className={cn(CELL, NUMERIC, positionClassName(row.position))}>
                {formatRowPosition(row.position)}
              </td>
              {showSessions ? (
                <td
                  className={cn(CELL, NUMERIC, "text-fg-muted")}
                  title={row.sessions === null ? NO_SESSIONS_MATCH_TITLE : undefined}
                >
                  {row.sessions === null ? "-" : formatRowCount(row.sessions)}
                </td>
              ) : null}
              <td className={cn(CELL, "text-right")}>
                {href ? (
                  <a
                    className="inline-grid h-6 w-6 place-items-center rounded-control border border-border-control opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                    title={`Open ${href}`}
                  >
                    <ArrowUpRight aria-hidden size={12} weight="regular" />
                  </a>
                ) : null}
              </td>
            </tr>
          );
        })
      }
    </SearchInsightsTableShell>
  );
}
