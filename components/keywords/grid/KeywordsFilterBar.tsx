"use client";

import { Pill, ToolbarSearch } from "@/components/ui";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import { XIcon as X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";

type KeywordsFilterBarProps = {
  columnVisibilityModel: GridColumnVisibilityModel;
  density: GridDensity;
  filterChips: KeywordFilterChip[];
  filterCount: number;
  groupingControl?: ReactNode;
  onAddKeyword?: () => void;
  onClearFilters: () => void;
  onColumnVisibilityChange: (model: GridColumnVisibilityModel) => void;
  onDensityChange: (density: GridDensity) => void;
  onImportCsv?: () => void;
  onOpenExport: () => void;
  onOpenFilters: () => void;
  onRemoveFilter: (key: string) => void;
  onSearchChange: (value: string) => void;
  savedViewControl?: ReactNode;
  searchValue: string;
  scopeChip?: ReactNode;
  scopeControl?: ReactNode;
};

export function KeywordsFilterBar({
  columnVisibilityModel,
  density,
  filterChips,
  filterCount,
  groupingControl,
  onAddKeyword,
  onClearFilters,
  onColumnVisibilityChange,
  onDensityChange,
  onImportCsv,
  onOpenExport,
  onOpenFilters,
  onRemoveFilter,
  onSearchChange,
  savedViewControl,
  searchValue,
  scopeChip,
  scopeControl,
}: Readonly<KeywordsFilterBarProps>) {
  const hasChips = Boolean(scopeChip) || filterChips.length > 0;
  const hasFilters = filterCount > 0 || Boolean(searchValue.trim());
  const hasContextControls = Boolean(scopeControl || groupingControl || savedViewControl);
  // The scope chip is mobile-only (sm:hidden), so a row holding nothing else
  // would render as bare vertical space on desktop.
  const scopeChipOnly = Boolean(scopeChip) && filterChips.length === 0 && !hasFilters;

  return (
    <div className="border-b border-border px-4 py-[14px]">
      <div className="grid gap-3">
        {hasContextControls ? (
          <div
            className="contents xl:flex xl:items-center xl:gap-2"
            data-keywords-toolbar-context=""
          >
            {scopeControl ? (
              <div className="flex min-w-0 items-center gap-2 xl:shrink-0">{scopeControl}</div>
            ) : null}
            {groupingControl ? <div className="flex-none">{groupingControl}</div> : null}
            {savedViewControl ? (
              <span className="hidden flex-none sm:inline-flex">{savedViewControl}</span>
            ) : null}
          </div>
        ) : null}
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-center xl:grid-cols-[minmax(320px,1fr)_auto]">
          <ToolbarSearch
            className="min-w-0"
            id="keywords-filter"
            label="Filter keywords"
            onChange={onSearchChange}
            placeholder="Filter keywords..."
            value={searchValue}
          />
          <KeywordsToolbarActions
            columnVisibilityModel={columnVisibilityModel}
            density={density}
            filterCount={filterCount}
            onAddKeyword={onAddKeyword}
            onColumnVisibilityChange={onColumnVisibilityChange}
            onDensityChange={onDensityChange}
            onImportCsv={onImportCsv}
            onOpenExport={onOpenExport}
            onOpenFilters={onOpenFilters}
          />
        </div>
      </div>
      {hasChips || hasFilters ? (
        <div
          className={`mt-3 flex min-w-0 flex-wrap items-center gap-2 ${scopeChipOnly ? "sm:hidden" : ""}`}
        >
          {hasFilters ? (
            <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.6px] text-fg-muted">
              Active filters
            </span>
          ) : null}
          {scopeChip}
          {filterChips.map((chip) => (
            <Pill
              active
              aria-label={`Remove filter: ${chip.label}`}
              key={chip.key}
              onClick={() => onRemoveFilter(chip.key)}
              size="sm"
            >
              {chip.label}
              <X aria-hidden size={11} weight="bold" />
            </Pill>
          ))}
          {hasFilters ? (
            <button
              aria-label="Clear all search and filters"
              className="min-h-7 rounded-full px-2.5 text-[12px] font-semibold text-fg-muted transition-colors hover:bg-bg-sunken hover:text-accent-text"
              onClick={onClearFilters}
              type="button"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
