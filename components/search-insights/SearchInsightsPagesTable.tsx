"use client";

import { SegmentedControl } from "@/components/ui";
import { pageHref, type SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { cn } from "@/lib/ui/cn";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  CELL,
  type ModuleTableSort,
  NUMERIC,
  NUMERIC_SORTED,
  ROW,
  ROW_HEIGHT_CLASS,
  SearchInsightsTableShell,
} from "./SearchInsightsRowsTable";
import {
  ENGAGEMENT_RATE_TIP,
  KEY_EVENTS_TIP,
  NO_SESSIONS_MATCH_TITLE,
  PAGE_LENS_CONTROL_LABEL,
  PAGE_LENS_SEARCH_LABEL,
  PAGE_LENS_TRAFFIC_LABEL,
} from "./search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
  tableRowKeys,
} from "./search-insights-rows-model";
import { moduleTableHeaders } from "./search-insights-table-columns";

export const PAGE_LENS_QUERY_PARAM = "lens";

export type SearchInsightsPageLens = "search" | "traffic";

export function pageLensFromQuery(
  lens: string | null | undefined,
  ga4Joined: boolean,
  keyEventsConfigured: boolean | null,
): SearchInsightsPageLens {
  if (!ga4Joined) return "search";
  if (lens === "search" || lens === "traffic") return lens;
  return keyEventsConfigured === true ? "traffic" : "search";
}

export type SearchInsightsPagesLensProps = {
  lens: SearchInsightsPageLens;
  showSessions: boolean;
};

export function SearchInsightsPagesLens({
  lens,
  showSessions,
}: Readonly<SearchInsightsPagesLensProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(nextLens: SearchInsightsPageLens) {
    if (nextLens === lens || pending) return;
    const next = new URLSearchParams(searchParams);
    next.set(PAGE_LENS_QUERY_PARAM, nextLens);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  if (!showSessions) return null;

  return (
    <SegmentedControl<SearchInsightsPageLens>
      ariaLabel={PAGE_LENS_CONTROL_LABEL}
      fitContent
      loading={pending}
      name="search-insights-pages-lens"
      onChange={pick}
      options={[
        { label: PAGE_LENS_SEARCH_LABEL, value: "search" },
        { label: PAGE_LENS_TRAFFIC_LABEL, value: "traffic" },
      ]}
      size="xs"
      value={lens}
    />
  );
}

export type SearchInsightsPagesTableProps = {
  lens?: SearchInsightsPageLens;
  onOpen?: (row: SearchInsightsPageRow) => void;
  rows: readonly SearchInsightsPageRow[];
  scroll?: boolean;
  keyEventsConfigured?: boolean | null;
  showSessions?: boolean;
  sort?: ModuleTableSort;
};

export function SearchInsightsPagesTable({
  lens,
  onOpen,
  rows,
  scroll = false,
  keyEventsConfigured = null,
  showSessions = false,
  sort,
}: Readonly<SearchInsightsPagesTableProps>) {
  const activeLens = pageLensFromQuery(lens, showSessions, keyEventsConfigured);
  const showTraffic = activeLens === "traffic";
  const variant = showTraffic
    ? keyEventsConfigured === true
      ? "pagesWithKeyEvents"
      : "pagesWithSessions"
    : "pages";
  const figures = sort ? NUMERIC_SORTED : NUMERIC;
  return (
    <SearchInsightsTableShell
      count={rows.length}
      headers={moduleTableHeaders(variant)}
      label="Top pages"
      scroll={scroll}
      sort={sort}
      variant={variant}
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
              <td
                className={cn(CELL, "truncate font-sans tabular-nums text-ui-caption")}
                title={row.url}
              >
                {row.path}
              </td>
              <td className={cn(CELL, figures, "font-semibold")}>{formatRowCount(row.clicks)}</td>
              {showTraffic ? (
                <>
                  <td
                    className={cn(CELL, NUMERIC, "text-fg-muted")}
                    title={row.sessions === null ? NO_SESSIONS_MATCH_TITLE : undefined}
                  >
                    {row.sessions === null ? "-" : formatRowCount(row.sessions)}
                  </td>
                  <td
                    className={cn(CELL, NUMERIC, "text-fg-muted")}
                    title={row.engagementRate === null ? ENGAGEMENT_RATE_TIP : undefined}
                  >
                    {row.engagementRate === null ? "-" : formatRowCtr(row.engagementRate)}
                  </td>
                  {keyEventsConfigured === true ? (
                    <td
                      className={cn(CELL, NUMERIC, "text-fg-muted")}
                      title={row.keyEvents === null ? KEY_EVENTS_TIP : undefined}
                    >
                      {row.keyEvents === null ? "-" : formatRowCount(row.keyEvents)}
                    </td>
                  ) : (
                    <td className={cn(CELL, figures, positionClassName(row.position))}>
                      {formatRowPosition(row.position)}
                    </td>
                  )}
                </>
              ) : (
                <>
                  <td className={cn(CELL, figures, "text-fg-muted")}>
                    {formatRowCount(row.impressions)}
                  </td>
                  <td className={cn(CELL, figures, "text-fg-muted")}>{formatRowCtr(row.ctr)}</td>
                  <td className={cn(CELL, figures, positionClassName(row.position))}>
                    {formatRowPosition(row.position)}
                  </td>
                </>
              )}
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
