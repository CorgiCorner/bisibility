"use client";

import type { KeywordAction } from "@/components/keywords/action-utils";
import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import { Card } from "@/components/ui";
import { monthlyTrackingCostCents } from "@/lib/cost-estimate/project-estimate";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import type { AddKeywordsInput } from "@/lib/schemas/keyword";
import type { RemoveSavedKeywordsInput } from "@/lib/schemas/saved-keyword";
import type { SerpDevice } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SavedKeywordsEmptyState } from "./SavedKeywordsEmptyState";
import {
  SavedKeywordsBulkBar,
  SavedKeywordsFooter,
  SavedKeywordsToolbar,
} from "./SavedKeywordsTableChrome";
import { SavedKeywordsTableRows } from "./SavedKeywordsTableRows";
import { filterSavedKeywords, savedKeywordLocation } from "./saved-keywords-table-model";

export type SavedKeywordsTableProps = {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  canCreateKeyword: boolean;
  canDeleteKeyword: boolean;
  costContext: ProjectCostContext;
  defaultDevice: SerpDevice;
  domain?: string;
  onCountChange?: (count: number) => void;
  projectId: string;
  removeSavedKeywordsAction: (input: RemoveSavedKeywordsInput) => Promise<unknown>;
  rows: SavedKeywordRow[];
  total: number;
};

const DEFAULT_PAGE_SIZE = 10;

export function SavedKeywordsTable({
  addKeywordsAction,
  canCreateKeyword,
  canDeleteKeyword,
  costContext,
  defaultDevice,
  domain,
  onCountChange,
  projectId,
  removeSavedKeywordsAction,
  rows: initialRows,
  total,
}: Readonly<SavedKeywordsTableProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(total);
  const [trackDraft, setTrackDraft] = useState<SavedKeywordRow[] | null>(null);
  const filtered = useMemo(() => filterSavedKeywords(rows, search), [rows, search]);
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const activePage = Math.min(page, maxPage);
  const startIndex = activePage * pageSize;
  const pageRows = filtered.slice(startIndex, startIndex + pageSize);
  const selectedSet = new Set(selectedIds);
  const selectedRows = rows.filter((row) => selectedSet.has(row.publicId));
  const mixedLocationSelection =
    new Set(selectedRows.map((row) => row.location)).size > 1
      ? "Select keywords from one location to track them together."
      : undefined;
  const trackingCost = monthlyTrackingCostCents(
    selectedRows.length,
    {
      ...costContext,
      overrideCents: costContext.costPerCheckCents,
    },
    "daily",
  );

  function updateRows(removedIds: readonly string[]) {
    const removed = new Set(removedIds);
    const nextRows = rows.filter((row) => !removed.has(row.publicId));
    const nextTotal = Math.max(0, totalCount - removed.size);
    setRows(nextRows);
    setSelectedIds((current) => current.filter((id) => !removed.has(id)));
    setTotalCount(nextTotal);
    onCountChange?.(nextTotal);
  }

  async function removeRows(targetRows: readonly SavedKeywordRow[]) {
    if (targetRows.length === 0) return;
    setActionError(null);
    const publicIds = targetRows.map((row) => row.publicId);
    try {
      await removeSavedKeywordsAction({ projectId, publicIds });
      updateRows(publicIds);
      router.refresh();
    } catch {
      setActionError("Could not remove saved keywords. Try again.");
    }
  }

  function toggleRow(row: SavedKeywordRow) {
    setSelectedIds((current) =>
      current.includes(row.publicId)
        ? current.filter((id) => id !== row.publicId)
        : [...current, row.publicId],
    );
  }

  function togglePage() {
    const pageIds = pageRows.map((row) => row.publicId);
    const everySelected = pageIds.every((id) => selectedSet.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (everySelected) next.delete(id);
        else next.add(id);
      }
      return [...next];
    });
  }

  if (rows.length === 0) return <SavedKeywordsEmptyState projectRef={projectId} />;

  return (
    <>
      <Card className="overflow-hidden p-0" size="md">
        <SavedKeywordsToolbar
          onSearchChange={(value) => {
            setSearch(value);
            setPage(0);
          }}
          projectRef={projectId}
          rows={filtered}
          search={search}
        />
        {selectedRows.length > 0 ? (
          <SavedKeywordsBulkBar
            canDelete={canDeleteKeyword}
            canTrack={canCreateKeyword}
            costCents={trackingCost}
            count={selectedRows.length}
            onClear={() => setSelectedIds([])}
            onRemove={() => void removeRows(selectedRows)}
            onTrack={() => setTrackDraft(selectedRows)}
            trackDisabledReason={mixedLocationSelection}
          />
        ) : null}
        {actionError ? (
          <p className="m-0 border-b border-red/30 bg-red/10 px-4 py-2 text-[12px] text-red-text">
            {actionError}
          </p>
        ) : null}
        {filtered.length > 0 ? (
          <SavedKeywordsTableRows
            canDelete={canDeleteKeyword}
            canTrack={canCreateKeyword}
            onRemove={(row) => void removeRows([row])}
            onSelectAll={togglePage}
            onToggle={toggleRow}
            onTrack={(row) => setTrackDraft([row])}
            projectRef={projectId}
            rows={pageRows}
            selectedIds={selectedSet}
          />
        ) : (
          <div className="px-6 py-16 text-center">
            <h2 className="m-0 text-[15px] font-semibold">No saved keywords match</h2>
            <p className="mb-0 mt-1 text-[12.5px] text-fg-muted">
              Try another keyword or clear the filter.
            </p>
          </div>
        )}
        <SavedKeywordsFooter
          end={Math.min(startIndex + pageRows.length, filtered.length)}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(0);
          }}
          page={activePage}
          pageSize={pageSize}
          start={filtered.length === 0 ? 0 : startIndex + 1}
          total={filtered.length}
        />
      </Card>
      <AddKeywordDrawer
        addKeywordsAction={addKeywordsAction}
        consumeSavedIds={trackDraft?.map((row) => row.publicId)}
        costContext={costContext}
        defaultDevice={defaultDevice}
        defaultLocationSelection={
          trackDraft?.[0] ? (savedKeywordLocation(trackDraft[0].location) ?? undefined) : undefined
        }
        domain={domain}
        initialKeyword={trackDraft?.map((row) => row.text).join("\n")}
        initialScheduleFrequency="project_default"
        key={trackDraft?.map((row) => row.publicId).join(":") ?? "closed"}
        onAdded={() => {
          if (trackDraft) updateRows(trackDraft.map((row) => row.publicId));
          setTrackDraft(null);
        }}
        onClose={() => setTrackDraft(null)}
        open={Boolean(trackDraft)}
        projectId={projectId}
        showSchedule
      />
    </>
  );
}
