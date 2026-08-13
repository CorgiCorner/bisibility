import type {
  RankedKeywordSuggestion,
  RankedKeywordsOutcome,
  RankedKeywordsSuccess,
} from "@/lib/ranked-keywords/service";

type OnboardingRankedKeywordSuggestion = Pick<
  RankedKeywordSuggestion,
  "alreadyTracked" | "estimatedTraffic" | "keyword" | "position" | "searchVolume"
>;

export type RankedKeywordsPage = Omit<RankedKeywordsSuccess, "rows"> & {
  rows: OnboardingRankedKeywordSuggestion[];
};

export type FetchRankedKeywordSuggestionsAction = (input: {
  connectionId?: string;
  offset?: number;
  projectId: string;
}) => Promise<RankedKeywordsPage | { reason: RankedKeywordError }>;

export type RankedKeywordError =
  Exclude<RankedKeywordsOutcome, { ok: true }> extends { reason: infer T } ? T : never;
export type RankedKeywordGroup = {
  alreadyTracked: boolean;
  count: number;
  key: string;
  row: RankedKeywordsPage["rows"][number];
};

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

export function groupRankedKeywords(pages: RankedKeywordsPage[]): RankedKeywordGroup[] {
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
