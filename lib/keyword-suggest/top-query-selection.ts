import type { TopQuerySuggestion } from "./sanitize-top-queries";

/**
 * Pure selection model for the top-query suggestion picker. The drawer is a thin
 * presentational layer over these helpers: it holds a Set of selected query keys and
 * calls into here for decoration, bulk selections, filtering and the confirmed list.
 */

export type SelectableSuggestion = TopQuerySuggestion & { alreadyTracked: boolean };

export const DEFAULT_PRESELECT_TOP_N = 3;

function key(query: string) {
  return query.trim().toLowerCase();
}

/** Flags suggestions already tracked in the project (case-insensitive) so they render disabled. */
export function decorateSuggestions(
  suggestions: readonly TopQuerySuggestion[],
  existingKeywords: readonly string[],
): SelectableSuggestion[] {
  const tracked = new Set(existingKeywords.map(key));
  return suggestions.map((suggestion) => ({
    ...suggestion,
    alreadyTracked: tracked.has(key(suggestion.query)),
  }));
}

/** Query keys of every selectable (untracked) suggestion. */
export function selectableKeys(suggestions: readonly SelectableSuggestion[]): string[] {
  return suggestions.filter((suggestion) => !suggestion.alreadyTracked).map((s) => key(s.query));
}

/** True when every selectable suggestion is already selected (used to hide "Select all"). */
export function isAllSelected(
  suggestions: readonly SelectableSuggestion[],
  selected: ReadonlySet<string>,
): boolean {
  const keys = selectableKeys(suggestions);
  return keys.length > 0 && keys.every((queryKey) => selected.has(queryKey));
}

/** Query keys of the top N untracked suggestions by clicks, then impressions, then source order. */
export function topByClicksKeys(
  suggestions: readonly SelectableSuggestion[],
  count: number,
): string[] {
  return suggestions
    .map((suggestion, index) => ({ index, suggestion }))
    .filter(({ suggestion }) => !suggestion.alreadyTracked)
    .sort(
      (a, b) =>
        (b.suggestion.clicks ?? 0) - (a.suggestion.clicks ?? 0) ||
        (b.suggestion.impressions ?? 0) - (a.suggestion.impressions ?? 0) ||
        a.index - b.index,
    )
    .slice(0, Math.max(0, count))
    .map(({ suggestion }) => key(suggestion.query));
}

/** Suggestions ordered by clicks, impressions, then their original source order. */
export function sortByClicks(suggestions: readonly SelectableSuggestion[]): SelectableSuggestion[] {
  return suggestions
    .map((suggestion, index) => ({ index, suggestion }))
    .sort(
      (a, b) =>
        (b.suggestion.clicks ?? 0) - (a.suggestion.clicks ?? 0) ||
        (b.suggestion.impressions ?? 0) - (a.suggestion.impressions ?? 0) ||
        a.index - b.index,
    )
    .map(({ suggestion }) => suggestion);
}

/** Case-insensitive substring filter on the query text, preserving order. */
export function filterSuggestions(
  suggestions: readonly SelectableSuggestion[],
  term: string,
): SelectableSuggestion[] {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return [...suggestions];
  }
  return suggestions.filter((suggestion) => suggestion.query.toLowerCase().includes(needle));
}

/** Selected query strings in original casing and source order, excluding tracked rows. */
export function selectedQueries(
  suggestions: readonly SelectableSuggestion[],
  selected: ReadonlySet<string>,
): string[] {
  return suggestions
    .filter((suggestion) => !suggestion.alreadyTracked && selected.has(key(suggestion.query)))
    .map((suggestion) => suggestion.query);
}

/** Returns a new set with the query key toggled. */
export function toggleKey(selected: ReadonlySet<string>, query: string): Set<string> {
  const next = new Set(selected);
  const queryKey = key(query);
  if (next.has(queryKey)) {
    next.delete(queryKey);
  } else {
    next.add(queryKey);
  }
  return next;
}

export function queryKey(query: string): string {
  return key(query);
}
