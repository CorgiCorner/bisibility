"use client";

import { ReplaySurface } from "@/components/analytics/ReplaySurface";
import {
  type KeywordExportTarget,
  keywordExportTarget,
} from "@/components/keywords/export-target-model";
import { useKeywordImport } from "@/components/keywords/import/KeywordImportProvider";
import { useMarketContext } from "@/components/markets/MarketContextProvider";
import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { emptyKeywordFilters, removeFilterChip } from "@/lib/keywords/keyword-filter-model";
import {
  filterFieldsForChip,
  patchRankTrackerFilters,
  RANK_TRACKER_FILTER_FIELDS,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import { marketRunPartition, resolveMarketScope } from "@/lib/markets/market-scope";
import { appPath, marketPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
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
import { keywordNoRowsState } from "./keyword-scope-summary";
import { initialAddKeywordDraft } from "./keywords-grid-initial-state";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { useRankTrackerNavigation } from "./use-flat-rank-tracker-navigation";
import { useKeywordsGridViewState } from "./use-keywords-grid-view-state";

export function KeywordsGrid(props: KeywordsGridProps) {
  const runText = useTranslations("shared.rankPreflight");
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
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
    initialAddOpen = false,
    locations,
    matchedGroupCount,
    matchedTargetCount,
    projectId,
    query,
    rows,
    savedViews = [],
    totalCount,
    updateKeywordAction,
  } = props;
  const { readOnly } = useProjectWriteMode();
  const { openKeywordImport } = useKeywordImport();
  // The URL, never a cookie, decides which market this page stands in; an unnameable market
  // resolves to null so no surface labels a spend with a guess.
  const marketContext = useMarketContext();
  const marketScope = resolveMarketScope(marketContext, props.projectMarkets?.markets);
  const [addDraft, setAddDraft] = useState(() =>
    initialAddKeywordDraft(canCreateKeyword, initialAddOpen),
  );
  const [draftFilters, setDraftFilters] = useState(query.filters);
  const [exportTarget, setExportTarget] = useState<KeywordExportTarget | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(query.search);
  const preflight = useRunPreflight({ projectId, providerId: costContext?.providerId });
  const { capturedFilters, currentViewConfig, filterChips, targetRows } = useKeywordsGridViewState({
    activeLens: query.lens,
    filters: query.filters,
    locations,
    rows,
    searchValue,
    t,
  });
  const keywordsPath = marketContext.market
    ? marketPath(projectId, marketContext.market.ref, "rank-tracker")
    : appPath(projectId, "rank-tracker");
  const { markSearchCommitted, navigateQuery, onSearchChange, onSearchCommit, resetScope } =
    useRankTrackerNavigation({ keywordsPath, query, searchValue, setSearchValue });
  const openAddDrawer = (keyword = "", tab: AddKeywordDraft["tab"] = "manual") =>
    setAddDraft({ keyword, open: true, tab });
  const clearFilters = () =>
    navigateQuery(resetRankTrackerPage({ ...query, filters: emptyKeywordFilters, search: "" }), [
      "search",
      ...RANK_TRACKER_FILTER_FIELDS,
      "page",
    ]);
  const scopeView = KeywordsGridScopeView({
    activeFiltersSummary: capturedFilters,
    activeViewId,
    config: currentViewConfig,
    createSavedViewAction,
    deletableSavedViewIds,
    deleteSavedViewAction,
    keywordsPath,
    lens: query.lens,
    locationOptions: locations,
    projectId,
    onQueryNavigation: markSearchCommitted,
    query: { ...query, search: searchValue },
    savedViews,
  });
  const buildExportTarget = (selectedIds: string[] = []) =>
    keywordExportTarget({
      filterChips,
      filteredRows: targetRows,
      flatServerQuery: query,
      matchedTargetCount,
      rows: targetRows,
      searchValue,
      selectedIds,
    });
  const requestRunChecks = (keywordIds: string[], depth?: SerpDepth) => {
    const selectedRows = targetRows.filter((row) => keywordIds.includes(row.id));
    void preflight.requestRows(selectedRows, depth, costContext?.depth);
  };
  const runMarket = () => {
    if (!readOnly && props.canUpdateKeyword && marketScope && marketScope.status !== "paused") {
      void preflight.requestMarket(marketScope, costContext?.depth);
    }
  };
  const marketKeywordCount = marketScope
    ? locations.find((location) => location.id === marketScope.canonicalKey)?.count
    : undefined;
  const scopedRunIds = marketRunPartition(targetRows, marketScope).inMarketIds;
  const dialogs = (
    <KeywordsGridDialogBundle
      {...props}
      addDraft={addDraft}
      exportTarget={exportTarget}
      marketScope={marketScope}
      onExport={() => setExportTarget(buildExportTarget())}
      onFilter={() => {
        setDraftFilters(query.filters);
        setFiltersOpen(true);
      }}
      onImport={() =>
        openKeywordImport(projectId, {
          markets: props.projectMarkets?.markets ?? [],
          initialMarketKey: marketScope?.canonicalKey,
        })
      }
      onRunChecks={marketScope ? runMarket : () => requestRunChecks(scopedRunIds)}
      openAddDrawer={openAddDrawer}
      pendingRows={targetRows.length}
      preflightDialog={preflight.dialog}
      requestRows={targetRows}
      scopedRows={marketScope ? (marketKeywordCount ?? 0) : scopedRunIds.length}
      setAddDraft={setAddDraft}
      setExportTarget={setExportTarget}
    />
  );
  if ((marketKeywordCount ?? totalCount) === 0) {
    return (
      <KeywordsGridEmpty
        {...props}
        dialogs={dialogs}
        marketScope={marketScope}
        onImportCsv={() =>
          openKeywordImport(projectId, {
            markets: props.projectMarkets?.markets ?? [],
            initialMarketKey: marketScope?.canonicalKey,
          })
        }
        openAddDrawer={openAddDrawer}
      />
    );
  }
  const emptyRankCheckStates = emptyCheckStates(targetRows);
  const noRowsState =
    props.page > 1 && rows.length === 0
      ? {
          description: t("pageUnavailableDescription"),
          title: t("pageUnavailableTitle"),
        }
      : rows.length === 0
        ? keywordNoRowsState({
            filterChips,
            hasNoRankData: emptyRankCheckStates.length > 0,
            hasSearch: Boolean(searchValue.trim()),
            lens: query.lens,
            onResetScope: resetScope,
            options: locations,
            t,
          })
        : undefined;
  return (
    <ReplaySurface kind="rank-tracker" className="grid w-full min-w-0 gap-4">
      {dialogs}
      <KeywordsGridNoticeBlock
        {...props}
        emptyRankCheckStates={emptyRankCheckStates}
        marketScope={marketScope}
        rows={targetRows}
        runCheckNowAction={props.canUpdateKeyword ? props.runCheckNowAction : undefined}
      />
      {marketScope && props.canUpdateKeyword ? (
        <div className="flex justify-end">
          <Button
            disabled={readOnly || preflight.opening || marketScope.status === "paused"}
            onClick={runMarket}
            size="sm"
            variant="secondary"
          >
            {runText("runMarket")}
          </Button>
        </div>
      ) : null}
      <KeywordDataTable
        {...props}
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        checkHealth={checkHealth}
        filterChips={filterChips}
        filterCount={filterChips.length}
        matchedGroupCount={matchedGroupCount}
        noRowsState={noRowsState}
        savedViewControl={scopeView.savedView}
        onAddKeyword={canCreateKeyword ? () => openAddDrawer() : undefined}
        onClearFilters={clearFilters}
        onImportCsv={
          canCreateKeyword
            ? () =>
                openKeywordImport(projectId, {
                  markets: props.projectMarkets?.markets ?? [],
                  initialMarketKey: marketScope?.canonicalKey,
                })
            : undefined
        }
        onOpenExport={(selectedIds) => setExportTarget(buildExportTarget(selectedIds))}
        onOpenFilters={() => {
          setDraftFilters(query.filters);
          setFiltersOpen(true);
        }}
        onQueryNavigation={markSearchCommitted}
        onRemoveFilter={(key) => {
          const filters = removeFilterChip(query.filters, key);
          navigateQuery(patchRankTrackerFilters(query, filters), [
            ...filterFieldsForChip(key),
            "page",
          ]);
        }}
        onRunChecks={requestRunChecks}
        onSearchChange={onSearchChange}
        onSearchCommit={onSearchCommit}
        pendingCheckIds={new Set<string>()}
        marketScope={marketScope}
        rankTrackerPath={keywordsPath}
        rows={rows}
        searchValue={searchValue}
        scopeChip={
          <KeywordsGridScopeChip
            activeViewId={activeViewId}
            keywordsPath={keywordsPath}
            lens={query.lens}
            locationOptions={locations}
            query={query}
          />
        }
        scopeControl={scopeView.control}
        updateKeywordAction={updateKeywordAction}
      />
      <KeywordsGridServerFilters
        activeViewId={activeViewId}
        draftFilters={draftFilters}
        facets={facets}
        keywordsPath={keywordsPath}
        lens={query.lens}
        locationOptions={locations}
        navigateQuery={navigateQuery}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        query={query}
        rows={targetRows}
        setDraftFilters={setDraftFilters}
      />
    </ReplaySurface>
  );
}
