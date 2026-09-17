import type { LocalizedKeywordFilterChip } from "@/components/keywords/filters/keyword-filter-presentation";
import type { ActiveLens, LensDevice, LensLocationOption } from "@/lib/keywords/lens-model";
import type { useTranslations } from "next-intl";

type GridTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.grid">
>;

export const BASE_KEYWORD_LENS = { device: "all", locationId: null } satisfies ActiveLens;

function deviceLabel(device: LensDevice, t: GridTranslations) {
  return t(
    device === "all" ? "allDevices" : device === "desktop" ? "deviceDesktop" : "deviceMobile",
  );
}

const rankDataFilterKeys = new Set(["change", "position", "urlChanged", "wrongUrl"]);

export function hasActiveKeywordScope(lens: ActiveLens) {
  return Boolean(lens.locationId) || lens.device !== "all";
}

export function activeLocationLabel(
  lens: ActiveLens,
  options: LensLocationOption[],
  t: GridTranslations,
) {
  if (!lens.locationId) {
    return t("allLocations");
  }
  return (
    options.find((option) => option.id === lens.locationId)?.displayName ?? t("selectedLocation")
  );
}

export function keywordScopeSummary(
  lens: ActiveLens,
  options: LensLocationOption[],
  t: GridTranslations,
) {
  return t("scopeSummary", {
    device: deviceLabel(lens.device, t),
    location: activeLocationLabel(lens, options, t),
  });
}

export function capturedKeywordFiltersSummary({
  filterChips,
  lens,
  options,
  search,
  t,
}: {
  filterChips: LocalizedKeywordFilterChip[];
  lens: ActiveLens;
  options: LensLocationOption[];
  search: string;
  t: GridTranslations;
}) {
  return [
    keywordScopeSummary(lens, options, t),
    search ? t("searchSummary", { search }) : null,
    ...filterChips.map((chip) => chip.label),
  ]
    .filter(Boolean)
    .join(" / ");
}

function keywordFiltersNeedRankData(chips: LocalizedKeywordFilterChip[]) {
  return chips.some((chip) => rankDataFilterKeys.has(chip.key) || chip.key.startsWith("serp:"));
}

export function keywordNoRowsCopy({
  filterCount,
  hasSearch,
  lens,
  needsRankData,
  options,
  t,
}: {
  filterCount: number;
  hasSearch: boolean;
  lens: ActiveLens;
  needsRankData: boolean;
  options: LensLocationOption[];
  t: GridTranslations;
}) {
  const context: string[] = [];
  if (lens.locationId) context.push(activeLocationLabel(lens, options, t));
  if (lens.device !== "all") context.push(deviceLabel(lens.device, t));
  const activeFilterCount = filterCount + Number(hasSearch);
  const filterContext = t("activeFilters", { count: activeFilterCount });
  const scopeContext = context.join(" / ");
  const noRowsContext =
    scopeContext && activeFilterCount > 0
      ? t("scopeWithFilters", { filters: filterContext, scope: scopeContext })
      : scopeContext || (activeFilterCount > 0 ? filterContext : t("currentView"));

  if (needsRankData) {
    return {
      description: t("noRowsNeedRanking"),
      title: t("noKeywordsMatch", { context: noRowsContext }),
    };
  }
  if (activeFilterCount > 0 && hasActiveKeywordScope(lens)) {
    return {
      description: t("noRowsAdjustScope"),
      title: t("noKeywordsMatch", { context: noRowsContext }),
    };
  }
  if (activeFilterCount > 0) {
    return {
      description: t("noRowsAdjustFilters"),
      title: t("noKeywordsMatch", { context: noRowsContext }),
    };
  }
  return {
    description: t("noRowsShowAll"),
    title: t("noKeywordsMatch", { context: noRowsContext }),
  };
}

export function keywordNoRowsState({
  filterChips,
  hasNoRankData,
  hasSearch,
  lens,
  onResetScope,
  options,
  t,
}: {
  filterChips: LocalizedKeywordFilterChip[];
  hasNoRankData: boolean;
  hasSearch: boolean;
  lens: ActiveLens;
  onResetScope: () => void;
  options: LensLocationOption[];
  t: GridTranslations;
}) {
  return {
    ...keywordNoRowsCopy({
      filterCount: filterChips.length,
      hasSearch,
      lens,
      needsRankData: hasNoRankData && keywordFiltersNeedRankData(filterChips),
      options,
      t,
    }),
    onResetScope: hasActiveKeywordScope(lens) ? onResetScope : undefined,
  };
}

export function flatKeywordNoRowsState(input: {
  activeLens: ActiveLens;
  filterChips: LocalizedKeywordFilterChip[];
  flatServer: boolean;
  hasNoRankData: boolean;
  locationOptions: LensLocationOption[];
  onResetScope: () => void;
  page?: number;
  rowsEmpty: boolean;
  searchValue: string;
  t: GridTranslations;
}) {
  if (input.flatServer && input.page && input.page > 1 && input.rowsEmpty)
    return {
      description: input.t("pageUnavailableDescription"),
      title: input.t("pageUnavailableTitle"),
    };
  if (!input.rowsEmpty) return undefined;
  return keywordNoRowsState({
    filterChips: input.filterChips,
    hasNoRankData: input.hasNoRankData,
    hasSearch: Boolean(input.searchValue.trim()),
    lens: input.activeLens,
    onResetScope: input.onResetScope,
    options: input.locationOptions,
    t: input.t,
  });
}
