"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { useMemo, useState } from "react";
import {
  normalizeRankedKeyword,
  type RankedKeywordGroup,
  rankedKeywordTraffic,
} from "./keyword-ranked-model";
import {
  type RankedSuggestionTableRow,
  rankedSuggestionTableColumns,
} from "./ranked-suggestion-table-columns";

const DEFAULT_SELECTION = 3;

type RankedKeywordSuggestionDrawerProps = {
  selectionOnly?: boolean;
  canLoad: boolean;
  currentKeywords: readonly string[];
  groups: RankedKeywordGroup[];
  onClose: () => void;
  onConfirm: (queries: string[]) => void;
  onLoadMore: () => void;
  open: boolean;
  pageCount: number;
  pageCost: string | null;
  pending: boolean;
  remaining: number;
  spentCents: number;
  lastPageCached: boolean;
};

function orderedGroups(groups: readonly RankedKeywordGroup[]) {
  return [...groups].sort(
    (left, right) =>
      rankedKeywordTraffic(right.row.estimatedTraffic) -
        rankedKeywordTraffic(left.row.estimatedTraffic) ||
      left.row.keyword.localeCompare(right.row.keyword),
  );
}

export function RankedKeywordSuggestionDrawer({
  selectionOnly = false,
  canLoad,
  currentKeywords,
  groups,
  onClose,
  onConfirm,
  onLoadMore,
  open,
  pageCount,
  pageCost,
  pending,
  remaining,
  spentCents,
  lastPageCached,
}: Readonly<RankedKeywordSuggestionDrawerProps>) {
  const current = useMemo(
    () => new Set(currentKeywords.map(normalizeRankedKeyword)),
    [currentKeywords],
  );
  const ordered = useMemo(() => orderedGroups(groups), [groups]);
  const rows = useMemo<RankedSuggestionTableRow[]>(
    () =>
      ordered.map((group) => ({
        group,
        id: group.key,
        keyword: group.row.keyword,
        tracked: group.alreadyTracked || current.has(group.key),
      })),
    [current, ordered],
  );
  const selectable = rows.filter((row) => !row.tracked);
  const initial = selectable.slice(0, Math.min(DEFAULT_SELECTION, remaining));
  const [selected, setSelected] = useState(() => new Set(initial.map((row) => row.id)));
  const active = selectable.filter((row) => selected.has(row.id)).slice(0, remaining);
  const allSelected = active.length > 0 && active.length === Math.min(selectable.length, remaining);

  function toggle(key: string) {
    setSelected((value) => {
      const next = new Set(value);
      if (next.has(key)) next.delete(key);
      else if (active.length < remaining) next.add(key);
      return next;
    });
  }

  function selectTop() {
    setSelected(
      new Set(selectable.slice(0, Math.min(DEFAULT_SELECTION, remaining)).map((row) => row.id)),
    );
  }

  return (
    <AppDrawer
      description="Keywords your site already ranks for, ordered by estimated traffic."
      footer={
        <div className="flex flex-col gap-2">
          <span className="text-[11.5px] text-fg-muted tabular-nums">
            Spent this session: ${(spentCents / 100).toFixed(2)}
            {lastPageCached ? `. Page ${pageCount} cached.` : ""}
          </span>
          <div className="flex items-center justify-end gap-2.5">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={active.length === 0}
              onClick={() => onConfirm(active.map((row) => row.group.row.keyword.trim()))}
              type="button"
            >
              {selectionOnly ? "Use" : "Add"} {active.length}{" "}
              {active.length === 1 ? "keyword" : "keywords"}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      title="Import from DataForSEO"
    >
      <div className="flex flex-wrap gap-2">
        {!allSelected ? (
          <Button
            onClick={() =>
              setSelected(new Set(selectable.slice(0, remaining).map((row) => row.id)))
            }
            size="xs"
            type="button"
            variant="secondary"
          >
            Select all
          </Button>
        ) : null}
        {active.length > 0 ? (
          <Button
            onClick={() => setSelected(new Set())}
            size="xs"
            type="button"
            variant="secondary"
          >
            Clear
          </Button>
        ) : null}
        <Button onClick={selectTop} size="xs" type="button" variant="secondary">
          Top 3 by traffic
        </Button>
        <span className="self-center text-[11px] text-fg-muted tabular-nums">
          {active.length} of {selectable.length} selected
        </span>
      </div>
      <div className="mt-3" data-analytics-mask>
        <DataTable
          ariaLabel="Ranked keyword suggestions"
          columns={rankedSuggestionTableColumns({
            onToggle: toggle,
            selected,
            trackedLabel: selectionOnly ? "In draft" : "Already tracked",
          })}
          density="compact"
          id="ranked-keyword-suggestions"
          layout="auto"
          onSortingChange={() => undefined}
          rows={rows}
          sorting={null}
        />
      </div>
      {canLoad ? (
        <Button
          className="mt-4"
          loading={pending}
          onClick={onLoadMore}
          type="button"
          variant="secondary"
        >
          Load next 100{pageCost ? ` (about ${pageCost})` : ""}
        </Button>
      ) : null}
    </AppDrawer>
  );
}
