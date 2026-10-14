import { resolveRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import type {
  RankTrackerQueryParseResult,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { keywordViewLegacyScope } from "@/lib/keywords/saved-view-v2-model";
import {
  cloneTablePresentation,
  type TablePresentation,
} from "@/lib/saved-views/presentation-model";
import type { ViewSelection } from "./selection-resolver";

export type KeywordPreferenceResolution = {
  missingScope: Array<"location" | "tags">;
  notice: "unavailable_default" | null;
  presentation: TablePresentation | null;
  state: RankTrackerQueryState;
  status: "ready" | "unavailable_view" | "unavailable_scope" | "invalid_url";
};

export function resolveKeywordPersonalView(input: {
  availableLocationIds: ReadonlySet<string>;
  availableTags: ReadonlySet<string>;
  parsed: RankTrackerQueryParseResult;
  personalPresentation?: TablePresentation | null;
  selection: ViewSelection;
}): KeywordPreferenceResolution {
  const selected =
    input.selection.kind === "saved_view" && input.selection.view.config.surface === "keywords"
      ? input.selection.view.config
      : null;
  const state = structuredClone(
    resolveRankTrackerQuery(input.parsed, selected ? keywordViewLegacyScope(selected) : null),
  );
  const incompatible = input.selection.kind === "saved_view" && selected === null;
  if (selected?.version === 2) {
    const urlScope = rankTrackerScope(state),
      savedScope = rankTrackerScope(selected);
    state.reportScope = {
      view: input.parsed.present.has("reportView") ? urlScope.view : savedScope.view,
      subject: input.parsed.present.has("localSubject") ? urlScope.subject : savedScope.subject,
      comparisonDays: input.parsed.present.has("comparisonDays")
        ? urlScope.comparisonDays
        : savedScope.comparisonDays,
      asOf: input.parsed.present.has("asOf") ? urlScope.asOf : savedScope.asOf,
    };
    if (!input.parsed.present.has("grouped")) state.grouped = selected.grouped;
    if (!input.parsed.present.has("pageSize")) state.pageSize = selected.pageSize;
    state.sort = {
      direction: input.parsed.present.has("direction")
        ? state.sort.direction
        : selected.sort.direction,
      field: input.parsed.present.has("sort") ? state.sort.field : selected.sort.field,
    };
  }
  state.savedViewId = input.selection.kind === "saved_view" ? input.selection.view.id : null;
  const missingScope: KeywordPreferenceResolution["missingScope"] = [];
  if (state.lens.locationId && !input.availableLocationIds.has(state.lens.locationId))
    missingScope.push("location");
  if (state.filters.tags.some((tag) => !input.availableTags.has(tag))) missingScope.push("tags");
  const viewPresentation = selected?.version === 2 ? selected.presentation : null;
  const presentation =
    input.selection.kind === "saved_view" && input.selection.source === "url"
      ? (viewPresentation ?? input.personalPresentation)
      : (input.personalPresentation ?? viewPresentation);
  return {
    missingScope,
    notice: input.selection.notice,
    presentation: presentation ? cloneTablePresentation(presentation) : null,
    state,
    status:
      incompatible || input.selection.kind === "unavailable_explicit_view"
        ? "unavailable_view"
        : input.parsed.issues.length
          ? "invalid_url"
          : missingScope.length
            ? "unavailable_scope"
            : "ready",
  };
}
