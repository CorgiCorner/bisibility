"use client";

import { useKeywordDeletion } from "@/components/keywords/use-keyword-deletion";
import { Card } from "@/components/ui/Card";
import { useDataTableLayout } from "@/components/ui/data-table/data-table-layout-store";
import { dataTableColumnId } from "@/components/ui/data-table/data-table-model";
import type { DataTableDensity, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { FloatingSelectionBarSpacer } from "@/components/ui/FloatingSelectionBar";
import { rankTrackerDetailHref } from "@/lib/keywords/rank-tracker-detail-navigation";
import {
  rankTrackerMutationPresence,
  rankTrackerNavigationHref,
  rankTrackerSortFromGrid,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import {
  RANK_TRACKER_PAGE_SIZES,
  type RankTrackerQueryField,
  type RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { keywordViewScopeLabels } from "@/lib/keywords/view-scope-description";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { BulkActionBar } from "./BulkActionBar";
import { type KeywordColumnLabels, keywordColumns } from "./grid-columns";
import { persistKeywordGridDensity } from "./grid-density";
import { KeywordColumnOrderControl } from "./KeywordColumnOrderControl";
import { keywordViewHasMultipleDevices } from "./KeywordDeviceCell";
import { KeywordGridViewport } from "./KeywordGridViewport";
import { useKeywordLocalColumns } from "./KeywordLocalColumns";
import { KeywordPersonalViewControl } from "./KeywordPersonalViewControl";
import { KeywordReportSummary } from "./KeywordReportSummary";
import { KeywordsFilterBar } from "./KeywordsFilterBar";
import { defaultKeywordColumnVisibility, KEYWORD_DATA_TABLE_ID } from "./keyword-data-table-config";
import type { KeywordDataTableProps } from "./keyword-data-table-types";
import { noRankLabel } from "./market-grid-cells";
import { usePersonalKeywordLayout } from "./use-personal-keyword-layout";

const keywordTableCardStyle = {
  borderRadius: UI_RADIUS_ROLES.card,
  overflow: "hidden",
} as const;
const KeywordEditDrawer = dynamic(
  () => import("@/components/keywords/KeywordEditDrawer").then((mod) => mod.KeywordEditDrawer),
  { ssr: false },
);

function leafRows(rows: KeywordDataTableProps["rows"]): KeywordRow[] {
  return rows.flatMap((row) => (row.kind === "group" ? (row.subRows ?? []) : [row]));
}

// biome-ignore format: Compact parameter destructuring keeps this production module within 300 lines.
export function KeywordDataTable({ bulkClearTargetAction, bulkDeleteAction, bulkSetTargetAction, bulkTagAction, canDeleteKeyword, canUpdateKeyword, checkHealth, filterChips, filterCount, initialDensity, local, marketScope = null, matchedGroupCount, matchedTargetCount, page, pageSize, query, onAddKeyword, onClearFilters, onImportCsv, onOpenExport, onOpenFilters, onQueryNavigation, onRemoveFilter, onRunChecks, onSearchChange, onSearchCommit, pendingCheckIds, personalPreferences, providerConnected, projectId, projectMarkets, rankTrackerPath, report, rows, viewDevices, noRowsState, savedViewControl, searchValue, scopeChip, scopeControl, updateKeywordAction }: KeywordDataTableProps) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const columnT = useTranslations("projectRankTracker.keywordImport.management.columns");
  const marketCellsT = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const format = useFormatter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const layout = useDataTableLayout(KEYWORD_DATA_TABLE_ID);
  const [density, setDensity] = useState<DataTableDensity>(initialDensity ?? "standard");
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [navigationSequence, setNavigationSequence] = useState(0);
  const [editing, setEditing] = useState<{ focusTargetUrl: boolean; row: KeywordRow } | null>(null);
  const [navigationPending, startNavigation] = useTransition();
  const targetRows = useMemo(() => leafRows(rows), [rows]);
  const showDevices = useMemo(() => viewDevices ? new Set(viewDevices).size > 1 : keywordViewHasMultipleDevices(rows), [rows, viewDevices]);
  const selectedIds = [...selection];
  const selectedRows = targetRows.filter((row) => selection.has(row.id));
  const columnLabels = useMemo<KeywordColumnLabels>(
    () => ({
      change: columnT("change"),
      clickThroughRate: columnT("clickThroughRate"),
      clicks: columnT("clicks"),
      ctr: columnT("ctr"),
      device: columnT("device"),
      difficulty: columnT("difficulty"),
      formatNumber: (value) =>
        format.number(value, { maximumFractionDigits: 1, notation: "compact" }),
      formatPercent: (value) => format.number(value, { maximumFractionDigits: 1, style: "percent" }),
      formatPosition: (value) => columnT("positionValue", { position: value }),
      impressions: columnT("impressions"),
      intent: columnT("intent"),
      keyword: columnT("keyword"),
      lastChecked: columnT("lastChecked"),
      location: columnT("location"),
      noRankLabel: (row) => noRankLabel(row, marketCellsT),
      noTrafficDataLabel: columnT("trafficUnavailable"),
      position: columnT("position"),
      positionShort: columnT("positionShort"),
      positionTrend: ({ keyword }) => columnT("positionTrend", { keyword }),
      schedule: columnT("schedule"),
      tags: columnT("tags"),
      targetAndRanking: columnT("targetAndRanking"),
      topic: columnT("topic"),
      trend: columnT("trend"),
      trendTitle: columnT("trendTitle"),
      volume: columnT("volume"),
    }),
    [columnT, format, marketCellsT],
  );
  const deletion = useKeywordDeletion({ action: bulkDeleteAction, onDeleted: () => router.refresh(), projectId });
  const columns = useMemo(
    () =>
      keywordColumns(
        {
          onDelete: (row) => void deletion.open([row.id]),
          onEdit: (row) => setEditing({ focusTargetUrl: false, row }),
          onRunCheck: (row) => onRunChecks([row.id]),
          canDeleteKeyword,
          canUpdateKeyword,
        },
        projectId,
        pendingCheckIds,
        columnLabels,
        (row) => rankTrackerDetailHref(projectId, row.id, query),
        showDevices,
      ),
    [canDeleteKeyword, canUpdateKeyword, columnLabels, deletion.open, onRunChecks, pendingCheckIds, projectId, query, showDevices],
  );
  const localColumns = useKeywordLocalColumns(columns, local?.facts ?? []);
  const viewColumns = local ? localColumns : columns;
  const personalLayout = usePersonalKeywordLayout(personalPreferences, viewColumns);
  const presentationScope = keywordViewScopeLabels(query.lens, marketScope, projectMarkets?.markets, {
    allLocations: t("allLocations"), selectedLocation: t("selectedLocation"), allDevices: t("allDevices"),
    desktop: t("deviceDesktop"), mobile: t("deviceMobile"),
  });
  const scopeT = useTranslations("projectRankTracker.reportScope");
  const reportScope = rankTrackerScope(query);
  const presentationScopeSummary = [scopeT(reportScope.view), scopeT("days", { days: format.number(reportScope.comparisonDays) }),
    reportScope.asOf ? scopeT("snapshot", { date: format.dateTime(new Date(reportScope.asOf), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) }) : scopeT("latest"),
    ...(local?.summary ? [local.summary.subject.name] : []), t("scopeSummary", presentationScope),
    ...(query.search ? [t("searchSummary", { search: query.search })] : []),
    ...filterChips.map((chip) => chip.label)].join(", ");
  const columnVisibility = personalPreferences ? personalLayout.visibility : Object.keys(layout.columnVisibility).length ? layout.columnVisibility : defaultKeywordColumnVisibility;
  const sizing = personalPreferences ? personalLayout.sizing : layout.columnSizing;
  const setSizing = personalPreferences ? personalLayout.setSizing : layout.setColumnSizing;
  const setVisibility = personalPreferences ? personalLayout.setVisibility : layout.setColumnVisibility;
  const pagination = {
    page,
    pageSize,
    pageSizeOptions: RANK_TRACKER_PAGE_SIZES,
    rowCount: query.grouped ? (matchedGroupCount ?? rows.length) : matchedTargetCount,
  };

  function handleDensityChange(next: DataTableDensity) {
    setDensity(next);
    persistKeywordGridDensity(next);
  }

  function navigate(next: RankTrackerQueryState, present: RankTrackerQueryField[]) {
    onQueryNavigation?.();
    setNavigationSequence((current) => current + 1);
    const rebased = searchValue !== query.search ? { ...next, search: searchValue } : next;
    const href = rankTrackerNavigationHref({
      basePath: rankTrackerPath ?? appPath(projectId, "rank-tracker"),
      current: searchParams,
      present: rankTrackerMutationPresence(query, rebased, present),
      query: rebased,
    });
    startNavigation(() => router.push(href));
  }



  function handlePagination(next: { page: number; pageSize: number }) {
    if (next.page === pagination.page && next.pageSize === pagination.pageSize) return;
    navigate(
      { ...query, page: next.page, pageSize: next.pageSize as RankTrackerQueryState["pageSize"] },
      ["page", "pageSize"],
    );
  }

  function handleSorting(next: DataTableSort | null) {
    const sort = rankTrackerSortFromGrid(next ? { field: next.field, sort: next.direction } : undefined);
    if (sort.field === query.sort.field && sort.direction === query.sort.direction) return;
    navigate(resetRankTrackerPage({ ...query, sort }), ["sort", "direction", "page"]);
  }

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-0" size="md" style={keywordTableCardStyle}>
        <KeywordsFilterBar
          columnOrderControl={personalPreferences ? <KeywordColumnOrderControl columns={viewColumns.flatMap((column) => {
          const id = dataTableColumnId(column); return id && column.meta?.title ? [{ id, label: column.meta.title }] : [];
        })} order={personalLayout.order} onChange={personalLayout.setOrder} /> : null}
          columnSizing={sizing}
          columns={viewColumns}
          columnVisibility={columnVisibility}
          density={density}
          filterChips={filterChips}
          filterCount={filterCount}
          id={KEYWORD_DATA_TABLE_ID}
          onAddKeyword={onAddKeyword}
          onClearFilters={onClearFilters}
          onColumnSizingChange={setSizing}
          onColumnVisibilityChange={setVisibility}
          onDensityChange={handleDensityChange}
          onImportCsv={onImportCsv}
          exportDisabled={Boolean(local)}
          onOpenExport={() => { if (!local) onOpenExport(selectedIds); }}
          onOpenFilters={onOpenFilters}
          onRefresh={() => router.refresh()}
          onRemoveFilter={onRemoveFilter}
          onSearchChange={onSearchChange}
          onSearchCommit={onSearchCommit}
          savedViewControl={personalPreferences ? <KeywordPersonalViewControl context={personalPreferences}
            presentation={personalLayout.presentation} query={query} projectId={projectId}
            layoutModified={personalLayout.modified}
            canCreateShared={canUpdateKeyword} scopeSummary={presentationScopeSummary}
            onDiscardLayout={personalLayout.discard} /> : savedViewControl}
          searchValue={searchValue}
          scopeChip={scopeChip}
          scopeControl={scopeControl}
        />



        {!local ? <KeywordReportSummary report={report} expected={matchedTargetCount} pending={navigationPending} /> : null}
        <KeywordGridViewport
          key={`${query.grouped ? "grouped" : "flat"}:${searchParams.toString()}:${navigationSequence}`}
          columnOrder={personalPreferences ? personalLayout.order : undefined}
          columnSizing={sizing}
          columns={viewColumns}
          columnVisibility={columnVisibility}
          density={density}
          footerStart={
            query.grouped ? <span>{t("matchingTargets", { count: matchedTargetCount })}</span> : undefined
          }
          id={KEYWORD_DATA_TABLE_ID}
          noRowsState={noRowsState}
          onColumnSizingChange={setSizing}
          onColumnVisibilityChange={setVisibility}
          onNavigate={(keywordId) => router.push(rankTrackerDetailHref(projectId, keywordId, query))}
          onPaginationChange={handlePagination}
          onSelectionChange={setSelection}
          onSortingChange={handleSorting}
          pagination={pagination}
          pending={navigationPending}
          rows={rows}
          selection={selection}
          sorting={query.sort}
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
        {canDeleteKeyword ? deletion.modal : null}
      </Card>
      <BulkActionBar
        bulkClearTargetAction={bulkClearTargetAction}
        bulkDeleteAction={bulkDeleteAction}
        bulkSetTargetAction={bulkSetTargetAction}
        bulkTagAction={bulkTagAction}
        canDeleteKeyword={canDeleteKeyword}
        canUpdateKeyword={canUpdateKeyword}
        checksRunning={selectedIds.some((id) => pendingCheckIds.has(id))}
        marketScope={marketScope}
        onClear={() => setSelection(new Set())}
        onRunChecks={onRunChecks}
        projectId={projectId}
        providerConnected={providerConnected}
        providerRate={checkHealth?.providerRate}
        selectedRows={selectedRows}
      />
      {selectedRows.length > 0 ? <FloatingSelectionBarSpacer /> : null}
    </>
  );
}
