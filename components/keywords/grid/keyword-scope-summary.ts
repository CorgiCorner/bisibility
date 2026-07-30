import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensDevice, LensLocationOption } from "@/lib/keywords/lens-model";

export const BASE_KEYWORD_LENS = { device: "all", locationId: null } satisfies ActiveLens;

const deviceLabels: Record<LensDevice, string> = {
  all: "All devices",
  desktop: "Desktop",
  mobile: "Mobile",
};

const rankDataFilterKeys = new Set(["change", "position", "urlChanged", "wrongUrl"]);

export function hasActiveKeywordScope(lens: ActiveLens) {
  return Boolean(lens.locationId) || lens.device !== "all";
}

export function activeLocationLabel(lens: ActiveLens, options: LensLocationOption[]) {
  if (!lens.locationId) {
    return "All locations";
  }
  return (
    options.find((option) => option.id === lens.locationId)?.displayName ?? "Selected location"
  );
}

export function keywordScopeSummary(lens: ActiveLens, options: LensLocationOption[]) {
  return `Scope: ${activeLocationLabel(lens, options)}, ${deviceLabels[lens.device]}`;
}

function keywordFiltersNeedRankData(chips: KeywordFilterChip[]) {
  return chips.some((chip) => rankDataFilterKeys.has(chip.key) || chip.key.startsWith("serp:"));
}

export function keywordNoRowsCopy({
  filterCount,
  hasSearch,
  lens,
  needsRankData,
  options,
}: {
  filterCount: number;
  hasSearch: boolean;
  lens: ActiveLens;
  needsRankData: boolean;
  options: LensLocationOption[];
}) {
  const context: string[] = [];
  if (lens.locationId) context.push(activeLocationLabel(lens, options));
  if (lens.device !== "all") context.push(deviceLabels[lens.device]);
  const activeFilterCount = filterCount + Number(hasSearch);
  const filterContext = `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`;
  const scopeContext = context.join(" / ");
  const noRowsContext =
    scopeContext && activeFilterCount > 0
      ? `${scopeContext} with ${filterContext}`
      : scopeContext || (activeFilterCount > 0 ? filterContext : "the current view");

  if (needsRankData) {
    return {
      description:
        "Some active filters need ranking data. Remove the ranking filters to see keywords awaiting their first check.",
      title: `No keywords match ${noRowsContext}`,
    };
  }
  if (activeFilterCount > 0 && hasActiveKeywordScope(lens)) {
    return {
      description: "Adjust the active filters or show keywords from all locations and devices.",
      title: `No keywords match ${noRowsContext}`,
    };
  }
  if (activeFilterCount > 0) {
    return {
      description: "Adjust or clear the active filters to show the full keyword list.",
      title: `No keywords match ${noRowsContext}`,
    };
  }
  return {
    description: "Show keywords from all locations and devices.",
    title: `No keywords match ${noRowsContext}`,
  };
}

export function keywordNoRowsState({
  filterChips,
  hasNoRankData,
  hasSearch,
  lens,
  onResetScope,
  options,
}: {
  filterChips: KeywordFilterChip[];
  hasNoRankData: boolean;
  hasSearch: boolean;
  lens: ActiveLens;
  onResetScope: () => void;
  options: LensLocationOption[];
}) {
  return {
    ...keywordNoRowsCopy({
      filterCount: filterChips.length,
      hasSearch,
      lens,
      needsRankData: hasNoRankData && keywordFiltersNeedRankData(filterChips),
      options,
    }),
    onResetScope: hasActiveKeywordScope(lens) ? onResetScope : undefined,
  };
}
