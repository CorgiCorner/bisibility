"use client";

import { AppDrawer, Button } from "@/components/ui";
import { useMemo, useState } from "react";
import {
  normalizeRankedKeyword,
  type RankedKeywordGroup,
  rankedKeywordTraffic,
} from "./keyword-ranked-model";

const DEFAULT_SELECTION = 3;

type RankedKeywordSuggestionDrawerProps = {
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
  const selectable = ordered.filter((group) => !group.alreadyTracked && !current.has(group.key));
  const initial = selectable.slice(0, Math.min(DEFAULT_SELECTION, remaining));
  const [selected, setSelected] = useState(() => new Set(initial.map((group) => group.key)));
  const active = selectable.filter((group) => selected.has(group.key)).slice(0, remaining);
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
      new Set(
        selectable.slice(0, Math.min(DEFAULT_SELECTION, remaining)).map((group) => group.key),
      ),
    );
  }

  return (
    <AppDrawer
      description="Keywords your site already ranks for, ordered by estimated traffic."
      footer={
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11.5px] text-fg-muted">
            Spent this session: ${(spentCents / 100).toFixed(2)}
            {lastPageCached ? `. Page ${pageCount} cached.` : ""}
          </span>
          <div className="flex items-center justify-end gap-2.5">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={active.length === 0}
              onClick={() => onConfirm(active.map((group) => group.row.keyword.trim()))}
              type="button"
            >
              Add {active.length} {active.length === 1 ? "keyword" : "keywords"}
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
              setSelected(new Set(selectable.slice(0, remaining).map((item) => item.key)))
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
        <span className="self-center font-mono text-[11px] text-fg-muted">
          {active.length} of {selectable.length} selected
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table
          aria-label="Ranked keyword suggestions"
          className="w-full min-w-[560px] border-collapse text-left text-[12px]"
        >
          <thead>
            <tr className="border-b border-border-strong font-mono text-[10px] uppercase text-fg-muted">
              <th className="w-10" />
              <th className="py-2">Keyword</th>
              <th>Position</th>
              <th>Volume</th>
              <th>Est. traffic</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((group) => {
              const tracked = group.alreadyTracked || current.has(group.key);
              return (
                <tr className="border-b border-border" key={group.key}>
                  <td>
                    <input
                      aria-label={`Select ${group.row.keyword}`}
                      checked={!tracked && selected.has(group.key)}
                      className="size-4 accent-accent"
                      disabled={tracked}
                      onChange={() => toggle(group.key)}
                      type="checkbox"
                    />
                  </td>
                  <td className="py-2 font-medium text-fg">
                    {group.row.keyword}
                    {group.count > 1 ? (
                      <span className="ml-2 text-fg-muted">+{group.count - 1} variants</span>
                    ) : null}
                    {tracked ? <span className="ml-2 text-fg-muted">Already tracked</span> : null}
                  </td>
                  <td>{group.row.position ?? "-"}</td>
                  <td>{group.row.searchVolume ?? "-"}</td>
                  <td>
                    {group.row.estimatedTraffic == null
                      ? "-"
                      : Math.round(group.row.estimatedTraffic)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
