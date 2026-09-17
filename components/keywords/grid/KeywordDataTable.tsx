"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useDataTableLayout } from "@/components/ui/data-table/data-table-layout-store";
import type { DataTableDensity, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
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
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { BulkActionBar } from "./BulkActionBar";
import { presentBulkActionError } from "./bulk-action-error";
import { type KeywordColumnLabels, keywordColumns } from "./grid-columns";
import { persistKeywordGridDensity } from "./grid-density";
import { KeywordGridViewport } from "./KeywordGridViewport";
import { KeywordsFilterBar } from "./KeywordsFilterBar";
import { defaultKeywordColumnVisibility, KEYWORD_DATA_TABLE_ID } from "./keyword-data-table-config";
import type { KeywordDataTableProps } from "./keyword-data-table-types";
import { buildKeywordWeeklySummary } from "./keyword-weekly-summary";
import { weeklySummarySentence } from "./keyword-weekly-summary-copy";
import { noRankLabel } from "./market-grid-cells";

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
export function KeywordDataTable({ bulkClearTargetAction, bulkDeleteAction, bulkSetTargetAction, bulkTagAction, canDeleteKeyword, canUpdateKeyword, checkHealth, filterChips, filterCount, initialDensity, marketScope = null, matchedGroupCount, matchedTargetCount, page, pageSize, query, onAddKeyword, onClearFilters, onImportCsv, onOpenExport, onOpenFilters, onQueryNavigation, onRemoveFilter, onRunChecks, onSearchChange, onSearchCommit, pendingCheckIds, providerConnected, projectId, projectMarkets, rankTrackerPath, rows, noRowsState, savedViewControl, searchValue, scopeChip, scopeControl, updateKeywordAction }: KeywordDataTableProps) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const columnT = useTranslations("projectRankTracker.keywordImport.management.columns");
  const marketCellsT = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const format = useFormatter();
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const searchParams = useSearchParams();
  const layout = useDataTableLayout(KEYWORD_DATA_TABLE_ID);
  const columnVisibility =
    Object.keys(layout.columnVisibility).length > 0
      ? layout.columnVisibility
      : defaultKeywordColumnVisibility;
  const [density, setDensity] = useState<DataTableDensity>(initialDensity ?? "standard");
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [navigationSequence, setNavigationSequence] = useState(0);
  const [deletingKeyword, setDeletingKeyword] = useState<KeywordRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<{ focusTargetUrl: boolean; row: KeywordRow } | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [navigationPending, startNavigation] = useTransition();
  const targetRows = useMemo(() => leafRows(rows), [rows]);
  const weeklySummary = useMemo(() => buildKeywordWeeklySummary(targetRows), [targetRows]);
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
        columnLabels,
      ),
    [canDeleteKeyword, canUpdateKeyword, columnLabels, onRunChecks, pendingCheckIds, projectId],
  );
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

  async function handleDeleteKeyword() {
    if (!deletingKeyword) return;
    setDeleting(true);
    setRowActionError(null);
    try {
      await bulkDeleteAction({ keywordIds: [deletingKeyword.id], projectId });
      setDeletingKeyword(null);
      router.refresh();
    } catch (error) {
      setRowActionError(presentBulkActionError(error, sharedErrors, t("deleteFailed")));
      throw error;
    } finally {
      setDeleting(false);
    }
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
    <Card className="min-w-0 overflow-hidden p-0" size="md" style={keywordTableCardStyle}>
      <KeywordsFilterBar
        columnSizing={layout.columnSizing}
        columns={columns}
        columnVisibility={columnVisibility}
        density={density}
        filterChips={filterChips}
        filterCount={filterCount}
        groupingControl={
          <SegmentedControl
            activeVariant="neutral"
            ariaLabel={t("grouping")}
            fitContent
            onChange={(value) => {
              const grouped = value === "grouped";
              if (grouped !== query.grouped)
                navigate(resetRankTrackerPage({ ...query, grouped }), ["grouped", "page"]);
            }}
            options={[
              { label: t("grouped"), value: "grouped" },
              { label: t("flat"), value: "flat" },
            ]}
            size="toolbar"
            value={query.grouped ? "grouped" : "flat"}
          />
        }
        id={KEYWORD_DATA_TABLE_ID}
        onAddKeyword={onAddKeyword}
        onClearFilters={onClearFilters}
        onColumnSizingChange={layout.setColumnSizing}
        onColumnVisibilityChange={layout.setColumnVisibility}
        onDensityChange={handleDensityChange}
        onImportCsv={onImportCsv}
        onOpenExport={() => onOpenExport(selectedIds)}
        onOpenFilters={onOpenFilters}
        onRefresh={() => router.refresh()}
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
        onClear={() => setSelection(new Set())}
        onRunChecks={onRunChecks}
        projectId={projectId}
        providerConnected={providerConnected}
        providerRate={checkHealth?.providerRate}
        selectedRows={selectedRows}
      />
      {rowActionError ? (
        <p className="m-0 border-b border-border px-4 py-2 font-sans tabular-nums text-[11.5px] text-red-text">
          {rowActionError}
        </p>
      ) : null}
      {weeklySummary ? (
        <SummaryStrip
          className="rounded-none border-b border-border px-4"
          sentence={t("currentPage", { summary: weeklySummarySentence(weeklySummary, t) })}
          tone={weeklySummary.tone}
        />
      ) : null}
      <KeywordGridViewport
        key={`${query.grouped ? "grouped" : "flat"}:${searchParams.toString()}:${navigationSequence}`}
        columnSizing={layout.columnSizing}
        columns={columns}
        columnVisibility={columnVisibility}
        density={density}
        footerStart={
          query.grouped ? <span>{t("matchingTargets", { count: matchedTargetCount })}</span> : undefined
        }
        id={KEYWORD_DATA_TABLE_ID}
        noRowsState={noRowsState}
        onColumnSizingChange={layout.setColumnSizing}
        onColumnVisibilityChange={layout.setColumnVisibility}
        onNavigate={(keywordId) => router.push(appPath(projectId, "rank-tracker", keywordId))}
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
