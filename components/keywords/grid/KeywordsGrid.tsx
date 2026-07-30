"use client";

import {
  type KeywordExportTarget,
  keywordExportTarget,
} from "@/components/keywords/export-target-model";
import { useKeywordImport } from "@/components/keywords/import/KeywordImportProvider";
import {
  KeywordsScopeControls,
  KeywordsScopeLocationChip,
} from "@/components/keywords/KeywordsScopeControls";
import {
  applyKeywordFilters,
  emptyKeywordFilters,
  getFilterChips,
  matchesKeywordSearch,
  removeFilterChip,
} from "@/lib/keywords/keyword-filter-model";
import {
  type ActiveLens,
  applyLens,
  DEFAULT_LENS_DEVICE,
  lensHref,
  lensLocationOptions,
} from "@/lib/keywords/lens-model";
import {
  cloneSavedViewConfig,
  emptySavedViewConfig,
  keywordSavedViewConfig,
} from "@/lib/keywords/saved-view-model";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { KeywordDataTable } from "./KeywordDataTable";
import { KeywordsEmptyState } from "./KeywordsEmptyState";
import type { AddKeywordDraft } from "./KeywordsGridDialogs";
import { KeywordsGridNotices } from "./KeywordsGridNotices";
import { FiltersDrawer, KeywordsGridDialogs } from "./KeywordsGridOverlays";
import {
  BASE_KEYWORD_LENS,
  keywordNoRowsState,
  keywordScopeSummary,
} from "./keyword-scope-summary";
import type { KeywordsGridProps } from "./keywords-grid-types";
import { SavedViewsControl } from "./SavedViewsControl";
import { useKeywordRunChecks } from "./useKeywordRunChecks";

export function KeywordsGrid({
  activeViewId = null,
  addKeywordsAction,
  bulkClearTargetAction,
  bulkDeleteAction,
  bulkSetFrequencyAction,
  bulkSetTargetAction,
  bulkTagAction,
  canCreateKeyword,
  canDeleteKeyword,
  canManageProviders,
  canUpdateKeyword,
  checkHealth,
  costContext,
  createSavedViewAction,
  deletableSavedViewIds,
  deleteSavedViewAction,
  getFirstCheckRunPlanAction,
  initialAddOpen = false,
  initialViewConfig,
  importTopQueriesAction,
  keywordDefaults,
  lens,
  providerConnected,
  projectId,
  queueFirstChecksAction,
  runCheckNowAction,
  rows,
  savedViews = [],
  tagSuggestions = [],
  totalKeywordCount,
  updateKeywordAction,
  updateKeywordScheduleAction,
}: KeywordsGridProps) {
  const router = useRouter();
  const { openKeywordImport } = useKeywordImport();
  const activeLens: ActiveLens = lens ?? { device: DEFAULT_LENS_DEVICE, locationId: null };
  const viewConfig = cloneSavedViewConfig(initialViewConfig ?? emptySavedViewConfig);
  // Initialize from ?add=1 once so closing ignores the stale query param without an effect.
  const [addDraft, setAddDraft] = useState<AddKeywordDraft>({
    keyword: "",
    open: canCreateKeyword && initialAddOpen,
    tab: "manual",
  });
  const [exportTarget, setExportTarget] = useState<KeywordExportTarget | null>(null);
  const [filters, setFilters] = useState(viewConfig.filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(viewConfig.search);
  const { checkFailed, dismissFailure, pendingIds, runChecks, statusLabel } = useKeywordRunChecks(
    runCheckNowAction,
    () => router.refresh(),
    { providerRate: checkHealth?.providerRate, rows },
  );
  const locationOptions = useMemo(() => lensLocationOptions(rows), [rows]);
  const lensRows = useMemo(() => applyLens(rows, activeLens), [rows, activeLens]);
  const filterChips = useMemo(() => getFilterChips(filters), [filters]);
  const filteredRows = useMemo(() => {
    return applyKeywordFilters(lensRows, filters).filter((row) =>
      matchesKeywordSearch(row, searchValue),
    );
  }, [filters, lensRows, searchValue]);
  const capturedFilters = [
    keywordScopeSummary(activeLens, locationOptions),
    searchValue.trim() ? `Search: "${searchValue.trim()}"` : null,
    ...filterChips.map((chip) => chip.label),
  ]
    .filter(Boolean)
    .join(" / ");
  const currentViewConfig = useMemo(
    () => keywordSavedViewConfig({ filters, lens: activeLens, search: searchValue.trim() }),
    [activeLens, filters, searchValue],
  );
  const keywordsPath = appPath(projectId, "keywords");

  function openAddDrawer(keyword = "", tab: AddKeywordDraft["tab"] = "manual") {
    setAddDraft({ keyword, open: true, tab });
  }
  const closeAddDrawer = () => setAddDraft({ keyword: "", open: false, tab: "manual" });
  function openExport(selectedIds: string[]) {
    setExportTarget(
      keywordExportTarget({ filterChips, filteredRows, rows, searchValue, selectedIds }),
    );
  }
  function clearFilters() {
    setFilters(emptyKeywordFilters);
    setSearchValue("");
  }
  const resetScope = () => router.push(lensHref(keywordsPath, BASE_KEYWORD_LENS, activeViewId));

  const dialogs =
    (canCreateKeyword && addDraft.open) || exportTarget ? (
      <KeywordsGridDialogs
        addDraft={addDraft}
        addKeywordsAction={addKeywordsAction}
        exportTarget={exportTarget}
        costContext={costContext}
        keywordDefaults={keywordDefaults}
        onCloseAdd={closeAddDrawer}
        onCloseExport={() => setExportTarget(null)}
        projectId={projectId}
        rows={rows}
        tagSuggestions={tagSuggestions}
      />
    ) : null;

  if (rows.length === 0) {
    return (
      <section className="grid w-full min-w-0 gap-4">
        <KeywordsEmptyState
          canCreateKeyword={canCreateKeyword}
          canManageProviders={canManageProviders}
          costContext={costContext}
          importTopQueriesAction={importTopQueriesAction}
          onAddKeyword={(keyword) => openAddDrawer(keyword)}
          onImportCsv={() => openKeywordImport(projectId)}
          onImportQueries={(queries) => openAddDrawer(queries.join("\n"))}
          providerConnected={providerConnected}
          projectId={projectId}
        />
        {dialogs}
      </section>
    );
  }

  const emptyRankCheckStates = rows.every((row) => !row.hasRankData)
    ? rows.map(
        (row) =>
          row.checkState ??
          (row.lastCheckStatus === "failed" || row.lastCheckStatus === "running"
            ? row.lastCheckStatus
            : row.lastCheckStatus === "completed"
              ? "not_ranked"
              : "never_checked"),
      )
    : [];
  const hasSearch = Boolean(searchValue.trim());
  const noRowsState =
    filteredRows.length === 0
      ? keywordNoRowsState({
          filterChips,
          hasNoRankData: emptyRankCheckStates.length > 0,
          hasSearch,
          lens: activeLens,
          onResetScope: resetScope,
          options: locationOptions,
        })
      : undefined;

  return (
    <section className="grid w-full min-w-0 gap-4">
      {dialogs}
      <KeywordsGridNotices
        canManageProviders={canManageProviders}
        checkHealth={checkHealth}
        checkStates={emptyRankCheckStates}
        firstPendingKeywordId={rows.find((row) => row.checkState === "never_checked")?.id ?? null}
        getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
        providerConnected={providerConnected}
        projectId={projectId}
        queueFirstChecksAction={queueFirstChecksAction}
        runCheckNowAction={canUpdateKeyword ? runCheckNowAction : undefined}
        rowCount={rows.length}
        totalKeywordCount={totalKeywordCount}
      />
      <KeywordDataTable
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetFrequencyAction={bulkSetFrequencyAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        canUpdateKeyword={canUpdateKeyword}
        checkFailed={checkFailed}
        checkHealth={checkHealth}
        filterChips={filterChips}
        filterCount={filterChips.length}
        noRowsState={noRowsState}
        savedViewControl={
          <SavedViewsControl
            activeFiltersSummary={capturedFilters}
            activeViewId={activeViewId}
            config={currentViewConfig}
            createSavedViewAction={createSavedViewAction}
            deletableSavedViewIds={deletableSavedViewIds}
            deleteSavedViewAction={deleteSavedViewAction}
            projectId={projectId}
            savedViews={savedViews}
          />
        }
        onAddKeyword={canCreateKeyword ? () => openAddDrawer() : undefined}
        onClearFilters={clearFilters}
        onDismissFailure={dismissFailure}
        onImportCsv={canCreateKeyword ? () => openKeywordImport(projectId) : undefined}
        onOpenExport={openExport}
        onOpenFilters={() => setFiltersOpen(true)}
        onRemoveFilter={(key) => setFilters((value) => removeFilterChip(value, key))}
        onRunChecks={runChecks}
        onSearchChange={setSearchValue}
        pendingCheckIds={pendingIds}
        projectId={projectId}
        rows={filteredRows}
        searchValue={searchValue}
        scopeChip={
          activeLens.locationId ? (
            <KeywordsScopeLocationChip
              basePath={keywordsPath}
              lens={activeLens}
              locationOptions={locationOptions}
              viewId={activeViewId}
            />
          ) : null
        }
        scopeControl={
          <KeywordsScopeControls
            basePath={keywordsPath}
            lens={activeLens}
            locationOptions={locationOptions}
            viewId={activeViewId}
          />
        }
        updateKeywordAction={updateKeywordAction}
        updateKeywordScheduleAction={updateKeywordScheduleAction}
      />
      {statusLabel ? (
        <p className="m-0 font-mono text-[11.5px] text-fg-muted">{statusLabel}</p>
      ) : null}
      {filtersOpen ? (
        <FiltersDrawer
          basePath={keywordsPath}
          filters={filters}
          lens={activeLens}
          locationOptions={locationOptions}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
          open
          rows={lensRows}
          viewId={activeViewId}
        />
      ) : null}
    </section>
  );
}
