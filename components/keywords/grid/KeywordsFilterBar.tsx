"use client";

import { Pill, toolbarControlClassName } from "@/components/ui";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import { cn } from "@/lib/ui/cn";
import InputBase from "@mui/material/InputBase";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import { MagnifyingGlassIcon as MagnifyingGlass, XIcon as X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";

type KeywordsFilterBarProps = {
  columnVisibilityModel: GridColumnVisibilityModel;
  density: GridDensity;
  filterChips: KeywordFilterChip[];
  filterCount: number;
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
  // The scope chip is mobile-only (sm:hidden), so a row holding nothing else
  // would render as bare vertical space on desktop.
  const scopeChipOnly = Boolean(scopeChip) && filterChips.length === 0 && !hasFilters;

  return (
    <div className="border-b border-border px-4 py-[14px]">
      <div className="grid gap-3 xl:flex xl:items-center xl:justify-between">
        {scopeControl ? (
          <div className="flex min-w-0 items-center gap-2 xl:shrink-0">{scopeControl}</div>
        ) : null}
        {scopeControl ? <div className="hidden h-8 w-px bg-border-strong xl:block" /> : null}
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            {savedViewControl ? (
              <span className="hidden flex-none sm:inline-flex">{savedViewControl}</span>
            ) : null}
            <label
              className={cn(
                toolbarControlClassName,
                "flex min-w-0 flex-1 items-center gap-2 px-3 transition-colors focus-within:border-accent",
              )}
              htmlFor="keywords-filter"
            >
              <MagnifyingGlass className="shrink-0 text-fg-muted" size={15} />
              <InputBase
                aria-label="Filter keywords"
                fullWidth
                id="keywords-filter"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Filter keywords..."
                sx={{
                  color: "var(--fg)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "inherit",
                  fontWeight: "inherit",
                }}
                value={searchValue}
              />
            </label>
          </div>
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
