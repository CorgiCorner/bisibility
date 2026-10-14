import { competitorShareOfVoice } from "@/lib/rank-measurements/competitor-share";
import { positivePosition } from "@/lib/rank-measurements/qualify";
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
  { id: "all" },
  { id: "top3" },
  { id: "top10" },
] as const satisfies readonly { id: CompetitorPositionBucket }[];

export const emptyCompetitorFilter: CompetitorFilter = {
  excludedKeywordIds: [],
  position: "all",
  tag: null,
};

// biome-ignore format: compact helper keeps this model module tidy.
export function competitorDomainInitials(domain: string) { return domain.split(/[.-]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join(""); }

function rankOf(observation: CompetitorObservation, domain: string) {
  return positivePosition(observation.ranks[domain]);
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
    shareOfVoice: total > 0 ? (score / total) * 100 : null,
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
  const {
    counts,
    scores,
    shares: _shares,
    total,
    ...quality
  } = competitorShareOfVoice(filteredObservations, domains);
  const allColumns = orderColumns(data.allColumns, scores, counts);
  const managedDomains = allColumns.slice(1).map((column) => column.domain);
  const hasCompletedChecks = data.observations.some((observation) => observation.completed);
  const hasRankData = observations.some((observation) => observation.ranked);
  const filterActive =
    filter.excludedKeywordIds.length > 0 || filter.position !== "all" || filter.tag !== null;
  const dataState = !hasCompletedChecks
    ? "no_completed_checks"
    : filterActive && observations.length === 0
      ? "filter_excludes_all"
      : quality.measured === 0 && filteredObservations.length > 0
        ? "quality_unknown"
        : hasRankData
          ? total > 0
            ? "ranked"
            : "no_volume_data"
          : "completed_unranked";
  return {
    ...data,
    quality,
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
