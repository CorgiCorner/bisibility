import { defaultRankTrackerQueryState } from "./rank-tracker-query";
import { defaultRankTrackerReportScope } from "./rank-tracker-report-scope";
import { savedViewConfigSchema } from "./saved-view-model";
import type { KeywordSavedViewV2Config, KeywordViewConfig } from "./saved-view-v2-model";
import { keywordSavedViewV2Schema, keywordViewLegacyScope } from "./saved-view-v2-model";

/** Pagination and automatic market grouping are navigation, not an edited saved preference. */
export function keywordViewModified(
  config: KeywordSavedViewV2Config,
  active: KeywordViewConfig | null,
  layoutModified: boolean,
) {
  if (active?.version === 2) {
    const { grouped: _savedGrouping, ...saved } = keywordSavedViewV2Schema.parse(active);
    const { grouped: _currentGrouping, ...current } = keywordSavedViewV2Schema.parse(config);
    return JSON.stringify(saved) !== JSON.stringify(current);
  }
  const defaults = defaultRankTrackerQueryState;
  const scope = keywordViewLegacyScope(config);
  const baseline = active ?? {
    filters: defaults.filters,
    lens: defaults.lens,
    search: defaults.search,
    surface: "keywords",
    version: 1,
  };
  return (
    JSON.stringify(config.reportScope) !== JSON.stringify(defaultRankTrackerReportScope) ||
    layoutModified ||
    JSON.stringify(savedViewConfigSchema.parse(scope)) !==
      JSON.stringify(savedViewConfigSchema.parse(baseline)) ||
    config.pageSize !== defaults.pageSize ||
    config.sort.field !== defaults.sort.field ||
    config.sort.direction !== defaults.sort.direction
  );
}
