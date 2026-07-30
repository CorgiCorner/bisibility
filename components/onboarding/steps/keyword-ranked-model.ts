import type { RankedKeywordsOutcome, RankedKeywordsSuccess } from "@/lib/ranked-keywords/service";

export type FetchRankedKeywordSuggestionsAction = (input: {
  connectionId?: string;
  offset?: number;
  projectId: string;
}) => Promise<RankedKeywordsSuccess | { reason: RankedKeywordError }>;

export type RankedKeywordError =
  Exclude<RankedKeywordsOutcome, { ok: true }> extends { reason: infer T } ? T : never;
export type RankedKeywordsPage = RankedKeywordsSuccess;

export function normalizeRankedKeyword(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankedKeywordTraffic(value: number | null) {
  return value ?? -1;
}

export function groupRankedKeywords(pages: RankedKeywordsPage[]) {
  const grouped = new Map<
    string,
    {
      alreadyTracked: boolean;
      count: number;
      row: RankedKeywordsPage["rows"][number];
    }
  >();
  for (const row of pages.flatMap((page) => page.rows)) {
    const key = normalizeRankedKeyword(row.keyword);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { alreadyTracked: row.alreadyTracked, count: 1, row });
      continue;
    }
    current.count += 1;
    current.alreadyTracked ||= row.alreadyTracked;
    if (
      rankedKeywordTraffic(row.estimatedTraffic) >
      rankedKeywordTraffic(current.row.estimatedTraffic)
    ) {
      current.row = row;
    }
  }
  return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
}

export function rankedKeywordErrorCopy(reason: RankedKeywordError) {
  const messages: Record<RankedKeywordError, string> = {
    budget_exhausted: "Monthly rank-check budget reached.",
    needs_reauth: "DataForSEO authorization has expired.",
    no_domain: "Add a valid project domain before looking up ranked keywords.",
    no_source: "No eligible DataForSEO connection is available.",
    rate_limited: "Provider rate limit reached. Try again shortly.",
    unsupported_location: "Ranked-keyword lookup is not available for this location on DataForSEO.",
  };
  return messages[reason];
}
