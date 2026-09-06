"use client";
import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Card, ConfirmModal, SummaryStrip } from "@/components/ui";
import {
  rankTrackerMutationPresence,
  rankTrackerNavigationHref,
  rankTrackerSortFromGrid,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import type {
  RankTrackerQueryField,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import type {
  GridDensity,
  GridPaginationModel,
  GridRowSelectionModel,
  GridSortModel,
} from "@mui/x-data-grid";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { BulkActionBar } from "./BulkActionBar";
import { keywordColumns } from "./grid-columns";
import { persistKeywordGridDensity, renderedRowHeightForDensity } from "./grid-density";
import { KeywordGridHealthNotices } from "./KeywordGridHealthNotices";
import { KeywordGridViewport } from "./KeywordGridViewport";
import { KeywordsFilterBar } from "./KeywordsFilterBar";
import {
  defaultKeywordColumnVisibility,
  initialKeywordGridState,
  keywordTableCardSx,
} from "./keyword-data-grid-config";
import type { KeywordDataTableProps } from "./keyword-data-table-types";
import { buildKeywordWeeklySummary } from "./keyword-weekly-summary";
import { useMarketGridView } from "./use-market-grid-view";

const KeywordEditDrawer = dynamic(
  () => import("@/components/keywords/KeywordEditDrawer").then((mod) => mod.KeywordEditDrawer),
  { ssr: false },
);
// biome-ignore format: Compact parameter destructuring keeps this production module within 300 lines.
export function KeywordDataTable({ bulkClearTargetAction, bulkDeleteAction, bulkSetTargetAction, bulkTagAction, canDeleteKeyword, canUpdateKeyword, checkFailed, checkHealth, filterChips, filterCount, initialDensity, listMode = "grouped-client", marketScope = null, matchedTargetCount, page, pageSize, query, onAddKeyword, onClearFilters, onDismissFailure, onImportCsv, onOpenExport, onOpenFilters, onQueryNavigation, onRemoveFilter, onRunChecks, onSearchChange, onSearchCommit, pendingCheckIds, providerConnected, projectId, projectMarkets, rows, noRowsState, savedViewControl, searchValue, scopeChip, scopeControl, updateKeywordAction }: KeywordDataTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flatServer = listMode === "flat-server" && query !== undefined;
  const [columnVisibilityModel, setColumnVisibilityModel] = useState(
    defaultKeywordColumnVisibility,
  );
  const [density, setDensity] = useState<GridDensity>(initialDensity ?? "standard");
  const [clientPaginationModel, setClientPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    ...initialKeywordGridState.pagination.paginationModel,
  });
  const paginationModel = flatServer
    ? { page: Math.max(0, (page ?? query.page) - 1), pageSize: pageSize ?? query.pageSize }
    : clientPaginationModel;
  // biome-ignore format: Compact to preserve the production source line limit.
  const [deletingKeyword, setDeletingKeyword] = useState<KeywordRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<{ focusTargetUrl: boolean; row: KeywordRow } | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const getRowHeight = useCallback(() => renderedRowHeightForDensity(density), [density]);
  const onRefreshData = useCallback(() => router.refresh(), [router]);
  function handleDensityChange(next: GridDensity) {
    setDensity(next);
    persistKeywordGridDensity(next);
  }
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    ids: new Set(),
    type: "include",
  });
  const navigate = (next: RankTrackerQueryState, present: RankTrackerQueryField[]) => {
    onQueryNavigation?.();
    const rebased = query && searchValue !== query.search ? { ...next, search: searchValue } : next;
    router.push(
      rankTrackerNavigationHref({
        basePath: appPath(projectId, "rank-tracker"),
        current: searchParams,
        present: rankTrackerMutationPresence(query ?? rebased, rebased, present),
        query: rebased,
      }),
    );
  };
  const {
    groupingControl,
    selectedTargetIds,
    setSortModel,
    sortModel,
    sortingMode,
    toggleParent,
    viewRows,
  } = useMarketGridView(
    rows,
    flatServer ? query.grouped : undefined,
    flatServer
      ? (grouped) => navigate(resetRankTrackerPage({ ...query, grouped }), ["grouped", "page"])
      : undefined,
  );
  const effectiveRows = flatServer ? rows : viewRows;
  const effectiveSortModel: GridSortModel = flatServer
    ? [{ field: query.sort.field, sort: query.sort.direction }]
    : sortModel;
  const selectedIds = selectedTargetIds(new Set([...rowSelectionModel.ids].map(String)));
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
      throw error;
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
        groupingControl={groupingControl}
        onAddKeyword={onAddKeyword}
        onClearFilters={onClearFilters}
        onColumnVisibilityChange={setColumnVisibilityModel}
        onDensityChange={handleDensityChange}
        onImportCsv={onImportCsv}
        onOpenExport={() => onOpenExport(selectedIds)}
        onOpenFilters={onOpenFilters}
        onRefresh={onRefreshData}
        onRemoveFilter={onRemoveFilter}
        onSearchChange={onSearchChange}
        onSearchCommit={onSearchCommit}
        savedViewControl={savedViewControl}
        searchValue={searchValue}
        scopeChip={scopeChip}
        scopeControl={scopeControl}
      />
      <BulkActionBar
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        canUpdateKeyword={canUpdateKeyword}
        checksRunning={selectedIds.some((id) => pendingCheckIds.has(id))}
        marketScope={marketScope}
        onClear={() => setRowSelectionModel({ ids: new Set(), type: "include" })}
        onRunChecks={onRunChecks}
        projectId={projectId}
        providerConnected={providerConnected}
        providerRate={checkHealth?.providerRate}
        selectedRows={selectedRows}
      />
      {flatServer ? null : (
        <KeywordGridHealthNotices
          checkFailed={checkFailed}
          checkHealth={checkHealth}
          onDismissFailure={onDismissFailure}
          onRunChecks={onRunChecks}
          projectRef={projectId}
          rows={rows}
        />
      )}
      {rowActionError ? (
        <p className="m-0 border-b border-border px-4 py-2 font-sans tabular-nums text-[11.5px] text-red-text">
          {rowActionError}
        </p>
      ) : null}
      {!flatServer && weeklySummary ? (
        <SummaryStrip
          className="rounded-none border-b border-border px-4"
          sentence={weeklySummary.sentence}
          tone={weeklySummary.tone}
        />
      ) : null}
      <KeywordGridViewport
        columnVisibilityModel={columnVisibilityModel}
        columns={columns}
        density={density}
        getRowHeight={getRowHeight}
        noRowsState={noRowsState}
        onColumnVisibilityModelChange={setColumnVisibilityModel}
        onDensityChange={handleDensityChange}
        onNavigate={(keywordId) => router.push(appPath(projectId, "rank-tracker", keywordId))}
        onPaginationModelChange={(model) => {
          if (
            flatServer &&
            (model.page !== paginationModel.page || model.pageSize !== paginationModel.pageSize)
          )
            navigate(
              {
                ...query,
                page: model.page + 1,
                pageSize: model.pageSize as RankTrackerQueryState["pageSize"],
              },
              ["page", "pageSize"],
            );
          else setClientPaginationModel(model);
        }}
        onRowSelectionModelChange={setRowSelectionModel}
        onSortModelChange={(model) => {
          if (flatServer) {
            const sort = rankTrackerSortFromGrid(model[0]);
            if (sort.field === query.sort.field && sort.direction === query.sort.direction) return;
            navigate(
              resetRankTrackerPage({ ...query, sort }),
              ["sort", "direction", "page"],
            );
          } else setSortModel(model);
        }}
        paginationModel={paginationModel}
        rowSelectionModel={rowSelectionModel}
        paginationMode={flatServer ? "server" : "client"}
        rowCount={flatServer ? matchedTargetCount : undefined}
        rows={effectiveRows}
        sortingMode={flatServer ? "server" : sortingMode}
        sortModel={effectiveSortModel}
        toggleParent={toggleParent}
      />
      {canUpdateKeyword && editing ? (
        <KeywordEditDrawer
          focusTargetUrl={editing.focusTargetUrl}
          key={`${editing.row.id}-${editing.focusTargetUrl ? "target" : "details"}`}
          keyword={editing.row}
          onClose={() => setEditing(null)}
          open
          projectId={projectId}
          projectMarkets={projectMarkets}
          providerRate={checkHealth?.providerRate}
          updateKeywordAction={updateKeywordAction}
        />
      ) : null}
      <ConfirmModal
        busy={deleting}
        kind="deleteKeyword"
        onClose={() => setDeletingKeyword(null)}
        onConfirm={handleDeleteKeyword}
        open={Boolean(deletingKeyword)}
      />
    </Card>
  );
}
