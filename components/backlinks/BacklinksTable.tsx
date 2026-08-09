"use client";

import type { BacklinksOutcome, BacklinksRow } from "@/lib/backlinks/types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { CheckIcon as Check } from "@phosphor-icons/react";
import { useState } from "react";
import { BacklinksAggregateTable } from "./BacklinksAggregateTable";
import { BacklinksExportMenu } from "./BacklinksExportMenu";
import { BacklinksFiltersDrawer } from "./BacklinksFiltersDrawer";
import { BacklinksColumnHeaders, BacklinksRows } from "./BacklinksTableRows";
import { BacklinksTableToolbar } from "./BacklinksTableToolbar";
import {
  activeBacklinksFilterCount,
  type BacklinksFilters,
  backlinkLinkTypeCounts,
  emptyBacklinksFilters,
  filterBacklinksDomainGroups,
} from "./backlinks-filters-model";
import {
  aggregateBacklinksView,
  type BacklinksFilter,
  type BacklinksSlice,
  type BacklinksView,
  domainFilterCounts,
  groupBacklinksByDomain,
} from "./backlinks-table-model";

export type BacklinksTableProps = {
  fetchedRowCount: number;
  initialAdvancedFilters?: BacklinksFilters;
  initialDrawerOpen?: boolean;
  initialFilter?: BacklinksFilter;
  initialExpandedDomains?: string[];
  initialSlice?: BacklinksSlice;
  initialView?: BacklinksView;
  loadMoreEstimateCents?: number;
  now?: Date;
  onLoadMore?: () => Promise<BacklinksOutcome>;
  rows: BacklinksRow[];
  target: string;
  totalDomains: number;
  totalRowsAvailable: number;
};

function BrokenEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-green/10 text-green-text">
        <Check aria-hidden size={20} weight="bold" />
      </span>
      <strong className="text-[14.5px]">No broken backlinks</strong>
      <p className="m-0 max-w-[360px] text-[12.5px] leading-5 text-fg-muted">
        Every URL that other sites link to currently returns a 200. Checked with the snapshot, at no
        extra cost.
      </p>
    </div>
  );
}

export function BacklinksTable({
  fetchedRowCount,
  initialAdvancedFilters = emptyBacklinksFilters,
  initialDrawerOpen = false,
  initialFilter = "all",
  initialExpandedDomains = [],
  initialSlice = "one_per_domain",
  initialView = "backlinks",
  loadMoreEstimateCents = 0,
  now,
  onLoadMore,
  rows,
  target,
  totalDomains,
  totalRowsAvailable,
}: Readonly<BacklinksTableProps>) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [currentFetchedCount, setCurrentFetchedCount] = useState(fetchedRowCount);
  const [currentTotalAvailable, setCurrentTotalAvailable] = useState(totalRowsAvailable);
  const [view, setView] = useState<BacklinksView>(initialView);
  const [slice, setSlice] = useState<BacklinksSlice>(initialSlice);
  const [filter, setFilter] = useState<BacklinksFilter>(initialFilter);
  const [appliedFilters, setAppliedFilters] = useState<BacklinksFilters>(initialAdvancedFilters);
  const [draftFilters, setDraftFilters] = useState<BacklinksFilters>(initialAdvancedFilters);
  const [filtersOpen, setFiltersOpen] = useState(initialDrawerOpen);
  const [expandedDomains, setExpandedDomains] = useState<string[]>(initialExpandedDomains);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, string[]>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const referenceNow = now ?? new Date();
  const groups = groupBacklinksByDomain(currentRows, referenceNow);
  const filteredGroups = filterBacklinksDomainGroups(groups, appliedFilters, filter, referenceNow);
  const filteredRows = filteredGroups.flatMap((group) => group.rows);
  const draftGroups = filterBacklinksDomainGroups(groups, draftFilters, filter, referenceNow);
  const counts = domainFilterCounts(groups, referenceNow, totalDomains);
  const linkTypeCounts = backlinkLinkTypeCounts(groups);
  const aggregateRows =
    view === "backlinks" ? [] : aggregateBacklinksView(view, filteredRows, referenceNow);
  const shownDomainTotal = counts[filter];
  const shownLabel =
    filter === "broken"
      ? ""
      : `Showing ${filteredGroups.length.toLocaleString("en-US")} of ${shownDomainTotal.toLocaleString("en-US")} domains`;
  const expandedRunMap = new Map(
    Object.entries(expandedRuns).map(([domain, signatures]) => [domain, new Set(signatures)]),
  );

  function toggleDomain(domain: string) {
    setExpandedDomains((current) =>
      current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain],
    );
  }

  function expandRun(domain: string, signature: string) {
    setExpandedRuns((current) => ({
      ...current,
      [domain]: [...(current[domain] ?? []), signature],
    }));
  }

  function openFilters() {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  }

  async function loadMore() {
    if (!onLoadMore || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const outcome = await onLoadMore();
      if (!outcome.ok) {
        setLoadMoreError(true);
        return;
      }
      setCurrentRows((current) => [...current, ...outcome.rows]);
      setCurrentFetchedCount(outcome.fetchedRowCount);
      setCurrentTotalAvailable(outcome.totalRowsAvailable);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasLoadMore =
    Boolean(onLoadMore) &&
    filter !== "broken" &&
    filteredRows.length > 0 &&
    currentFetchedCount < currentTotalAvailable;

  return (
    <>
      <section className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-bg-elev">
        <BacklinksTableToolbar
          counts={counts}
          filter={filter}
          filterCount={activeBacklinksFilterCount(appliedFilters)}
          onFilterChange={setFilter}
          onOpenFilters={openFilters}
          onSliceChange={setSlice}
          onViewChange={setView}
          shownLabel={shownLabel}
          slice={slice}
          view={view}
          exportControl={
            <BacklinksExportMenu
              now={referenceNow}
              rows={filteredRows}
              slice={slice}
              target={target}
              view={view}
            />
          }
        />
        <div
          aria-labelledby={`backlinks-tab-${view}`}
          className="min-w-0 overflow-x-auto"
          id="backlinks-view-panel"
          role="tabpanel"
        >
          <div className="min-w-[1010px]">
            {filter === "broken" ? (
              <BrokenEmptyState />
            ) : view === "backlinks" ? (
              <>
                <BacklinksColumnHeaders />
                <BacklinksRows
                  expandedDomains={new Set(expandedDomains)}
                  expandedRuns={expandedRunMap}
                  groups={filteredGroups}
                  onRunExpand={expandRun}
                  onToggle={toggleDomain}
                  rows={filteredRows}
                  slice={slice}
                />
              </>
            ) : (
              <BacklinksAggregateTable
                fetchedCount={currentFetchedCount}
                rows={aggregateRows}
                totalCount={currentTotalAvailable}
                view={view}
              />
            )}
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-border-strong px-4 py-2.5">
          <span className="text-[12.5px] text-fg-muted">
            Fetched {currentFetchedCount.toLocaleString("en-US")} of{" "}
            {currentTotalAvailable.toLocaleString("en-US")} links
          </span>
          {hasLoadMore ? (
            <button
              className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-accent-text hover:text-accent-text focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid disabled:cursor-wait disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              type="button"
            >
              {loadingMore ? "Loading 100 more..." : "Load 100 more"}{" "}
              <span className="font-mono">~{formatEstimateCents(loadMoreEstimateCents)}</span>
            </button>
          ) : null}
          {loadMoreError ? (
            <span className="text-[12px] text-red-text" role="status">
              More backlinks could not be loaded. Try again.
            </span>
          ) : null}
          <span className="flex-1" />
          <span className="text-[12px] text-fg-muted">
            Sorting and filtering the fetched rows is free
          </span>
        </footer>
      </section>
      <BacklinksFiltersDrawer
        draft={draftFilters}
        linkTypeCounts={linkTypeCounts}
        onApply={applyFilters}
        onChange={setDraftFilters}
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        resultCount={draftGroups.length}
      />
    </>
  );
}
