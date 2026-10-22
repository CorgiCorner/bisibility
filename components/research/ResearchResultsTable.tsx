"use client";

import {
  StoredResultFreshness,
  type StoredResultFreshness as StoredResultFreshnessData,
} from "@/components/demo-research/StoredResultFreshness";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { sortedDataTableRows } from "@/components/ui/data-table/data-table-sorting";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { ActionPaymentQuote } from "@/lib/action-payment/contract";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { researchResultsColumns } from "./research-results-columns";
import {
  RESEARCH_RESULTS_DEFAULT_PAGE_SIZE,
  RESEARCH_RESULTS_PAGE_SIZE_OPTIONS,
  RESEARCH_RESULTS_TABLE_ID,
  researchResultsSelectedKeywords,
  researchResultsSelectionIds,
  researchResultsTableRows,
} from "./research-results-table-state";
import { ResearchExportMenu } from "./research-results-view";

export type ResearchDeeperOffer = {
  cached: boolean;
  costCents: number | null;
  payment?: ActionPaymentQuote;
  nextLimit: number;
};

type ResearchResultsTableProps = {
  activeKeyword: string | null;
  search?: ReactNode;
  cached: boolean;
  canRemoveSaved: boolean;
  deeper: ResearchDeeperOffer | null;
  fetchedAt: string;
  fetchedCount: number;
  filterCount: number;
  metricsAvailable?: boolean;
  onActiveChange: (row: GroupedResearchRow) => void;
  onAddSelected?: () => void;
  onDeeper?: () => void;
  onOpenFilters: () => void;
  onSaveSelected?: (rows: GroupedResearchRow[]) => void;
  onSelectionChange?: (keywords: string[]) => void;
  onToggleSave?: (row: GroupedResearchRow) => void;
  readOnly?: boolean;
  rows: GroupedResearchRow[];
  seed: string;
  selectedKeywords: string[];
  totalCount: number;
  storedFreshness?: StoredResultFreshnessData;
  trackingMarketCount?: number;
};

export function ResearchResultsTable({
  activeKeyword,
  search,
  canRemoveSaved,
  deeper,
  fetchedCount,
  filterCount,
  onActiveChange,
  onAddSelected,
  onDeeper,
  onOpenFilters,
  onSaveSelected,
  onSelectionChange,
  onToggleSave,
  rows,
  readOnly = false,
  seed,
  selectedKeywords,
  storedFreshness,
  trackingMarketCount = 1,
  metricsAvailable = true,
}: Readonly<ResearchResultsTableProps>) {
  const locale = useLocale();
  const t = useTranslations("projectResearch.results");
  const columnsT = useTranslations("projectResearch.columns");
  const format = useFormatter();
  const columnMessages = useMemo(
    () => ({
      columns: {
        cpc: columnsT("cpc"),
        cpcTitle: columnsT("cpcTitle"),
        cpcUnavailable: columnsT("cpcUnavailable"),
        difficulty: columnsT("difficulty"),
        difficultyShort: columnsT("difficultyShort"),
        difficultyUnavailable: columnsT("difficultyUnavailable"),
        intent: columnsT("intent"),
        keyword: columnsT("keyword"),
        source: columnsT("source"),
        trend: columnsT("trend"),
        trendAria: ({ keyword }: { keyword: string }) => columnsT("trendAria", { keyword }),
        trendUnavailable: columnsT("trendUnavailable"),
        volume: columnsT("volume"),
        volumeUnavailable: columnsT("volumeUnavailable"),
      },
      formatNumber: (value: number) => format.number(value),
    }),
    [columnsT, format],
  );
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: RESEARCH_RESULTS_DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<DataTableSort | null>({
    direction: "desc",
    field: "searchVolume",
  });
  const columns = useMemo(
    () =>
      researchResultsColumns({
        canRemoveSaved,
        messages: columnMessages,
        metricsAvailable,
        onToggleSave,
      }),
    [canRemoveSaved, columnMessages, metricsAvailable, onToggleSave],
  );
  const tableRows = useMemo(() => researchResultsTableRows(rows), [rows]);
  const exportRows = useMemo(
    () => sortedDataTableRows(tableRows, columns, sorting),
    [tableRows, columns, sorting],
  );
  const selection = useMemo(
    () => researchResultsSelectionIds(tableRows, selectedKeywords),
    [selectedKeywords, tableRows],
  );
  const checksPerRun = selectedKeywords.length * trackingMarketCount;

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="md">
      {!readOnly && selectedKeywords.length > 0 ? (
        <div
          className="@container grid gap-2 border-b border-border bg-accent-soft px-4 py-2.5 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-center"
          data-testid="research-selection-toolbar"
        >
          <div
            className="flex min-w-0 items-center justify-between gap-2 @4xl:justify-start"
            data-testid="research-selection-summary"
          >
            <strong className="text-[12.5px] text-fg">
              {t("selected", { count: selectedKeywords.length })}
            </strong>
            <Button
              onClick={() => onSelectionChange?.([])}
              size="sm"
              startIcon={<X weight="regular" size={13} />}
              variant="ghost"
            >
              {t("clear")}
            </Button>
          </div>
          <div
            className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @4xl:flex @4xl:items-center"
            data-testid="research-selection-actions"
          >
            <Button
              className="w-full @4xl:w-auto"
              onClick={() => {
                const selected = new Set(selectedKeywords);
                onSaveSelected?.(rows.filter((row) => selected.has(row.keyword)));
              }}
              size="sm"
              startIcon={<BookmarkSimple weight="regular" size={14} />}
              style={{
                "--control-background-color": "var(--bg-sidebar)",
                "--control-border": "1px solid var(--accent)",
                "--control-color": "var(--accent-hover)",
                "--control-hover-background-color": "var(--bg-sidebar)",
                "--control-hover-border": "1px solid var(--accent-hover)",
              }}
              variant="secondary"
            >
              {t("saveForLater", { count: selectedKeywords.length })}
            </Button>
            <Button
              className="w-full @4xl:w-auto"
              onClick={onAddSelected}
              size="sm"
              startIcon={<Plus weight="regular" size={14} />}
            >
              {t("addToTracking", { count: selectedKeywords.length })}
              {` ${t("checksPerRun", { count: checksPerRun })}`}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        {search}
        <div
          className="ml-auto flex flex-wrap items-center justify-end gap-2"
          data-testid="research-table-actions"
        >
          <Button
            onClick={onOpenFilters}
            size="sm"
            startIcon={<Funnel weight="regular" size={14} />}
            variant="secondary"
          >
            {t("filters")}
            {filterCount > 0 ? (
              <span className="ml-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-soft px-1 font-sans tabular-nums text-[9.5px] text-accent-text">
                {filterCount}
              </span>
            ) : null}
          </Button>
          <ResearchExportMenu rows={exportRows} seed={seed} />
        </div>
        {storedFreshness ? <StoredResultFreshness {...storedFreshness} /> : null}
      </div>
      <div
        className="h-[620px] min-w-0 [&_.bv-research-save-toggle]:opacity-0 [&_.bv-research-save-toggle]:transition-[opacity,color] [&_[role=row]:hover_.bv-research-save-toggle]:opacity-100 [&_.bv-research-save-toggle:focus-visible]:opacity-100"
        data-testid="research-results-viewport"
      >
        <DataTable
          bordered={false}
          ariaLabel={t("tableAria")}
          columns={columns}
          emptyState={<p className="m-0 text-[12px] text-fg-muted">{t("empty")}</p>}
          id={RESEARCH_RESULTS_TABLE_ID}
          layout="fill"
          onPaginationChange={setPagination}
          onRowClick={onActiveChange}
          onSelectionChange={
            readOnly
              ? undefined
              : (next) =>
                  onSelectionChange?.(
                    researchResultsSelectedKeywords(tableRows, next, selectedKeywords),
                  )
          }
          onSortingChange={setSorting}
          pagination={{
            ...pagination,
            pageSizeOptions: RESEARCH_RESULTS_PAGE_SIZE_OPTIONS,
            rowCount: tableRows.length,
          }}
          paginationMode="client"
          rowClassName={(row) =>
            row.keyword === activeKeyword
              ? "!bg-accent-soft ![--dt-row-background:var(--accent-soft)] shadow-[inset_2px_0_0_var(--accent)] [&_[data-column-id=selection]]:shadow-[inset_2px_0_0_var(--accent)]"
              : undefined
          }
          rows={tableRows}
          selectable={readOnly ? undefined : (row) => !row.alreadyTracked}
          selection={readOnly ? undefined : selection}
          sorting={sorting}
          sortingMode="client"
        />
      </div>
      {deeper && onDeeper ? (
        <p className="m-0 border-t border-border px-4 py-3 text-[12px] text-fg-muted">
          {t.rich("deeper", {
            cached: deeper.payment?.cache.state === "hit" ? "true" : "false",
            cost: deeper.payment ? formatPaymentAmount(deeper.payment.charge, locale) : "none",
            count: fetchedCount,
            limit: deeper.nextLimit,
            run: (chunks) => (
              <button
                className="cursor-pointer p-0 text-[12px] font-semibold text-accent-text outline-none hover:underline focus-visible:underline"
                onClick={onDeeper}
                type="button"
              >
                {chunks}
              </button>
            ),
          })}
        </p>
      ) : null}
    </Card>
  );
}
