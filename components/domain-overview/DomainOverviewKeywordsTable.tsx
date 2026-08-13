"use client";

import { Button, Checkbox, InfoTooltip } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { RankedKeywordsPage } from "@/lib/providers/types";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  DownloadSimpleIcon as DownloadSimple,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { SaveDomainKeywords } from "./domain-overview-keyword-tracking";
import {
  formatDomainCount,
  formatDomainEstimate,
  formatDomainEstimateExact,
} from "./domain-overview-metrics";
import { downloadDomainOverviewKeywords } from "./domain-overview-table-export";
import {
  fetchedRowsSummary,
  SortableColumnHeader,
  type SortDirection,
  sortFetchedRows,
} from "./domain-overview-table-sort";
import { useDomainKeywordSelection } from "./useDomainKeywordSelection";

const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  style: "currency",
});
const header = "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted";

type KeywordSort =
  | "cpc"
  | "difficulty"
  | "estimatedTraffic"
  | "keyword"
  | "position"
  | "rankAbsoluteDelta"
  | "searchVolume";

const keywordValue = {
  cpc: (row: RankedKeywordsPage["rows"][number]) => row.cpcCents,
  difficulty: (row: RankedKeywordsPage["rows"][number]) => row.difficulty,
  estimatedTraffic: (row: RankedKeywordsPage["rows"][number]) => row.estimatedTraffic,
  keyword: (row: RankedKeywordsPage["rows"][number]) => row.keyword,
  position: (row: RankedKeywordsPage["rows"][number]) => row.position,
  rankAbsoluteDelta: (row: RankedKeywordsPage["rows"][number]) => row.rankAbsoluteDelta,
  searchVolume: (row: RankedKeywordsPage["rows"][number]) => row.searchVolume,
} satisfies Record<
  KeywordSort,
  (row: RankedKeywordsPage["rows"][number]) => number | string | null
>;

function intentLabel(value: string | null) {
  if (!value) return "-";
  return value.slice(0, 4).toUpperCase();
}

function delta(value: number | null) {
  if (value == null) return { label: "-", tone: "text-fg-muted" };
  if (value === 0) return { label: "0", tone: "text-fg-muted" };
  return {
    label: `${value > 0 ? "+" : "−"}${Math.abs(value)}`,
    tone: value > 0 ? "text-green-text" : "text-red-text",
  };
}

export function DomainOverviewKeywordsTable({
  estimateCents,
  fetchedCount,
  hasMore,
  loadMoreError = false,
  loadingMore = false,
  onLoadMore,
  onSaveSelected,
  page,
}: Readonly<{
  estimateCents?: number | null;
  fetchedCount?: number;
  hasMore?: boolean;
  loadMoreError?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSaveSelected?: SaveDomainKeywords;
  page: RankedKeywordsPage;
}>) {
  const [sort, setSort] = useState<KeywordSort>("estimatedTraffic");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const rows = sortFetchedRows(page.rows, keywordValue[sort], direction);
  const selection = useDomainKeywordSelection(page.rows, onSaveSelected);
  const providerFetchedCount = fetchedCount ?? page.rows.length;
  const remaining =
    page.totalCount == null ? null : Math.max(0, page.totalCount - providerFetchedCount);
  const canLoadMore =
    hasMore ?? (page.totalCount == null ? page.rows.length >= 100 : (remaining ?? 0) > 0);

  function selectSort(next: KeywordSort) {
    if (next === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDirection(next === "keyword" ? "asc" : "desc");
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-bg-elev">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border-strong px-4 py-3">
        <h3 className="m-0 text-[14.5px] font-semibold">Top organic keywords</h3>
        <span className="ml-auto text-[12px] text-fg-muted">Preview of fetched rows</span>
        <Button
          aria-label="Export fetched keywords as CSV"
          onClick={() => downloadDomainOverviewKeywords(page.rows)}
          size="xs"
          startIcon={<DownloadSimple size={14} />}
          variant="secondary"
        >
          Export
        </Button>
        <Button
          disabled={!onSaveSelected || selection.selectedRows.length === 0}
          loading={selection.saving}
          onClick={() => void selection.saveSelected()}
          size="xs"
          startIcon={<BookmarkSimple size={13} />}
        >
          Add{" "}
          {selection.selectedRows.length > 0
            ? `${selection.selectedRows.length} selected to`
            : "to"}{" "}
          saved keywords
        </Button>
      </header>
      <div className="max-h-[640px] overflow-auto">
        <div className="min-w-[1140px]">
          <div className="sticky top-0 z-[1] grid grid-cols-[28px_minmax(180px,1.2fr)_104px_104px_82px_62px_72px_88px_minmax(180px,1fr)_70px] items-center gap-3 border-b border-border-strong bg-bg-sunken px-4 py-2.5">
            <Checkbox
              aria-label="Select all fetched keywords"
              checked={selection.allSelected}
              onChange={selection.toggleAll}
            />
            <SortableColumnHeader
              active={sort === "keyword"}
              direction={direction}
              nextDirection="asc"
              onClick={() => selectSort("keyword")}
            >
              Keyword
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "position"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("position")}
            >
              Organic pos
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "estimatedTraffic"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("estimatedTraffic")}
            >
              Est. traffic
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "searchVolume"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("searchVolume")}
            >
              Volume
            </SortableColumnHeader>
            <span className="inline-flex items-center justify-end gap-1">
              <SortableColumnHeader
                active={sort === "difficulty"}
                align="right"
                direction={direction}
                nextDirection="desc"
                onClick={() => selectSort("difficulty")}
              >
                KD
              </SortableColumnHeader>
              <InfoTooltip text="Keyword difficulty, 0 to 100." />
            </span>
            <SortableColumnHeader
              active={sort === "cpc"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("cpc")}
            >
              CPC
            </SortableColumnHeader>
            <span className={header}>Intent</span>
            <span className={header}>Ranking URL</span>
            <span className="inline-flex items-center justify-end gap-1 text-right">
              <SortableColumnHeader
                active={sort === "rankAbsoluteDelta"}
                align="right"
                direction={direction}
                nextDirection="desc"
                onClick={() => selectSort("rankAbsoluteDelta")}
              >
                SERP Δ
              </SortableColumnHeader>
              <InfoTooltip text="Absolute SERP change, including non-organic results." />
            </span>
          </div>
          {rows.map((row) => {
            const change = delta(row.rankAbsoluteDelta);
            return (
              <div
                className="grid min-h-[58px] grid-cols-[28px_minmax(180px,1.2fr)_104px_104px_82px_62px_72px_88px_minmax(180px,1fr)_70px] items-center gap-3 border-b border-border-soft px-4 py-2 last:border-b-0"
                data-testid="domain-keyword-row"
                key={`${row.keyword}:${row.rankingUrl ?? ""}`}
              >
                <Checkbox
                  aria-label={`Select keyword ${row.keyword}`}
                  checked={selection.isSelected(row)}
                  onChange={() => selection.toggleRow(row)}
                />
                <strong className="truncate text-[13.5px] font-medium">{row.keyword}</strong>
                <span className="text-right font-mono text-[12.5px]">{row.position ?? "-"}</span>
                <span
                  className="text-right font-mono text-[12.5px] font-semibold"
                  title={
                    row.estimatedTraffic == null
                      ? undefined
                      : formatDomainEstimateExact(row.estimatedTraffic)
                  }
                >
                  {row.estimatedTraffic == null ? "-" : formatDomainEstimate(row.estimatedTraffic)}
                </span>
                <span className="text-right font-mono text-[12.5px] text-fg-muted">
                  {row.searchVolume == null ? "-" : formatDomainCount(row.searchVolume)}
                </span>
                <span className="text-right font-mono text-[12.5px]">{row.difficulty ?? "-"}</span>
                <span className="text-right font-mono text-[12px] text-fg-muted">
                  {row.cpcCents == null ? "-" : currency.format(row.cpcCents / 100)}
                </span>
                <span className="w-fit rounded-full border border-border px-2 py-0.5 font-mono text-[9.5px] text-fg-muted">
                  {intentLabel(row.intent)}
                </span>
                <span className="truncate font-mono text-[11.5px] text-fg-muted">
                  {row.rankingUrl ?? "-"}
                </span>
                <span className={`${change.tone} text-right font-mono text-[12px] font-semibold`}>
                  {change.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {canLoadMore && onLoadMore ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border-soft px-4 py-3">
          <Button
            loading={loadingMore}
            onClick={onLoadMore}
            disabled={estimateCents == null}
            size="sm"
            startIcon={<Plus size={13} />}
            variant="secondary"
          >
            Load next {remaining == null ? 100 : Math.min(100, remaining)} keywords
            {estimateCents == null ? null : (
              <span className="ml-1 font-mono">~{formatEstimateCents(estimateCents)}</span>
            )}
          </Button>
          {loadMoreError ? (
            <span className="text-[12px] text-red-text">The next keyword page did not load.</span>
          ) : null}
        </div>
      ) : null}
      {selection.savingMessage ? (
        <div
          aria-live="polite"
          className="border-t border-border-soft px-4 py-2 text-[12px] text-fg-muted"
        >
          {selection.savingMessage}
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center gap-3 border-t border-border-strong px-4 py-2.5 text-[12px] text-fg-muted">
        {fetchedRowsSummary(providerFetchedCount, page.totalCount, "keywords")}
        <span className="ml-auto">Sorting the fetched rows is free</span>
      </footer>
    </section>
  );
}
