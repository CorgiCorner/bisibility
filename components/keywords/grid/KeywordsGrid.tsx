"use client";
import {
  type KeywordExportTarget,
  keywordExportTarget,
} from "@/components/keywords/export-target-model";
import { useKeywordImport } from "@/components/keywords/import/KeywordImportProvider";
import { emptyKeywordFilters, removeFilterChip } from "@/lib/keywords/keyword-filter-model";
import {
  filterFieldsForChip,
  patchRankTrackerFilters,
  RANK_TRACKER_FILTER_FIELDS,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeywordDataTable } from "./KeywordDataTable";
import { KeywordsGridDialogBundle } from "./KeywordsGridDialogBundle";
import type { AddKeywordDraft } from "./KeywordsGridDialogs";
import { KeywordsGridScopeChip } from "./KeywordsGridFilterOverlays";
import { KeywordsGridNoticeBlock } from "./KeywordsGridNoticeBlock";
import { KeywordsGridProjectEmpty } from "./KeywordsGridProjectEmpty";
import { KeywordsGridScopeView } from "./KeywordsGridScopeView";
import { KeywordsGridServerFilters } from "./KeywordsGridServerFilters";
import { emptyCheckStates } from "./keyword-empty-check-states";
import { flatKeywordNoRowsState } from "./keyword-scope-summary";
import { initialAddKeywordDraft } from "./keywords-grid-initial-state";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { useFlatRankTrackerNavigation } from "./use-flat-rank-tracker-navigation";
import { useKeywordsGridViewState } from "./use-keywords-grid-view-state";
import { useRunChecksModal } from "./useRunChecksModal";
export function KeywordsGrid(props: KeywordsGridProps) {
  const {
    activeViewId = null,
    bulkClearTargetAction,
    bulkDeleteAction,
    bulkSetFrequencyAction,
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
    importTopQueriesAction,
    lens,
    listMode = "grouped-client",
    locations,
    matchedTargetCount,
    page,
    pageSize,
    projectId,
    searchConsoleConnected,
    query,
    queueFirstChecksAction,
    runCheckNowAction,
    rows,
    savedViews = [],
    totalCount,
    totalKeywordCount,
    updateKeywordAction,
    updateKeywordScheduleAction,
  } = props;
  const router = useRouter();
  const flatServer = listMode === "flat-server" && query !== undefined;
  const { openKeywordImport } = useKeywordImport();
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
  const {
    close: closeRunChecks,
    confirm: confirmRunChecks,
    flow: runChecksFlow,
    pendingIds,
    request: requestRunChecks,
    retry: retryRunChecks,
  } = useRunChecksModal({
    onSettled: () => router.refresh(),
    projectId,
    providerRate: checkHealth?.providerRate,
    rows,
    runCheckNowAction,
  });
  const checkFailed = runChecksFlow?.step === "failed";
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
  const keywordsPath = appPath(projectId, "rank-tracker");
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
  const dialogs = (
    <KeywordsGridDialogBundle
      {...props}
      addDraft={addDraft}
      closeRunChecks={closeRunChecks}
      confirmRunChecks={confirmRunChecks}
      exportTarget={exportTarget}
      onExport={() => setExportTarget(buildExportTarget())}
      onFilter={() => setFiltersOpen(true)}
      onImport={() => openKeywordImport(projectId)}
      onRunChecks={() => requestRunChecks(filteredRows.map((row) => row.id))}
      openAddDrawer={openAddDrawer}
      pendingRows={filteredRows.length}
      requestRows={rows}
      retryRunChecks={retryRunChecks}
      runChecksFlow={runChecksFlow}
      setAddDraft={setAddDraft}
      setExportTarget={setExportTarget}
    />
  );
  if ((totalCount ?? rows.length) === 0) {
    return (
      <KeywordsGridProjectEmpty
        canCreateKeyword={canCreateKeyword}
        canManageProviders={props.canManageProviders}
        costContext={costContext}
        dialogs={dialogs}
        importTopQueriesAction={importTopQueriesAction}
        onAddKeyword={() => openAddDrawer()}
        onImportCsv={() => openKeywordImport(projectId)}
        openAddDrawer={openAddDrawer}
        projectId={projectId}
        searchConsoleConnected={searchConsoleConnected}
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
        bulkSetFrequencyAction={bulkSetFrequencyAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        checkFailed={checkFailed}
        checkHealth={checkHealth}
        filterChips={filterChips}
        filterCount={filterChips.length}
        noRowsState={noRowsState}
        savedViewControl={scopeView.savedView}
        onAddKeyword={canCreateKeyword ? () => openAddDrawer() : undefined}
        onClearFilters={clearFilters}
        onDismissFailure={closeRunChecks}
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
        pendingCheckIds={pendingIds}
        projectId={projectId}
        listMode={listMode}
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
        updateKeywordScheduleAction={updateKeywordScheduleAction}
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
