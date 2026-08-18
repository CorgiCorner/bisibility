"use client";

import { Card, SectionTitle } from "@/components/ui";
import type { CompetitorMarket } from "@/lib/competitors/types";
import { ExportIcon as Export } from "@phosphor-icons/react";
import { useState } from "react";

type HeadToHeadTableProps = {
  market: CompetitorMarket;
  onExport: () => void;
};

const ROW_PAGE_SIZE = 100;

function formatRank(rank: number | null) {
  return rank ? `#${rank}` : "n/a";
}

function formatGap(gap: number | null) {
  if (gap === null) {
    return "n/a";
  }
  return gap > 0 ? `+${gap}` : String(gap);
}

function gapColor(gap: number | null) {
  if (gap === null) {
    return "var(--fg-muted)";
  }
  if (gap > 0) {
    return "var(--green)";
  }
  if (gap < 0) {
    return "var(--red)";
  }
  return "var(--fg-muted)";
}

function rankColor(columnIndex: number, gap: number | null) {
  if (columnIndex !== 0) {
    return "var(--fg-muted)";
  }
  if (gap === null) {
    return "var(--fg)";
  }
  return gap >= 0 ? "var(--green)" : "var(--accent)";
}

export function HeadToHeadTable({ market, onExport }: Readonly<HeadToHeadTableProps>) {
  const [expanded, setExpanded] = useState(false);
  const [visibleRows, setVisibleRows] = useState(ROW_PAGE_SIZE);
  const hiddenCount = Math.max(0, market.columns.length - 4);
  const columns = expanded ? market.columns : market.columns.slice(0, 4);
  const gridTemplateColumns = `minmax(150px,2fr) repeat(${columns.length}, minmax(88px,1fr)) 72px`;
  const hasCompetitors = market.columns.length > 1;
  const rows = market.rows.slice(0, visibleRows);
  const hiddenRowCount = market.rows.length - rows.length;
  const emptyCopy =
    market.dataState === "filter_excludes_all"
      ? "No completed rank checks match the current filters."
      : market.dataState === "no_completed_checks"
        ? "Run at least one rank check for this market to populate head-to-head rows."
        : "No competitor rankings have been observed for this market yet.";

  return (
    <Card className="overflow-hidden p-0" size="md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4.5 py-[15px]">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionTitle>Shared keywords · head-to-head</SectionTitle>
          <p className="m-0 font-mono text-[11px] text-fg-muted">
            {market.location} / {market.languageLabel} /{" "}
            {market.device === "mobile" ? "Mobile" : "Desktop"} · {market.sharedKeywordCount} shared
            of {market.trackedKeywordCount} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 ? (
            <button
              className="inline-flex min-h-8 items-center rounded-lg border border-border-strong bg-bg-elev px-3 text-xs font-semibold text-fg-muted hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? "Show top competitors" : `+${hiddenCount} more`}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-bg-elev px-3 text-xs font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
            onClick={onExport}
            type="button"
          >
            <Export aria-hidden size={13} />
            Export
          </button>
        </div>
      </div>

      {!hasCompetitors ? (
        <div className="border-border-soft border-b bg-bg-sunken px-4.5 py-3 font-mono text-[10.5px] text-fg-muted">
          Add at least one competitor to compare head-to-head rankings.
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid gap-x-2.5 border-border border-b bg-bg-sunken px-4.5 py-2.5 font-mono text-[10px] uppercase text-fg-muted"
            style={{ gridTemplateColumns }}
          >
            <span>Keyword</span>
            {columns.map((column, index) => (
              <span className={index === 0 ? "text-accent-text" : undefined} key={column.domain}>
                {column.label}
              </span>
            ))}
            <span className="text-right">Gap</span>
          </div>
          {rows.map((row) => (
            <div
              className="grid items-center gap-x-2.5 border-border-soft border-b px-4.5 py-2.5"
              key={row.id}
              style={{ gridTemplateColumns }}
            >
              <span className="truncate text-[13px] font-medium">{row.keyword}</span>
              {columns.map((column, index) => (
                <span
                  className="font-mono text-[13px] font-semibold"
                  key={column.domain}
                  style={{ color: rankColor(index, row.gap) }}
                >
                  {formatRank(row.ranks[column.domain] ?? null)}
                </span>
              ))}
              <span
                className="text-right font-mono text-xs font-semibold"
                style={{ color: gapColor(row.gap) }}
              >
                {formatGap(row.gap)}
              </span>
            </div>
          ))}
          {market.rows.length === 0 ? (
            <div className="px-4.5 py-5 text-[13px] text-fg-muted">{emptyCopy}</div>
          ) : null}
          {hiddenRowCount > 0 ? (
            <div className="flex items-center justify-between gap-3 px-4.5 py-3 text-xs text-fg-muted">
              <span>
                Showing {rows.length} of {market.rows.length} keywords
              </span>
              <button
                className="inline-flex min-h-8 items-center rounded-lg border border-border-strong bg-bg-elev px-3 font-semibold text-fg-muted hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                onClick={() => setVisibleRows((count) => count + ROW_PAGE_SIZE)}
                type="button"
              >
                Show {Math.min(ROW_PAGE_SIZE, hiddenRowCount)} more
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
