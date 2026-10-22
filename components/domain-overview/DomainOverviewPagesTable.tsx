"use client";

import { Button } from "@/components/ui/Button";
import { tableHeaderBorderClassName } from "@/components/ui/table-header-styles";
import type { RelevantPagesResult } from "@/lib/providers/types";
import { cn } from "@/lib/ui/cn";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
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

type PageSort = "etv" | "keywordCount" | "path";

const pageValue = {
  etv: (row: RelevantPagesResult["rows"][number]) => row.etv,
  keywordCount: (row: RelevantPagesResult["rows"][number]) => row.keywordCount,
  path: (row: RelevantPagesResult["rows"][number]) => row.path,
} satisfies Record<PageSort, (row: RelevantPagesResult["rows"][number]) => number | string | null>;

export function DomainOverviewPagesTable({
  price,
  loadMoreBlocked,
  fetchedCount,
  hasMore,
  loadMoreError = false,
  loadingMore = false,
  onLoadMore,
  result,
}: Readonly<{
  estimateCents?: number | null;
  price?: ReactNode;
  loadMoreBlocked?: boolean;
  fetchedCount?: number;
  hasMore?: boolean;
  loadMoreError?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  result: RelevantPagesResult;
}>) {
  const [sort, setSort] = useState<PageSort>("etv");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const locale = useLocale();
  const paymentT = useTranslations("shared.actionPayment");
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const rows = sortFetchedRows(result.rows, pageValue[sort], direction, locale);
  const providerFetchedCount = fetchedCount ?? result.rows.length;
  const remaining = Math.max(0, result.totalCount - providerFetchedCount);

  function selectSort(next: PageSort) {
    if (next === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDirection(next === "path" ? "asc" : "desc");
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <h3 className="m-0 text-[14.5px] font-semibold">{t("topPages")}</h3>
        <span className="ml-auto text-[12px] text-fg-muted">{t("previewFetched")}</span>
        <Button
          aria-label={t("exportPages")}
          onClick={() => downloadDomainOverviewPages(result.rows)}
          size="xs"
          startIcon={<DownloadSimple weight="regular" size={14} />}
          variant="secondary"
        >
          {t("export")}
        </Button>
      </header>
      <div className="max-h-[640px] overflow-auto">
        <div className="min-w-[480px]">
          <div
            className={cn(
              tableHeaderBorderClassName,
              "sticky top-0 z-1 grid grid-cols-[minmax(180px,1fr)_104px_86px] items-center gap-3 bg-bg-sunken px-4 py-2.5",
            )}
            data-table-header-border="header"
          >
            <SortableColumnHeader
              active={sort === "path"}
              direction={direction}
              nextDirection="asc"
              onClick={() => selectSort("path")}
              t={t}
            >
              {t("columnPage")}
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "etv"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("etv")}
              t={t}
            >
              {t("columnEstimatedTraffic")}
            </SortableColumnHeader>
            <SortableColumnHeader
              active={sort === "keywordCount"}
              align="right"
              direction={direction}
              nextDirection="desc"
              onClick={() => selectSort("keywordCount")}
              t={t}
            >
              {t("columnKeywords")}
            </SortableColumnHeader>
          </div>
          {rows.map((row) => (
            <div
              className="grid min-h-[58px] grid-cols-[minmax(180px,1fr)_104px_86px] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
              data-testid="domain-page-row"
              key={row.path}
            >
              <span className="truncate font-sans tabular-nums text-[12.5px]">{row.path}</span>
              <span
                className="text-right font-sans tabular-nums text-[12.5px] font-semibold"
                title={row.etv == null ? undefined : formatDomainEstimateExact(row.etv, locale)}
              >
                {row.etv == null ? "-" : formatDomainEstimate(row.etv, locale)}
              </span>
              <span className="text-right font-sans tabular-nums text-[12.5px] text-fg-muted">
                {row.keywordCount == null ? "-" : formatDomainCount(row.keywordCount, locale)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {(hasMore ?? remaining > 0) && onLoadMore ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-3">
          <Button
            loading={loadingMore}
            onClick={onLoadMore}
            disabled={loadMoreBlocked}
            size="sm"
            startIcon={<Plus weight="regular" size={13} />}
            variant="secondary"
          >
            {t("loadNextPages", { count: Math.min(100, remaining) })}
            {price ?? paymentT("reviewPrice")}
          </Button>
          {loadMoreError ? (
            <span className="text-[12px] text-red-text">{t("nextPagesFailed")}</span>
          ) : null}
        </div>
      ) : null}
      <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-[12px] text-fg-muted">
        {fetchedRowsSummary(providerFetchedCount, result.totalCount, "pages", t)}
        <span className="ml-auto">{t("sortingFree")}</span>
      </footer>
    </section>
  );
}
