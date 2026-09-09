"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { relativePast } from "@/lib/format/relative-time";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useMemo, useState } from "react";
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

export type ResearchDeeperOffer = { cached: boolean; costCents: number | null; nextLimit: number };

type ResearchResultsTableProps = {
  activeKeyword: string | null;
  cached: boolean;
  canRemoveSaved: boolean;
  deeper: ResearchDeeperOffer | null;
  fetchedAt: string;
  fetchedCount: number;
  filterCount: number;
  metricsAvailable?: boolean;
  onActiveChange: (row: GroupedResearchRow) => void;
  onAddSelected: () => void;
  onDeeper: () => void;
  onOpenFilters: () => void;
  onSaveSelected: (rows: GroupedResearchRow[]) => void;
  onSelectionChange: (keywords: string[]) => void;
  onToggleSave: (row: GroupedResearchRow) => void;
  rows: GroupedResearchRow[];
  seed: string;
  selectedKeywords: string[];
  totalCount: number;
  trackingMarketCount?: number;
};

export function ResearchResultsTable({
  activeKeyword,
  cached,
  canRemoveSaved,
  deeper,
  fetchedAt,
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
  seed,
  selectedKeywords,
  totalCount,
  trackingMarketCount = 1,
  metricsAvailable = true,
}: Readonly<ResearchResultsTableProps>) {
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: RESEARCH_RESULTS_DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = useState<DataTableSort | null>({
    direction: "desc",
    field: "searchVolume",
  });
  const columns = useMemo(
    () => researchResultsColumns({ canRemoveSaved, metricsAvailable, onToggleSave }),
    [canRemoveSaved, metricsAvailable, onToggleSave],
  );
  const tableRows = useMemo(() => researchResultsTableRows(rows), [rows]);
  const selection = useMemo(
    () => researchResultsSelectionIds(tableRows, selectedKeywords),
    [selectedKeywords, tableRows],
  );
  const checksPerRun = selectedKeywords.length * trackingMarketCount;
  const fetchedAge = relativePast(new Date(fetchedAt), new Date());

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="md">
      {selectedKeywords.length > 0 ? (
        <div
          className="@container grid gap-2 border-b border-border bg-accent-soft px-4 py-2.5 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-center"
          data-testid="research-selection-toolbar"
        >
          <div
            className="flex min-w-0 items-center justify-between gap-2 @4xl:justify-start"
            data-testid="research-selection-summary"
          >
            <strong className="text-[12.5px] text-fg">{selectedKeywords.length} selected</strong>
            <Button
              onClick={() => onSelectionChange([])}
              size="sm"
              startIcon={<X weight="regular" size={13} />}
              variant="ghost"
            >
              Clear
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
                onSaveSelected(rows.filter((row) => selected.has(row.keyword)));
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
              Save {selectedKeywords.length} for later
            </Button>
            <Button
              className="w-full @4xl:w-auto"
              onClick={onAddSelected}
              size="sm"
              startIcon={<Plus weight="regular" size={14} />}
            >
              Add {selectedKeywords.length} to tracking
              {` +${checksPerRun} ${checksPerRun === 1 ? "check" : "checks"} per run`}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
        <Button
          onClick={onOpenFilters}
          size="sm"
          startIcon={<Funnel weight="regular" size={14} />}
          variant="secondary"
        >
          Filters
          {filterCount > 0 ? (
            <span className="ml-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-soft px-1 font-sans tabular-nums text-[9.5px] text-accent-text">
              {filterCount}
            </span>
          ) : null}
        </Button>
        <p className="m-0 min-w-0 flex-1 text-[12px] text-fg-muted">
          Showing <strong className="text-fg">{rows.length}</strong> of {totalCount} keywords
          {cached ? ` - cached ${fetchedAge}` : ` - fetched ${fetchedAge}`}
        </p>
        <ResearchExportMenu rows={rows} seed={seed} />
      </div>
      <div
        className="h-[620px] min-w-0 [&>[role=table]]:border-0 [&_.bv-research-save-toggle]:opacity-0 [&_.bv-research-save-toggle]:transition-[opacity,color] [&_[role=row]:hover_.bv-research-save-toggle]:opacity-100 [&_.bv-research-save-toggle:focus-visible]:opacity-100"
        data-testid="research-results-viewport"
      >
        <DataTable
          ariaLabel="Keyword research results"
          columns={columns}
          emptyState={
            <p className="m-0 text-[12px] text-fg-muted">No keywords match these filters.</p>
          }
          id={RESEARCH_RESULTS_TABLE_ID}
          layout="fill"
          onPaginationChange={setPagination}
          onRowClick={onActiveChange}
          onSelectionChange={(next) =>
            onSelectionChange(researchResultsSelectedKeywords(tableRows, next, selectedKeywords))
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
          selectable={(row) => !row.alreadyTracked}
          selection={selection}
          sorting={sorting}
          sortingMode="client"
        />
      </div>
      {deeper ? (
        <p className="m-0 border-t border-border px-4 py-3 text-[12px] text-fg-muted">
          Showing all {fetchedCount} fetched -{" "}
          <button
            className="cursor-pointer p-0 text-[12px] font-semibold text-accent-text outline-none hover:underline focus-visible:underline"
            onClick={onDeeper}
            type="button"
          >
            run with {deeper.nextLimit} results
            {deeper.cached
              ? " free, cached"
              : deeper.costCents == null
                ? ""
                : ` ~${formatEstimateCents(deeper.costCents)}`}
          </button>{" "}
          for deeper coverage
        </p>
      ) : null}
    </Card>
  );
}
