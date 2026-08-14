"use client";

import { DataGrid } from "@/components/keywords/grid/DataGrid";
import { keywordGridSx } from "@/components/keywords/grid/keyword-data-grid-config";
import { Button, Card } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { relativePast } from "@/lib/format/relative-time";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import type { GridRowSelectionModel } from "@mui/x-data-grid";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  FunnelIcon as Funnel,
  PlusIcon as Plus,
  XIcon as X,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { researchResultsColumns } from "./research-results-columns";
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
  const columns = useMemo(
    () => researchResultsColumns({ canRemoveSaved, metricsAvailable, onToggleSave }),
    [canRemoveSaved, metricsAvailable, onToggleSave],
  );
  const selectionModel: GridRowSelectionModel = { ids: new Set(selectedKeywords), type: "include" };
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
              startIcon={<X size={13} />}
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
              startIcon={<BookmarkSimple size={14} />}
              sx={{
                backgroundColor: "var(--bg-sidebar)",
                border: "1px solid var(--accent)",
                color: "var(--accent-hover)",
                "&:hover": {
                  backgroundColor: "var(--bg-sidebar)",
                  border: "1px solid var(--accent-hover)",
                },
              }}
              variant="secondary"
            >
              Save {selectedKeywords.length} for later
            </Button>
            <Button
              className="w-full @4xl:w-auto"
              onClick={onAddSelected}
              size="sm"
              startIcon={<Plus size={14} />}
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
          startIcon={<Funnel size={14} />}
          variant="secondary"
        >
          Filters
          {filterCount > 0 ? (
            <span className="ml-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-soft px-1 font-mono text-[9.5px] text-accent-text">
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
      <div className="min-w-0 overflow-x-auto">
        <div className="h-[620px] min-w-[930px]">
          <DataGrid
            checkboxSelection
            columnHeaderHeight={42}
            columns={columns}
            disableRowSelectionExcludeModel
            disableRowSelectionOnClick
            getRowClassName={({ row }) =>
              row.keyword === activeKeyword ? "bv-research-active" : ""
            }
            getRowId={(row) => row.keyword}
            hideFooter
            initialState={{ sorting: { sortModel: [{ field: "searchVolume", sort: "desc" }] } }}
            isRowSelectable={({ row }) => !row.alreadyTracked}
            onRowClick={({ row }) => onActiveChange(row)}
            onRowSelectionModelChange={(model) => onSelectionChange([...model.ids].map(String))}
            rowHeight={54}
            rowSelectionModel={selectionModel}
            rows={rows}
            sx={{
              ...keywordGridSx,
              "& .bv-research-active": {
                backgroundColor: "var(--accent-soft)",
                borderLeft: "2px solid var(--accent)",
              },
              "& .MuiDataGrid-row": { cursor: "pointer" },
              "& .bv-research-save-toggle": {
                opacity: 0,
                transition: "opacity .16s ease, color .16s ease",
              },
              "& .bv-research-save-toggle:focus-visible, & .MuiDataGrid-row:hover .bv-research-save-toggle":
                {
                  opacity: 1,
                },
            }}
          />
        </div>
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
