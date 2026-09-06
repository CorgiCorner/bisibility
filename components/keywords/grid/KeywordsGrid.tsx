"use client";
import {
  type KeywordExportTarget,
  keywordExportTarget,
} from "@/components/keywords/export-target-model";
import { useKeywordImport } from "@/components/keywords/import/KeywordImportProvider";
import { useMarketContext } from "@/components/markets/MarketContextProvider";
import { manualPreflightDepth, useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import { emptyKeywordFilters, removeFilterChip } from "@/lib/keywords/keyword-filter-model";
import {
  filterFieldsForChip,
  patchRankTrackerFilters,
  RANK_TRACKER_FILTER_FIELDS,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import { marketRunPartition, resolveMarketScope } from "@/lib/markets/market-scope";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import { appPath, marketPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import { useState } from "react";
import { KeywordDataTable } from "./KeywordDataTable";
import { KeywordsGridDialogBundle } from "./KeywordsGridDialogBundle";
import type { AddKeywordDraft } from "./KeywordsGridDialogs";
import { KeywordsGridEmpty } from "./KeywordsGridEmpty";
import { KeywordsGridScopeChip } from "./KeywordsGridFilterOverlays";
import { KeywordsGridNoticeBlock } from "./KeywordsGridNoticeBlock";
import { KeywordsGridScopeView } from "./KeywordsGridScopeView";
import { KeywordsGridServerFilters } from "./KeywordsGridServerFilters";
import { emptyCheckStates } from "./keyword-empty-check-states";
import { flatKeywordNoRowsState } from "./keyword-scope-summary";
import { initialAddKeywordDraft } from "./keywords-grid-initial-state";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { useFlatRankTrackerNavigation } from "./use-flat-rank-tracker-navigation";
import { useKeywordsGridViewState } from "./use-keywords-grid-view-state";
export function KeywordsGrid(props: KeywordsGridProps) {
  const {
    activeViewId = null,
    bulkClearTargetAction,
    bulkDeleteAction,
    bulkSetTargetAction,
    bulkTagAction,
    canCreateKeyword,
    canDeleteKeyword,
    checkHealth,
    costContext,
    createSavedViewAction,
    deletableSavedViewIds,
    deleteSavedViewAction,
    facets,
    getFirstCheckRunPlanAction,
    initialAddOpen = false,
    initialViewConfig,
    lens,
    listMode = "grouped-client",
    locations,
    matchedTargetCount,
    page,
    pageSize,
    projectId,
    query,
    queueFirstChecksAction,
    runCheckNowAction,
    rows,
    savedViews = [],
    totalCount,
    totalKeywordCount,
    updateKeywordAction,
  } = props;
  const flatServer = listMode === "flat-server" && query !== undefined;
  const { openKeywordImport } = useKeywordImport();
  // The URL, never a cookie, decides which market this page stands in; an unnameable market
  // resolves to null so no surface labels a spend with a guess.
  const marketContext = useMarketContext();
  const marketScope = resolveMarketScope(marketContext, props.projectMarkets?.markets);
  const [addDraft, setAddDraft] = useState(() =>
    initialAddKeywordDraft(canCreateKeyword, initialAddOpen),
  );
  const [exportTarget, setExportTarget] = useState<KeywordExportTarget | null>(null);
  const initialConfig = initialViewConfig ?? emptySavedViewConfig;
  const [filters, setFilters] = useState(flatServer ? query.filters : initialConfig.filters);
  const [draftFilters, setDraftFilters] = useState(
    flatServer ? query.filters : initialConfig.filters,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(flatServer ? query.search : initialConfig.search);
  const preflight = useRunPreflight({ projectId, providerId: costContext?.providerId });
  const {
    activeLens,
    capturedFilters,
    currentViewConfig,
    filterChips,
    filteredRows,
    lensRows,
    locationOptions,
  } = useKeywordsGridViewState({
    activeLens: lens,
    filters,
    flatServer,
    initialViewConfig,
    locations,
    rows,
    searchValue,
  });
  const keywordsPath = marketContext.market
    ? marketPath(projectId, marketContext.market.ref, "rank-tracker")
    : appPath(projectId, "rank-tracker");
  const openAddDrawer = (keyword = "", tab: AddKeywordDraft["tab"] = "manual") =>
    setAddDraft({ keyword, open: true, tab });
  const { markSearchCommitted, navigateQuery, onSearchChange, onSearchCommit, resetScope } =
    useFlatRankTrackerNavigation({
      activeViewId,
      flatServer,
      keywordsPath,
      query,
      searchValue,
      setSearchValue,
    });
  const clearFilters = () => {
    if (flatServer && query)
      return navigateQuery(
        resetRankTrackerPage({ ...query, filters: emptyKeywordFilters, search: "" }),
        ["search", ...RANK_TRACKER_FILTER_FIELDS, "page"],
      );
    setFilters(emptyKeywordFilters);
    setSearchValue("");
  };
  const scopeView = KeywordsGridScopeView({
    activeFiltersSummary: capturedFilters,
    activeViewId,
    config: currentViewConfig,
    createSavedViewAction,
    deletableSavedViewIds,
    deleteSavedViewAction,
    keywordsPath,
    lens: activeLens,
    locationOptions,
    projectId,
    onQueryNavigation: markSearchCommitted,
    query: flatServer && query ? { ...query, search: searchValue } : undefined,
    savedViews,
  });
  const buildExportTarget = (selectedIds: string[] = []) =>
    keywordExportTarget({
      filterChips,
      filteredRows,
      flatServerQuery: flatServer ? query : undefined,
      matchedTargetCount,
      rows,
      searchValue,
      selectedIds,
    });
  const requestRunChecks = (keywordIds: string[], depth?: SerpDepth) => {
    const selectedRows = rows.filter((row) => keywordIds.includes(row.id));
    if (selectedRows.length === 0) return;
    const first = selectedRows[0];
    const resolvedDepth = manualPreflightDepth(selectedRows, depth, costContext?.depth);
    const spec: RunSelectionSpec =
      selectedRows.length === 1 && first
        ? { kind: "single", keywordId: first.id as `kw_${string}`, v: 1 }
        : {
            kind: "selected",
            keywordIds: selectedRows.map((row) => row.id as `kw_${string}`),
            v: 1,
          };
    void preflight.request({ depth: resolvedDepth, rows: selectedRows, spec });
  };
  // The palette command runs the FILTERED page rows; inside a market that means the filtered
  // rows OF THAT MARKET, which is also what its label now claims.
  const filteredRunIds = marketRunPartition(filteredRows, marketScope).inMarketIds;
  const dialogs = (
    <KeywordsGridDialogBundle
      {...props}
      addDraft={addDraft}
      exportTarget={exportTarget}
      marketScope={marketScope}
      onExport={() => setExportTarget(buildExportTarget())}
      onFilter={() => setFiltersOpen(true)}
      onImport={() => openKeywordImport(projectId)}
      onRunChecks={() => requestRunChecks(filteredRunIds)}
      openAddDrawer={openAddDrawer}
      pendingRows={filteredRows.length}
      preflightDialog={preflight.dialog}
      requestRows={rows}
      scopedRows={filteredRunIds.length}
      setAddDraft={setAddDraft}
      setExportTarget={setExportTarget}
    />
  );
  if ((totalCount ?? rows.length) === 0) {
    return (
      <KeywordsGridEmpty
        {...props}
        dialogs={dialogs}
        marketScope={marketScope}
        onImportCsv={() => openKeywordImport(projectId)}
        openAddDrawer={openAddDrawer}
      />
    );
  }
  const emptyRankCheckStates = emptyCheckStates(rows);
  const noRowsState = flatKeywordNoRowsState({
    activeLens,
    filterChips,
    flatServer,
    hasNoRankData: emptyRankCheckStates.length > 0,
    locationOptions,
    onResetScope: resetScope,
    page,
    rowsEmpty: filteredRows.length === 0,
    searchValue,
  });
  return (
    <section className="grid w-full min-w-0 gap-4">
      {dialogs}
      <KeywordsGridNoticeBlock
        {...props}
        checkHealth={checkHealth}
        emptyRankCheckStates={emptyRankCheckStates}
        flatServer={flatServer}
        marketScope={marketScope}
        getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
        projectId={projectId}
        queueFirstChecksAction={queueFirstChecksAction}
        rows={rows}
        runCheckNowAction={runCheckNowAction}
        totalKeywordCount={totalKeywordCount}
      />
      <KeywordDataTable
        {...props}
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        checkFailed={false}
        checkHealth={checkHealth}
        filterChips={filterChips}
        filterCount={filterChips.length}
        noRowsState={noRowsState}
        savedViewControl={scopeView.savedView}
        onAddKeyword={canCreateKeyword ? () => openAddDrawer() : undefined}
        onClearFilters={clearFilters}
        onDismissFailure={() => undefined}
        onImportCsv={canCreateKeyword ? () => openKeywordImport(projectId) : undefined}
        onOpenExport={(selectedIds) => setExportTarget(buildExportTarget(selectedIds))}
        onOpenFilters={() => setFiltersOpen(true)}
        onQueryNavigation={markSearchCommitted}
        onRemoveFilter={(key) => {
          const next = removeFilterChip(filters, key);
          if (flatServer && query)
            navigateQuery(patchRankTrackerFilters(query, next), [
              ...filterFieldsForChip(key),
              "page",
            ]);
          else setFilters(next);
        }}
        onRunChecks={requestRunChecks}
        onSearchChange={onSearchChange}
        onSearchCommit={onSearchCommit}
        pendingCheckIds={new Set<string>()}
        projectId={projectId}
        listMode={listMode}
        marketScope={marketScope}
        matchedTargetCount={matchedTargetCount}
        page={page}
        pageSize={pageSize}
        query={query}
        rows={filteredRows}
        searchValue={searchValue}
        scopeChip={
          <KeywordsGridScopeChip
            activeViewId={activeViewId}
            keywordsPath={keywordsPath}
            lens={activeLens}
            locationOptions={locationOptions}
            query={flatServer ? query : undefined}
          />
        }
        scopeControl={scopeView.control}
        updateKeywordAction={updateKeywordAction}
      />
      <KeywordsGridServerFilters
        activeViewId={activeViewId}
        draftFilters={draftFilters}
        facets={facets}
        filters={filters}
        flatServer={flatServer}
        keywordsPath={keywordsPath}
        lens={activeLens}
        locationOptions={locationOptions}
        navigateQuery={navigateQuery}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        query={query}
        rows={lensRows}
        setDraftFilters={setDraftFilters}
        setFilters={setFilters}
      />
    </section>
  );
}
