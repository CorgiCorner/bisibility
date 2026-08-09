"use client";

import type {
  KeywordDetailActions,
  KeywordWorkspaceActions,
} from "@/components/keywords/action-utils";
import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Card, ConfirmModal, SummaryStrip } from "@/components/ui";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import type { GridCellParams, GridDensity, GridRowSelectionModel } from "@mui/x-data-grid";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { BulkActionBar } from "./BulkActionBar";
import { DeferredDataGrid } from "./DeferredDataGrid";
import { keywordColumns } from "./grid-columns";
import { renderedRowHeightForDensity } from "./grid-density";
import { type CheckHealthView, KeywordGridHealthNotices } from "./KeywordGridHealthNotices";
import { KeywordsFilterBar } from "./KeywordsFilterBar";
import { KeywordNoRowsOverlay, type KeywordNoRowsState } from "./KeywordTableStatus";
import {
  defaultKeywordColumnVisibility,
  initialKeywordGridState,
  keywordGridSx,
  keywordTableCardSx,
} from "./keyword-data-grid-config";
import { buildKeywordWeeklySummary } from "./keyword-weekly-summary";

const GRID_CHECKBOX_SELECTION_FIELD = "__check__";

const KeywordEditDrawer = dynamic(
  () => import("@/components/keywords/KeywordEditDrawer").then((mod) => mod.KeywordEditDrawer),
  { ssr: false },
);

declare module "@mui/x-data-grid" {
  interface NoRowsOverlayPropsOverrides {
    state?: KeywordNoRowsState;
  }
}

type KeywordDataTableProps = Omit<KeywordWorkspaceActions, "addKeywordsAction"> &
  Pick<KeywordDetailActions, "updateKeywordAction" | "updateKeywordScheduleAction"> & {
    canDeleteKeyword: boolean;
    canUpdateKeyword: boolean;
    checkFailed: boolean;
    checkHealth?: CheckHealthView;
    filterChips: KeywordFilterChip[];
    filterCount: number;
    onAddKeyword?: () => void;
    onClearFilters: () => void;
    onDismissFailure: () => void;
    onImportCsv?: () => void;
    onOpenExport: (selectedIds: string[]) => void;
    onOpenFilters: () => void;
    onRemoveFilter: (key: string) => void;
    onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
    onSearchChange: (value: string) => void;
    pendingCheckIds: ReadonlySet<string>;
    projectId: string;
    rows: KeywordRow[];
    noRowsState?: KeywordNoRowsState;
    searchValue: string;
    savedViewControl?: ReactNode;
    scopeChip?: ReactNode;
    scopeControl?: ReactNode;
  };

function handleCellClick(params: GridCellParams, event: MouseEvent) {
  if (params.field === GRID_CHECKBOX_SELECTION_FIELD || params.field === "actions") {
    event.stopPropagation();
  }
}

export function KeywordDataTable({
  bulkClearTargetAction,
  bulkDeleteAction,
  bulkSetFrequencyAction,
  bulkSetTargetAction,
  bulkTagAction,
  canDeleteKeyword,
  canUpdateKeyword,
  checkFailed,
  checkHealth,
  filterChips,
  filterCount,
  onAddKeyword,
  onClearFilters,
  onDismissFailure,
  onImportCsv,
  onOpenExport,
  onOpenFilters,
  onRemoveFilter,
  onRunChecks,
  onSearchChange,
  pendingCheckIds,
  projectId,
  rows,
  noRowsState,
  savedViewControl,
  searchValue,
  scopeChip,
  scopeControl,
  updateKeywordAction,
  updateKeywordScheduleAction,
}: KeywordDataTableProps) {
  const router = useRouter();
  const [columnVisibilityModel, setColumnVisibilityModel] = useState(
    defaultKeywordColumnVisibility,
  );
  const [density, setDensity] = useState<GridDensity>("standard");
  const [deletingKeyword, setDeletingKeyword] = useState<KeywordRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<{
    focusTargetUrl: boolean;
    row: KeywordRow;
  } | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const getRowHeight = useCallback(() => renderedRowHeightForDensity(density), [density]);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    ids: new Set(),
    type: "include",
  });
  const selectedIds = [...rowSelectionModel.ids].map(String);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const weeklySummary = useMemo(() => buildKeywordWeeklySummary(rows), [rows]);
  const columns = useMemo(
    () =>
      keywordColumns(
        {
          onDelete: setDeletingKeyword,
          onEdit: (row) => setEditing({ focusTargetUrl: false, row }),
          onRunCheck: (row) => onRunChecks([row.id]),
          canDeleteKeyword,
          canUpdateKeyword,
        },
        projectId,
        pendingCheckIds,
      ),
    [canDeleteKeyword, canUpdateKeyword, onRunChecks, pendingCheckIds, projectId],
  );
  const gridSlots = {
    noRowsOverlay: KeywordNoRowsOverlay,
  };

  async function handleDeleteKeyword() {
    if (!deletingKeyword) return;
    setDeleting(true);
    setRowActionError(null);
    try {
      await bulkDeleteAction({ keywordIds: [deletingKeyword.id], projectId });
      setDeletingKeyword(null);
      router.refresh();
    } catch (error) {
      setRowActionError(actionErrorMessage(error, "The keyword could not be deleted."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden p-0" size="md" sx={keywordTableCardSx}>
      <KeywordsFilterBar
        columnVisibilityModel={columnVisibilityModel}
        density={density}
        filterChips={filterChips}
        filterCount={filterCount}
        onAddKeyword={onAddKeyword}
        onClearFilters={onClearFilters}
        onColumnVisibilityChange={setColumnVisibilityModel}
        onDensityChange={setDensity}
        onImportCsv={onImportCsv}
        onOpenExport={() => onOpenExport(selectedIds)}
        onOpenFilters={onOpenFilters}
        onRemoveFilter={onRemoveFilter}
        onSearchChange={onSearchChange}
        savedViewControl={savedViewControl}
        searchValue={searchValue}
        scopeChip={scopeChip}
        scopeControl={scopeControl}
      />
      <BulkActionBar
        budget={checkHealth?.budget}
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetFrequencyAction={bulkSetFrequencyAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        canUpdateKeyword={canUpdateKeyword}
        checksRunning={selectedIds.some((id) => pendingCheckIds.has(id))}
        onClear={() => setRowSelectionModel({ ids: new Set(), type: "include" })}
        onRunChecks={onRunChecks}
        projectId={projectId}
        providerRate={checkHealth?.providerRate}
        selectedRows={selectedRows}
      />
      <KeywordGridHealthNotices
        checkFailed={checkFailed}
        checkHealth={checkHealth}
        onDismissFailure={onDismissFailure}
        onRunChecks={onRunChecks}
        projectRef={projectId}
        rows={rows}
      />
      {rowActionError ? (
        <p className="m-0 border-b border-border px-4 py-2 font-mono text-[11.5px] text-red-text">
          {rowActionError}
        </p>
      ) : null}
      {weeklySummary ? (
        <SummaryStrip
          className="rounded-none border-b border-border px-4"
          sentence={weeklySummary.sentence}
          tone={weeklySummary.tone}
        />
      ) : null}
      <div className="min-w-0 overflow-hidden">
        <div className="min-w-0 overflow-x-auto">
          <div
            className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] min-w-[1080px]"
            data-testid="keywords-grid-viewport"
          >
            <DeferredDataGrid
              checkboxSelection
              columnHeaderHeight={42}
              columnVisibilityModel={columnVisibilityModel}
              columns={columns}
              density={density}
              disableRowSelectionExcludeModel
              disableRowSelectionOnClick
              getRowHeight={getRowHeight}
              initialState={initialKeywordGridState}
              onCellClick={handleCellClick}
              onColumnVisibilityModelChange={setColumnVisibilityModel}
              onDensityChange={setDensity}
              onRowClick={(params) => router.push(appPath(projectId, "keywords", params.row.id))}
              onRowSelectionModelChange={setRowSelectionModel}
              pageSizeOptions={[10, 25, 50]}
              pagination
              rowSelectionModel={rowSelectionModel}
              rows={rows}
              slotProps={{ noRowsOverlay: { state: noRowsState } }}
              slots={gridSlots}
              sx={keywordGridSx}
            />
          </div>
        </div>
      </div>
      {canUpdateKeyword && editing ? (
        <KeywordEditDrawer
          focusTargetUrl={editing.focusTargetUrl}
          key={`${editing.row.id}-${editing.focusTargetUrl ? "target" : "details"}`}
          keyword={editing.row}
          onClose={() => setEditing(null)}
          open
          projectId={projectId}
          providerRate={checkHealth?.providerRate}
          updateKeywordAction={updateKeywordAction}
          updateKeywordScheduleAction={updateKeywordScheduleAction}
        />
      ) : null}
      <ConfirmModal
        busy={deleting}
        kind="deleteKeyword"
        onClose={() => setDeletingKeyword(null)}
        onConfirm={() => void handleDeleteKeyword()}
        open={Boolean(deletingKeyword)}
      />
    </Card>
  );
}

export type { CheckHealthView } from "./KeywordGridHealthNotices";
