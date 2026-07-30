import type {
  CompetitorColumn,
  CompetitorFilter,
  CompetitorMarket,
  CompetitorMarketData,
  CompetitorObservation,
  CompetitorPositionBucket,
  CompetitorShare,
  HeadToHeadRow,
} from "./types";

export const competitorColors = [
  "var(--accent)",
  "var(--blue)",
  "var(--purple)",
  "var(--green)",
  "var(--yellow)",
];

export const competitorPositionBuckets = [
  { id: "all", label: "All keywords" },
  { id: "top3", label: "Top 3" },
  { id: "top10", label: "Top 10" },
] as const satisfies readonly { id: CompetitorPositionBucket; label: string }[];

export const emptyCompetitorFilter: CompetitorFilter = {
  excludedKeywordIds: [],
  position: "all",
  tag: null,
};

// biome-ignore format: compact helper keeps this model module tidy.
export function competitorDomainInitials(domain: string) { return domain.split(/[.-]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join(""); }

function visibilityScore(position: number) {
  return position <= 10 ? 11 - position : 0;
}

function rankOf(observation: CompetitorObservation, domain: string) {
  const rank = observation.ranks[domain];
  return typeof rank === "number" && rank > 0 ? rank : null;
}

function inPositionBucket(position: number | null, bucket: CompetitorPositionBucket) {
  if (bucket === "all") {
    return true;
  }
  if (!position || position <= 0) {
    return false;
  }
  return bucket === "top3" ? position <= 3 : position <= 10;
}

export function filterCompetitorObservations(data: CompetitorMarketData, filter: CompetitorFilter) {
  const ownDomain = data.allColumns[0]?.domain ?? "";
  const excludedKeywordIds = new Set(filter.excludedKeywordIds);
  return data.observations.filter(
    (observation) =>
      !excludedKeywordIds.has(observation.id) &&
      inPositionBucket(rankOf(observation, ownDomain), filter.position) &&
      (!filter.tag || observation.tags.includes(filter.tag)),
  );
}

function domainScores(observations: CompetitorObservation[], domains: string[]) {
  const counts = new Map<string, number>();
  const scores = new Map<string, number>();
  for (const observation of observations) {
    for (const domain of domains) {
      const rank = rankOf(observation, domain);
      if (!rank) continue;
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      scores.set(domain, (scores.get(domain) ?? 0) + visibilityScore(rank));
    }
  }
  return { counts, scores };
}

function orderColumns(
  allColumns: CompetitorColumn[],
  scores: Map<string, number>,
  counts: Map<string, number>,
) {
  const [own, ...managed] = allColumns;
  const ranked = [...managed].sort(
    (a, b) =>
      (scores.get(b.domain) ?? 0) - (scores.get(a.domain) ?? 0) ||
      (counts.get(b.domain) ?? 0) - (counts.get(a.domain) ?? 0) ||
      a.label.localeCompare(b.label),
  );
  return own ? [own, ...ranked] : ranked;
}

function buildShare(
  column: CompetitorColumn,
  index: number,
  total: number,
  counts: Map<string, number>,
  scores: Map<string, number>,
): CompetitorShare {
  const score = scores.get(column.domain) ?? 0;
  return {
    color: competitorColors[index % competitorColors.length],
    domain: column.domain,
    id: column.id,
    initials: competitorDomainInitials(column.domain),
    kind: column.kind,
    label: column.label,
    shareOfVoice: total > 0 ? Math.round((score / total) * 100) : 0,
    sharedKeywords: counts.get(column.domain) ?? 0,
  };
}

function buildRows(
  observations: CompetitorObservation[],
  columns: CompetitorColumn[],
): HeadToHeadRow[] {
  return observations.map((observation) => {
    const ownRank = rankOf(observation, columns[0]?.domain ?? "");
    const bestCompetitor = columns
      .slice(1)
      .map((column) => rankOf(observation, column.domain))
      .filter((rank): rank is number => rank !== null)
      .sort((a, b) => a - b)[0];
    return {
      gap: ownRank && bestCompetitor ? bestCompetitor - ownRank : null,
      id: observation.id,
      keyword: observation.keyword,
      ranks: Object.fromEntries(
        columns.map((column) => [column.domain, rankOf(observation, column.domain)]),
      ),
    } satisfies HeadToHeadRow;
  });
}

// Pure projection of raw market data through a filter. Shared by the server query (for the
// default unfiltered view) and the client workspace (for live position-bucket + tag filtering).
export function buildCompetitorMarket(
  data: CompetitorMarketData,
  filter: CompetitorFilter,
): CompetitorMarket {
  const filteredObservations = filterCompetitorObservations(data, filter);
  const observations = filteredObservations.filter((observation) => observation.completed);
  const domains = data.allColumns.map((column) => column.domain);
  const { counts, scores } = domainScores(observations, domains);
  const allColumns = orderColumns(data.allColumns, scores, counts);
  const total = domains.reduce((sum, domain) => sum + (scores.get(domain) ?? 0), 0);
  const managedDomains = allColumns.slice(1).map((column) => column.domain);
  const hasCompletedChecks = data.observations.some((observation) => observation.completed);
  const hasRankData = observations.some((observation) => observation.ranked);
  const filterActive =
    filter.excludedKeywordIds.length > 0 || filter.position !== "all" || filter.tag !== null;
  const dataState = !hasCompletedChecks
    ? "no_completed_checks"
    : filterActive && observations.length === 0
      ? "filter_excludes_all"
      : hasRankData
        ? "ranked"
        : "completed_unranked";
  return {
    ...data,
    allColumns,
    checkedKeywordCount: observations.length,
    columns: allColumns,
    dataState,
    hasRankData,
    rows: buildRows(observations, allColumns),
    shares: allColumns.map((column, index) => buildShare(column, index, total, counts, scores)),
    sharedKeywordCount: observations.filter((observation) =>
      managedDomains.some((domain) => rankOf(observation, domain) !== null),
    ).length,
  };
}
