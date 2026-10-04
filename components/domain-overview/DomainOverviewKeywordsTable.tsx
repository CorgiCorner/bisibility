"use client";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { RankedKeywordsPage } from "@/lib/providers/types";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { DomainOverviewRankingLink } from "./DomainOverviewRankingLink";
import { type KeywordSort, keywordValue } from "./domain-overview-keyword-table-model";
import { keywordTableGrid } from "./domain-overview-keyword-table-styles";
import type { SaveDomainKeywords } from "./domain-overview-keyword-tracking";
import {
  formatDomainCount,
  formatDomainEstimate,
  formatDomainEstimatedCost,
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

const header =
  "font-sans tabular-nums text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted";
function delta(value: number | null, locale: string) {
  if (value == null) return { label: "-", tone: "text-fg-muted" };
  if (value === 0) return { label: formatDomainCount(0, locale), tone: "text-fg-muted" };
  return {
    label: `${value > 0 ? "+" : "−"}${formatDomainCount(Math.abs(value), locale)}`,
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
  readOnly = false,
}: Readonly<{
  estimateCents?: number | null;
  fetchedCount?: number;
  hasMore?: boolean;
  loadMoreError?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSaveSelected?: SaveDomainKeywords;
  page: RankedKeywordsPage;
  readOnly?: boolean;
}>) {
  const [sort, setSort] = useState<KeywordSort>("estimatedTraffic");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const locale = useLocale();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const currency = new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  });
  const rows = sortFetchedRows(page.rows, keywordValue[sort], direction, locale);
  const selection = useDomainKeywordSelection(page.rows, t, readOnly ? undefined : onSaveSelected);
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
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
        <h3 className="m-0 text-[14.5px] font-semibold">{t("topOrganicKeywords")}</h3>
        <span className="ml-auto text-[12px] text-fg-muted">{t("previewFetched")}</span>
        <Button
          aria-label={t("exportKeywords")}
          onClick={() => downloadDomainOverviewKeywords(page.rows)}
          size="xs"
          startIcon={<DownloadSimple weight="regular" size={14} />}
          variant="secondary"
        >
          {t("export")}
        </Button>
        {!readOnly ? (
          <Button
            disabled={!onSaveSelected || selection.selectedRows.length === 0}
            loading={selection.saving}
            onClick={() => void selection.saveSelected()}
            size="xs"
            startIcon={<BookmarkSimple weight="regular" size={13} />}
          >
            {t("addToSaved", { count: selection.selectedRows.length })}
          </Button>
        ) : null}
      </header>
      <div className="max-h-[640px] overflow-auto">
        <div className="min-w-[1140px]">
          <div
            className={`sticky top-0 z-1 grid ${keywordTableGrid(readOnly)} items-center gap-3 border-b border-border bg-bg-elev px-4 py-2.5`}
          >
            {!readOnly ? (
              <Checkbox
                aria-label={t("selectAllKeywords")}
                checked={selection.allSelected}
                onChange={selection.toggleAll}
              />
            ) : null}
            <SortableColumnHeader
              active={sort === "keyword"}
              direction={direction}
              nextDirection="asc"
              onClick={() => selectSort("keyword")}
              t={t}
            >
              {t("columnKeyword")}
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "position"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("position")}
              t={t}
            >
              {t("columnOrganicPosition")}
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "estimatedTraffic"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("estimatedTraffic")}
              t={t}
            >
              {t("columnEstimatedTraffic")}
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "searchVolume"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("searchVolume")}
              t={t}
            >
              {t("columnVolume")}
            </SortableColumnHeader>
            <span className="inline-flex items-center justify-end gap-1">
              <SortableColumnHeader
                active={sort === "difficulty"}
                align="right"
                direction={direction}
                nextDirection="desc"
                onClick={() => selectSort("difficulty")}
                t={t}
              >
                KD
              </SortableColumnHeader>
              <InfoTooltip text={t("keywordDifficultyTooltip")} />
            </span>
            <SortableColumnHeader
              active={sort === "cpc"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("cpc")}
              t={t}
            >
              CPC
            </SortableColumnHeader>
            <span className={header}>{t("columnIntent")}</span>
            <span className={header}>{t("columnRankingUrl")}</span>
            <span className="inline-flex items-center justify-end gap-1 text-right">
              <SortableColumnHeader
                active={sort === "rankAbsoluteDelta"}
                align="right"
                direction={direction}
                nextDirection="desc"
                onClick={() => selectSort("rankAbsoluteDelta")}
                t={t}
              >
                {t("columnSerpChange")}
              </SortableColumnHeader>
              <InfoTooltip text={t("serpChangeTooltip")} />
            </span>
          </div>
          {rows.map((row) => {
            const change = delta(row.rankAbsoluteDelta, locale);
            return (
              <div
                className={`grid min-h-[58px] ${keywordTableGrid(readOnly)} items-center gap-3 border-b border-border px-4 py-2 last:border-b-0`}
                data-testid="domain-keyword-row"
                key={`${row.keyword}:${row.rankingUrl ?? ""}`}
              >
                {!readOnly ? (
                  <Checkbox
                    aria-label={t("selectKeyword", { keyword: row.keyword })}
                    checked={selection.isSelected(row)}
                    onChange={() => selection.toggleRow(row)}
                  />
                ) : null}
                <strong className="truncate text-[13.5px] font-medium">{row.keyword}</strong>
                <span className="text-right font-sans tabular-nums text-[12.5px]">
                  {row.position == null ? "-" : formatDomainCount(row.position, locale)}
                </span>
                <span
                  className="text-right font-sans tabular-nums text-[12.5px] font-semibold"
                  title={
                    row.estimatedTraffic == null
                      ? undefined
                      : formatDomainEstimateExact(row.estimatedTraffic, locale)
                  }
                >
                  {row.estimatedTraffic == null
                    ? "-"
                    : formatDomainEstimate(row.estimatedTraffic, locale)}
                </span>
                <span className="text-right font-sans tabular-nums text-[12.5px] text-fg-muted">
                  {row.searchVolume == null ? "-" : formatDomainCount(row.searchVolume, locale)}
                </span>
                <span className="text-right font-sans tabular-nums text-[12.5px]">
                  {row.difficulty == null ? "-" : formatDomainCount(row.difficulty, locale)}
                </span>
                <span className="text-right font-sans tabular-nums text-[12px] text-fg-muted">
                  {row.cpcCents == null ? "-" : currency.format(row.cpcCents / 100)}
                </span>
                <span className="w-fit rounded-full border border-border px-2 py-0.5 font-sans tabular-nums text-[9.5px] text-fg-muted">
                  {row.intent?.slice(0, 4).toUpperCase() || "-"}
                </span>
                {row.rankingUrl ? (
                  <DomainOverviewRankingLink href={row.rankingUrl} />
                ) : (
                  <span className="text-fg-muted">-</span>
                )}
                <span
                  className={`${change.tone} text-right font-sans tabular-nums text-[12px] font-semibold`}
                >
                  {change.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {canLoadMore && onLoadMore ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-3">
          <Button
            loading={loadingMore}
            onClick={onLoadMore}
            disabled={estimateCents == null}
            size="sm"
            startIcon={<Plus weight="regular" size={13} />}
            variant="secondary"
          >
            {t("loadNextKeywords", { count: remaining == null ? 100 : Math.min(100, remaining) })}
            {estimateCents == null ? null : (
              <span className="ml-1 font-sans tabular-nums">
                {formatDomainEstimatedCost(estimateCents, locale, t)}
              </span>
            )}
          </Button>
          {loadMoreError ? (
            <span className="text-[12px] text-red-text">{t("nextKeywordsFailed")}</span>
          ) : null}
        </div>
      ) : null}
      {selection.savingMessage ? (
        <div
          aria-live="polite"
          className="border-t border-border px-4 py-2 text-[12px] text-fg-muted"
        >
          {selection.savingMessage}
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-[12px] text-fg-muted">
        {fetchedRowsSummary(providerFetchedCount, page.totalCount, "keywords", t)}
        <span className="ml-auto">{t("sortingFree")}</span>
      </footer>
    </section>
  );
}
