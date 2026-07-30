/**
 * Server-side sanitizer for imported analytics top-queries (Search Console / GA4).
 * Real analytics exports contain operator queries, pasted header rows, row-number
 * prefixes and other noise that must never reach the suggestion UI. Ordering from
 * the source (by impressions/clicks) is preserved; only cleaning and de-duplication
 * happen here.
 */

export type TopQuerySuggestion = {
  query: string;
  clicks?: number;
  impressions?: number;
};

export type SanitizeTopQueriesResult = {
  /** Clean, de-duplicated suggestions in source order, capped at `limit`. */
  suggestions: TopQuerySuggestion[];
  /** Rows dropped as low-quality, kept raw so the UI can reveal them on request. */
  hidden: TopQuerySuggestion[];
  /** How many rows were dropped as low-quality (not counting silent de-dupes). */
  hiddenCount: number;
};

const MAX_QUERY_LENGTH = 100;
const ROW_NUMBER_PREFIX = /^\d+:\s*/;
const SURROUNDING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;
// Search operators (site:, -site:, intitle:, inurl:, filetype:, ...) as a standalone token.
const SEARCH_OPERATOR =
  /(^|\s)-?(site|intitle|allintitle|inurl|allinurl|intext|filetype|ext|around|related):/i;
// Boolean operators typed in caps, e.g. "seo OR sem", "keyword AND api".
const CAPS_BOOLEAN = /(^|\s)(OR|AND)(\s|$)/;

/** Cleans one raw query, or returns null when it is low-quality and must be dropped. */
export function cleanTopQuery(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed || collapsed.startsWith("#")) {
    return null;
  }

  const value = collapsed.replace(ROW_NUMBER_PREFIX, "").replace(SURROUNDING_QUOTES, "").trim();
  if (!value || value.length > MAX_QUERY_LENGTH) {
    return null;
  }
  if (SEARCH_OPERATOR.test(value) || CAPS_BOOLEAN.test(value)) {
    return null;
  }

  return value;
}

export function sanitizeTopQueries(
  rows: readonly TopQuerySuggestion[],
  limit: number,
): SanitizeTopQueriesResult {
  const seen = new Set<string>();
  const suggestions: TopQuerySuggestion[] = [];
  const hidden: TopQuerySuggestion[] = [];

  for (const row of rows) {
    if (suggestions.length >= limit) {
      break;
    }
    const cleaned = cleanTopQuery(row.query);
    if (cleaned === null) {
      hidden.push(row);
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      // Row-number-prefixed and case duplicates collapse silently, not counted as hidden.
      continue;
    }
    seen.add(key);
    suggestions.push({ ...row, query: cleaned });
  }

  return { suggestions, hidden, hiddenCount: hidden.length };
}
