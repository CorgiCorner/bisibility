export const pageStatusKinds = ["gone", "in_snapshot", "new", "redirected", "removed"] as const;

export type PageStatusKind = (typeof pageStatusKinds)[number];

export const pageStatusFilters = ["in_snapshot", "new", "removed"] as const;

export type PageStatusFilter = (typeof pageStatusFilters)[number];

const DAY_MS = 86_400_000;

export type PageStatusFacts = {
  /** Sitemap first seen when that source exists, otherwise the registry first seen. */
  firstSeenAt: Date;
  inSnapshot: boolean;
  newestSitemapSeenAt: Date | null;
  presenceCoverageState: string | null;
  presencePageFetchState: string | null;
  sitemapLastSeenAt: Date | null;
  snapshotTakenOn: Date;
};

export type PageStatus = {
  day: number | null;
  kind: PageStatusKind;
};

export function utcDayNumber(value: Date) {
  return Math.floor(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / DAY_MS,
  );
}

/** Days from the snapshot date to the event, counting the snapshot date as day 1. */
export function snapshotDayNumber(takenOn: Date, eventAt: Date) {
  return utcDayNumber(eventAt) - utcDayNumber(takenOn) + 1;
}

function includes(value: string | null, needle: string) {
  return (value ?? "").toLowerCase().includes(needle);
}

/** Redirect or not-found already stored on a URL inspection. No HTTP request. */
export function presenceDeparture(
  pageFetchState: string | null,
  coverageState: string | null,
): "gone" | "redirected" | null {
  if (includes(pageFetchState, "redirect") || includes(coverageState, "redirect")) {
    return "redirected";
  }
  if (
    includes(pageFetchState, "not_found") ||
    includes(pageFetchState, "soft_404") ||
    includes(coverageState, "not found") ||
    includes(coverageState, "404")
  ) {
    return "gone";
  }
  return null;
}

/**
 * Status against the active snapshot.
 * Removed wins when the sitemap last-seen day is older than the project's newest sitemap day.
 * New is a first-seen day after the snapshot. In snapshot is membership that is still seen.
 */
export function pageMembershipStatus(facts: PageStatusFacts): PageStatus | null {
  const appearedAfter = utcDayNumber(facts.firstSeenAt) > utcDayNumber(facts.snapshotTakenOn);
  const inScope = facts.inSnapshot || appearedAfter;
  const newest = facts.newestSitemapSeenAt ? utcDayNumber(facts.newestSitemapSeenAt) : null;
  const last = facts.sitemapLastSeenAt ? utcDayNumber(facts.sitemapLastSeenAt) : null;
  const left = inScope && newest != null && last != null && last < newest;
  if (left && facts.sitemapLastSeenAt) {
    return {
      day: snapshotDayNumber(facts.snapshotTakenOn, facts.sitemapLastSeenAt),
      kind:
        presenceDeparture(facts.presencePageFetchState, facts.presenceCoverageState) ?? "removed",
    };
  }
  if (facts.inSnapshot) return { day: null, kind: "in_snapshot" };
  if (appearedAfter) {
    return { day: snapshotDayNumber(facts.snapshotTakenOn, facts.firstSeenAt), kind: "new" };
  }
  return null;
}

export function statusMatchesFilter(kind: PageStatusKind | null, filter: PageStatusFilter) {
  if (kind == null) return false;
  if (filter === "removed") return kind === "removed" || kind === "redirected" || kind === "gone";
  return kind === filter;
}
