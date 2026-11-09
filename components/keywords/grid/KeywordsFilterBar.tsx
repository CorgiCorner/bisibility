"use client";

import type { LocalizedKeywordFilterChip } from "@/components/keywords/filters/keyword-filter-presentation";
import { Button } from "@/components/ui/Button";
import type {
  DataTableColumn,
  DataTableDensity,
} from "@/components/ui/data-table/data-table-types";
import { Pill } from "@/components/ui/Pill";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import type { KeywordRow } from "@/lib/queries/keywords";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";
import { useFilterChipEdges } from "./use-filter-chip-edges";

type KeywordsFilterBarProps = {
  columnOrderControl?: ReactNode;
  columnSizing: Record<string, number>;
  columns: readonly DataTableColumn<KeywordRow>[];
  columnVisibility: Record<string, boolean>;
  density: DataTableDensity;
  filterChips: LocalizedKeywordFilterChip[];
  filterCount: number;
  id: string;
  onAddKeyword?: () => void;
  onClearFilters: () => void;
  onColumnSizingChange: (next: Record<string, number>) => void;
  onColumnVisibilityChange: (next: Record<string, boolean>) => void;
  onDensityChange: (density: DataTableDensity) => void;
  onImportCsv?: () => void;
  exportDisabled?: boolean;
  onOpenExport: () => void;
  onOpenFilters: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  onRemoveFilter: (key: string) => void;
  onSearchChange: (value: string) => void;
  onSearchCommit?: () => void;
  savedViewControl?: ReactNode;
  searchValue: string;
  scopeChip?: ReactNode;
  scopeControl?: ReactNode;
};

export function KeywordsFilterBar({
  columnOrderControl,
  columnSizing,
  columns,
  columnVisibility,
  density,
  filterChips,
  filterCount,
  id,
  onAddKeyword,
  onClearFilters,
  onColumnSizingChange,
  onColumnVisibilityChange,
  onDensityChange,
  onImportCsv,
  exportDisabled,
  onOpenExport,
  onOpenFilters,
  onRefresh,
  refreshing = false,
  onRemoveFilter,
  onSearchChange,
  onSearchCommit,
  savedViewControl,
  searchValue,
  scopeChip,
  scopeControl,
}: Readonly<KeywordsFilterBarProps>) {
  const t = useTranslations("projectRankTracker.list.filterBar");
  const { edges, setChipsRow } = useFilterChipEdges();
  const hasFilters = filterCount > 0 || Boolean(searchValue.trim());
  const hasContextControls = Boolean(scopeControl || savedViewControl);

  return (
    <div className="px-4 py-3" data-keywords-toolbar="">
      <div className="grid gap-2">
        {hasContextControls ? (
          <div
            // `contents` would leak these into the parent grid as separate rows below xl.
            className="order-2 flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-2 lg:order-1"
            data-keywords-toolbar-context=""
          >
            {scopeControl ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">{scopeControl}</div>
            ) : null}
            {savedViewControl ? (
              <span className="hidden flex-none sm:inline-flex">{savedViewControl}</span>
            ) : null}
          </div>
        ) : null}
        <div className="order-1 grid min-w-0 grid-cols-1 items-center gap-2 lg:order-2 2xl:grid-cols-[minmax(220px,1fr)_auto]">
          <ToolbarSearch
            variant="outlined"
            className="min-w-0"
            id="keywords-filter"
            label={t("searchKeywords")}
            onChange={onSearchChange}
            onSubmit={onSearchCommit}
            placeholder={t("searchPlaceholder")}
            value={searchValue}
          />
          <KeywordsToolbarActions
            columnOrderControl={columnOrderControl}
            columnSizing={columnSizing}
            columns={columns}
            columnVisibility={columnVisibility}
            density={density}
            filterCount={filterCount}
            id={id}
            onAddKeyword={onAddKeyword}
            onColumnSizingChange={onColumnSizingChange}
            onColumnVisibilityChange={onColumnVisibilityChange}
            onDensityChange={onDensityChange}
            onImportCsv={onImportCsv}
            exportDisabled={exportDisabled}
            onOpenExport={onOpenExport}
            onOpenFilters={onOpenFilters}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        </div>
      </div>
      {hasFilters || scopeChip ? (
        <div className={`relative mt-3 min-w-0 ${hasFilters ? "" : "lg:hidden"}`}>
          <div
            className="flex min-h-7 min-w-0 items-center gap-2 overflow-x-auto px-1 py-1 [&>*]:shrink-0"
            data-keywords-filter-chips=""
            ref={setChipsRow}
          >
            {hasFilters ? (
              <span className="mr-1 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.6px] text-fg-muted">
                {t("activeFilters")}
              </span>
            ) : null}
            {scopeChip}
            {filterChips.map((chip) => (
              <Pill
                active
                aria-label={t("removeFilter", { filter: chip.label })}
                key={chip.key}
                onClick={() => onRemoveFilter(chip.key)}
                size="sm"
              >
                {chip.label}
                <X aria-hidden size={11} weight="regular" />
              </Pill>
            ))}
            {hasFilters ? (
              <Button
                variant="ghost"
                size="xs"
                aria-label={t("clearAllAriaLabel")}
                onClick={onClearFilters}
                type="button"
              >
                {t("clearAll")}
              </Button>
            ) : null}
          </div>
          {edges.start ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-bg-elev to-transparent"
              data-filter-fade="start"
            />
          ) : null}
          {edges.end ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-bg-elev to-transparent"
              data-filter-fade="end"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
