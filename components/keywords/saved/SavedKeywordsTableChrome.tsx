"use client";

import { Button, MenuSelect } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { appPath } from "@/lib/routing/app-path";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  DownloadSimpleIcon as DownloadSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { downloadSavedKeywordsCsv } from "./saved-keywords-export";

export function SavedKeywordsToolbar({
  onSearchChange,
  projectRef,
  rows,
  search,
}: Readonly<{
  onSearchChange: (value: string) => void;
  projectRef: string;
  rows: readonly SavedKeywordRow[];
  search: string;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <label className="flex h-[34px] min-w-[220px] items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-solid">
        <MagnifyingGlass className="shrink-0 text-fg-muted" size={15} />
        <span className="sr-only">Filter saved keywords</span>
        <input
          aria-label="Filter saved keywords"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-muted"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter saved keywords..."
          type="search"
          value={search}
        />
      </label>
      <span className="flex-1" />
      <Button
        onClick={() => downloadSavedKeywordsCsv(rows)}
        size="sm"
        startIcon={<DownloadSimple size={14} />}
        variant="secondary"
      >
        Export
      </Button>
      <Button
        component={Link}
        endIcon={<CaretRight className="text-fg-muted" size={12} />}
        href={appPath(projectRef, "research")}
        size="sm"
        startIcon={<MagnifyingGlass size={13} />}
        variant="secondary"
      >
        Find more in Research
      </Button>
    </div>
  );
}

export function SavedKeywordsBulkBar({
  canDelete,
  canTrack,
  count,
  costCents,
  onClear,
  onRemove,
  onTrack,
  trackDisabledReason,
}: Readonly<{
  canDelete: boolean;
  canTrack: boolean;
  count: number;
  costCents: number | null;
  onClear: () => void;
  onRemove: () => void;
  onTrack: () => void;
  trackDisabledReason?: string;
}>) {
  const estimate = costCents == null ? null : formatEstimateCents(costCents);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e8d5c9] bg-accent-soft px-4 py-[9px]">
      <strong className="whitespace-nowrap text-[13px] text-accent-text">{count} selected</strong>
      <span className="font-mono text-[11px] text-[#a85c22]">
        {trackDisabledReason ??
          `tracking all ${count} adds ${
            estimate == null ? "an unavailable estimate" : `~${estimate}/mo`
          } at daily checks`}
      </span>
      <span className="flex-1" />
      {canDelete ? (
        <Button
          onClick={onRemove}
          size="sm"
          startIcon={<Trash size={13} />}
          sx={{ borderColor: "var(--red)", color: "var(--red)", minHeight: 30 }}
          variant="secondary"
        >
          Remove
        </Button>
      ) : null}
      {canTrack ? (
        <Button
          aria-label={`Track ${count}${estimate == null ? "" : ` ~${estimate}/mo`}`}
          disabled={Boolean(trackDisabledReason)}
          onClick={onTrack}
          size="sm"
          sx={{ minHeight: 30 }}
        >
          Track {count}
          {estimate == null ? null : (
            <span className="ml-1.5 font-mono text-[12px] font-medium">~{estimate}/mo</span>
          )}
        </Button>
      ) : null}
      <button
        className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-fg-muted hover:text-fg"
        onClick={onClear}
        type="button"
      >
        Clear
      </button>
    </div>
  );
}

export function SavedKeywordsFooter({
  end,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  start,
  total,
}: Readonly<{
  end: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  start: number;
  total: number;
}>) {
  const hasPrevious = page > 0;
  const hasNext = end < total;
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-t border-border-strong px-4 py-3">
      <span className="font-mono text-[11px] text-fg-muted">
        Metrics are a snapshot from the research run / saving is free, nothing is checked until you
        track
      </span>
      <div className="flex items-center gap-5">
        <MenuSelect
          ariaLabel="Rows per page"
          onChange={(value) => onPageSizeChange(Number(value))}
          options={[10, 25, 50].map((value) => ({ label: String(value), value: String(value) }))}
          triggerClassName="min-w-[126px] border-0 bg-transparent px-0 font-mono text-[12px]"
          value={String(pageSize)}
        />
        <span className="whitespace-nowrap font-mono text-[12px] text-fg-muted">
          {start}-{end} of {total}
        </span>
        <div className="flex gap-1">
          <button
            aria-label="Previous page"
            className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border-strong bg-transparent text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
            disabled={!hasPrevious}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <CaretLeft size={12} weight="bold" />
          </button>
          <button
            aria-label="Next page"
            className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border-strong bg-transparent text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            <CaretRight size={12} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
