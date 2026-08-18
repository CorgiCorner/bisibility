"use client";

import { Button, InfoTooltip } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { RelevantPagesResult } from "@/lib/providers/types";
import { DownloadSimpleIcon as DownloadSimple, PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";
import {
  formatDomainCount,
  formatDomainEstimate,
  formatDomainEstimateExact,
} from "./domain-overview-metrics";
import { downloadDomainOverviewPages } from "./domain-overview-table-export";
import {
  fetchedRowsSummary,
  SortableColumnHeader,
  type SortDirection,
  sortFetchedRows,
} from "./domain-overview-table-sort";

type PageSort =
  | "etv"
  | "etvDeltaPct"
  | "keywordCount"
  | "path"
  | "topKeyword"
  | "topKeywordPosition";

const pageValue = {
  etv: (row: RelevantPagesResult["rows"][number]) => row.etv,
  etvDeltaPct: (row: RelevantPagesResult["rows"][number]) => row.etvDeltaPct,
  keywordCount: (row: RelevantPagesResult["rows"][number]) => row.keywordCount,
  path: (row: RelevantPagesResult["rows"][number]) => row.path,
  topKeyword: (row: RelevantPagesResult["rows"][number]) => row.topKeyword,
  topKeywordPosition: (row: RelevantPagesResult["rows"][number]) => row.topKeywordPosition,
} satisfies Record<PageSort, (row: RelevantPagesResult["rows"][number]) => number | string | null>;

function delta(value: number | null) {
  if (value == null) return { label: "-", tone: "text-fg-muted" };
  if (value === 0) return { label: "0%", tone: "text-fg-muted" };
  return {
    label: `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`,
    tone: value > 0 ? "text-green-text" : "text-red-text",
  };
}

export function DomainOverviewPagesTable({
  estimateCents,
  fetchedCount,
  hasMore,
  loadMoreError = false,
  loadingMore = false,
  onLoadMore,
  result,
}: Readonly<{
  estimateCents?: number | null;
  fetchedCount?: number;
  hasMore?: boolean;
  loadMoreError?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  result: RelevantPagesResult;
}>) {
  const [sort, setSort] = useState<PageSort>("etv");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const rows = sortFetchedRows(result.rows, pageValue[sort], direction);
  const providerFetchedCount = fetchedCount ?? result.rows.length;
  const remaining = Math.max(0, result.totalCount - providerFetchedCount);

  function selectSort(next: PageSort) {
    if (next === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDirection(next === "path" || next === "topKeyword" ? "asc" : "desc");
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-bg-elev">
      <header className="flex items-center gap-2.5 border-b border-border-strong px-4 py-3">
        <h3 className="m-0 text-[14.5px] font-semibold">Top pages</h3>
        <span className="ml-auto text-[12px] text-fg-muted">Preview of fetched rows</span>
        <Button
          aria-label="Export fetched pages as CSV"
          onClick={() => downloadDomainOverviewPages(result.rows)}
          size="xs"
          startIcon={<DownloadSimple size={14} />}
          variant="secondary"
        >
          Export
        </Button>
      </header>
      <div className="max-h-[640px] overflow-auto">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-1 grid grid-cols-[minmax(220px,1.25fr)_104px_86px_minmax(180px,1fr)_96px_86px] items-center gap-3 border-b border-border-strong bg-bg-sunken px-4 py-2.5">
            <SortableColumnHeader
              active={sort === "path"}
              direction={direction}
              nextDirection="asc"
              onClick={() => selectSort("path")}
            >
              Page
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "etv"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("etv")}
            >
              Est. traffic
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "keywordCount"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("keywordCount")}
            >
              Keywords
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "topKeyword"}
              direction={direction}
              nextDirection="asc"
              onClick={() => selectSort("topKeyword")}
            >
              Top keyword
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "topKeywordPosition"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("topKeywordPosition")}
            >
              Organic pos
            </SortableColumnHeader>
            <span className="inline-flex items-center justify-end gap-1 text-right">
              <SortableColumnHeader
                active={sort === "etvDeltaPct"}
                align="right"
                direction={direction}
                nextDirection="desc"
                onClick={() => selectSort("etvDeltaPct")}
              >
                Traffic Δ
              </SortableColumnHeader>
              <InfoTooltip text="Change in estimated traffic for this page." />
            </span>
          </div>
          {rows.map((row) => {
            const change = delta(row.etvDeltaPct);
            return (
              <div
                className="grid min-h-[58px] grid-cols-[minmax(220px,1.25fr)_104px_86px_minmax(180px,1fr)_96px_86px] items-center gap-3 border-b border-border-soft px-4 py-2 last:border-b-0"
                data-testid="domain-page-row"
                key={row.path}
              >
                <span className="truncate font-mono text-[12.5px]">{row.path}</span>
                <span
                  className="text-right font-mono text-[12.5px] font-semibold"
                  title={row.etv == null ? undefined : formatDomainEstimateExact(row.etv)}
                >
                  {row.etv == null ? "-" : formatDomainEstimate(row.etv)}
                </span>
                <span className="text-right font-mono text-[12.5px] text-fg-muted">
                  {row.keywordCount == null ? "-" : formatDomainCount(row.keywordCount)}
                </span>
                <span className="truncate text-[13px] text-fg-muted">{row.topKeyword ?? "-"}</span>
                <span className="text-right font-mono text-[12.5px]">
                  {row.topKeywordPosition ?? "-"}
                </span>
                <span className={`${change.tone} text-right font-mono text-[12px] font-semibold`}>
                  {change.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {(hasMore ?? remaining > 0) && onLoadMore ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border-soft px-4 py-3">
          <Button
            loading={loadingMore}
            onClick={onLoadMore}
            disabled={estimateCents == null}
            size="sm"
            startIcon={<Plus size={13} />}
            variant="secondary"
          >
            Load next {Math.min(100, remaining)} pages
            {estimateCents == null ? null : (
              <span className="ml-1 font-mono">~{formatEstimateCents(estimateCents)}</span>
            )}
          </Button>
          {loadMoreError ? (
            <span className="text-[12px] text-red-text">The next page batch did not load.</span>
          ) : null}
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center gap-3 border-t border-border-strong px-4 py-2.5 text-[12px] text-fg-muted">
        {fetchedRowsSummary(providerFetchedCount, result.totalCount, "pages")}
        <span className="ml-auto">Sorting the fetched rows is free</span>
      </footer>
    </section>
  );
}
