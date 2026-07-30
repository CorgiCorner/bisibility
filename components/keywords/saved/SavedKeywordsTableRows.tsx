"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import {
  chronologicalTrend,
  difficultyPillStyle,
  IntentChip,
} from "@/components/research/research-results-model";
import { Checkbox } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { cn } from "@/lib/ui/cn";
import { ClockIcon as Clock } from "@phosphor-icons/react";
import Link from "next/link";
import { SavedKeywordRowMenu } from "./SavedKeywordRowMenu";
import {
  savedKeywordAge,
  savedKeywordIsStale,
  savedKeywordResearchHref,
} from "./saved-keywords-table-model";

type SavedKeywordsTableRowsProps = {
  canDelete: boolean;
  canTrack: boolean;
  onRemove: (row: SavedKeywordRow) => void;
  onSelectAll: () => void;
  onToggle: (row: SavedKeywordRow) => void;
  onTrack: (row: SavedKeywordRow) => void;
  projectRef: string;
  rows: SavedKeywordRow[];
  selectedIds: ReadonlySet<string>;
};

const headers = ["Keyword", "Volume", "Trend", "KD", "CPC", "Intent", "Source", "Saved"] as const;

function SavedAt({ savedAt }: Readonly<{ savedAt: string }>) {
  const stale = savedKeywordIsStale(savedAt);
  return (
    <span
      aria-label={stale ? "Saved snapshot is getting stale" : undefined}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[12px]",
        stale ? "text-yellow-strong" : "text-fg-muted",
      )}
    >
      {stale ? <Clock size={12} /> : null}
      {savedKeywordAge(savedAt)}
    </span>
  );
}

function KeywordCell({ row }: Readonly<{ row: SavedKeywordRow }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-[13.5px] font-medium text-fg">{row.text}</span>
      {row.variantCount > 0 ? (
        <span className="whitespace-nowrap text-[11px] text-fg-faint">
          +{row.variantCount} variants
        </span>
      ) : null}
    </span>
  );
}

export function SavedKeywordsTableRows({
  canDelete,
  canTrack,
  onRemove,
  onSelectAll,
  onToggle,
  onTrack,
  projectRef,
  rows,
  selectedIds,
}: Readonly<SavedKeywordsTableRowsProps>) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.publicId));
  const someSelected = !allSelected && rows.some((row) => selectedIds.has(row.publicId));
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed border-collapse">
        <colgroup>
          <col className="w-[50px]" />
          <col />
          <col className="w-[86px]" />
          <col className="w-[92px]" />
          <col className="w-[64px]" />
          <col className="w-[78px]" />
          <col className="w-[84px]" />
          <col className="w-[160px]" />
          <col className="w-[104px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border-strong">
            <th className="px-4 py-[9px] text-left">
              <Checkbox
                aria-checked={someSelected ? "mixed" : allSelected}
                aria-label="Select visible saved keywords"
                checked={allSelected}
                onChange={onSelectAll}
              />
            </th>
            {headers.map((header) => (
              <th
                className={cn(
                  "px-1 py-[9px] text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted",
                  header === "Volume" && "text-right font-semibold text-accent-hover",
                  header === "CPC" && "text-right",
                )}
                key={header}
              >
                {header}
                {header === "Volume" ? " ↓" : null}
              </th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedIds.has(row.publicId);
            return (
              <tr
                className={cn(
                  "cursor-pointer border-b border-border-soft transition-colors hover:bg-bg-sunken",
                  selected && "bg-accent-soft shadow-[inset_2px_0_0_var(--accent)]",
                )}
                key={row.publicId}
                onClick={() => onToggle(row)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle(row);
                  }
                }}
                tabIndex={0}
              >
                <td className="px-4 py-2.5">
                  <Checkbox
                    aria-label={`Select ${row.text}`}
                    checked={selected}
                    onChange={() => onToggle(row)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td className="px-1 py-2.5">
                  <KeywordCell row={row} />
                </td>
                <td className="px-1 py-2.5 text-right font-mono text-[13px] text-fg">
                  {row.volume == null ? "-" : row.volume.toLocaleString("en-US")}
                </td>
                <td className="px-1 py-2.5">
                  <Sparkline
                    ariaLabel={`Monthly volume trend for ${row.text}`}
                    data={chronologicalTrend(row.trend).map((point) => point.searchVolume)}
                  />
                </td>
                <td className="px-1 py-2.5">
                  <span
                    className="inline-grid h-6 min-w-6 place-items-center rounded-full border px-1 font-mono text-[10.5px] font-semibold"
                    style={difficultyPillStyle(row.difficulty)}
                  >
                    {row.difficulty ?? "-"}
                  </span>
                </td>
                <td className="px-1 py-2.5 text-right font-mono text-[13px] text-fg-muted">
                  {row.cpc == null ? "-" : formatEstimateCents(row.cpc * 100)}
                </td>
                <td className="px-1 py-2.5">
                  <IntentChip intent={row.intent} />
                </td>
                <td className="px-1 py-2.5">
                  <Link
                    aria-label={`${row.sourceSeed ?? "Research"} / ${row.location}`}
                    className="inline-block max-w-full truncate rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-faint hover:text-accent"
                    href={savedKeywordResearchHref(projectRef, row)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.sourceSeed ?? "Research"} / {row.location}
                  </Link>
                </td>
                <td className="px-1 py-2.5">
                  <SavedAt savedAt={row.savedAt} />
                </td>
                <td className="px-2 py-2.5">
                  <SavedKeywordRowMenu
                    canDelete={canDelete}
                    canTrack={canTrack}
                    onRemove={onRemove}
                    onTrack={onTrack}
                    projectRef={projectRef}
                    row={row}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
