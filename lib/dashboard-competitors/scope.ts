import type { CompetitorViewConfig } from "@/lib/competitors/saved-view-v2-model";
import { normalizeOverviewFilters, type OverviewFilters } from "@/lib/queries/overview-filters";

export type ExplicitDashboardScope = {
  device?: string | string[];
  market?: string | string[];
  tag?: string | string[];
};
/** The chosen comparison fixes one market/device; conflicting URL axes remain unavailable. */
export function resolveDashboardComparisonScope(
  config: CompetitorViewConfig,
  filters: OverviewFilters,
  explicit: ExplicitDashboardScope,
) {
  const scope = config.scope;
  if (explicit.device !== undefined && explicit.device !== scope.device) return null;
  if (explicit.market !== undefined) {
    const raw = typeof explicit.market === "string" ? explicit.market.split(",") : explicit.market;
    if (raw.length !== 1 || raw[0] !== scope.locationId) return null;
  }
  if (explicit.tag !== undefined && typeof explicit.tag !== "string") return null;
  if (explicit.tag !== undefined && config.filters.tag && filters.tag !== config.filters.tag)
    return null;
  return normalizeOverviewFilters({
    ...filters,
    device: scope.device,
    marketIds: [scope.locationId],
    tag: filters.tag ?? config.filters.tag,
  });
}
