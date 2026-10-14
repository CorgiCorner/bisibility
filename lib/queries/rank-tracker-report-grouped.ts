import {
  groupRow,
  type MarketGridAggregate,
  marketGridTerm,
} from "@/lib/keywords/market-grid-model";
import { fixedTargetOrder } from "@/lib/keywords/market-grid-sorting";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { RankReportPolicy, ResolvedReportTarget } from "@/lib/rank-reports/model";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import type { RankTrackerQualityRow } from "./rank-tracker-report-model";
import { compareRankTrackerQualityValue } from "./rank-tracker-report-sort";

export function groupRankTrackerReportRows(
  rows: readonly RankTrackerQualityRow[],
  resolutions: readonly ResolvedReportTarget[],
  policy: RankReportPolicy,
  query: RankTrackerQueryState,
) {
  const terms = new Map<string, RankTrackerQualityRow[]>();
  const resolvedById = new Map(resolutions.map((target) => [target.id, target]));
  for (const row of rows) {
    const key = marketGridTerm(row.keyword);
    const children = terms.get(key) ?? [];
    children.push(row);
    terms.set(key, children);
  }
  const groups = [...terms].map(([term, members]) => {
    const children = [...members].sort(fixedTargetOrder);
    const selectedResolutions = children.map(({ id }) => {
      const target = resolvedById.get(id);
      if (!target) throw new Error("Grouped target is missing its authorized resolution");
      return target;
    });
    // No historical term membership is persisted; group composition must remain unknown.
    const rankGroupReport = summarizeRankReport(selectedResolutions, {
      ...policy,
      baselineExpectedIds: undefined,
      baselineProjectId: undefined,
    });
    const positives = children.flatMap((row) =>
      row.rankQuality.current?.evidence === "positive" && row.rankQuality.current.position !== null
        ? [row.rankQuality.current.position]
        : [],
    );
    const markets = new Map<string, RankTrackerQualityRow>();
    for (const row of children)
      if (!markets.has(row.location.canonicalKey)) markets.set(row.location.canonicalKey, row);
    const pairs = [...markets.values()];
    const knownVolumes = new Map<string, RankTrackerQualityRow>();
    for (const row of children)
      if (row.volumeKnown !== false && !knownVolumes.has(row.location.canonicalKey))
        knownVolumes.set(row.location.canonicalKey, row);
    const volumes = [...knownVolumes.values()];
    const dates = children
      .flatMap((row) =>
        row.rankQuality.latestAttempt?.recordedAt ? [row.rankQuality.latestAttempt.recordedAt] : [],
      )
      .sort();
    const first = children[0];
    if (!first) throw new Error("Empty rank tracker report group");
    const aggregate: MarketGridAggregate = {
      activeTargetCount: children.length,
      change: children.length === 1 ? first.rankQuality.movement : null,
      children,
      difficulty:
        pairs.length > 1 ? "mixed" : first.difficultyKnown === false ? null : first.difficulty,
      hasPartiallyUnsupportedVolume: volumes.length > 0 && volumes.length < pairs.length,
      keyword:
        [...children.map((row) => row.keyword)].sort((a, b) => a.localeCompare(b, "en-US"))[0] ??
        term,
      lastChecked: dates.at(-1) ?? null,
      position: positives.reduce<number | null>(
        (best, position) => (best === null ? position : Math.min(best, position)),
        null,
      ),
      rankingUrls: [
        ...new Set(
          children.flatMap((row) =>
            row.rankQuality.current?.evidence === "positive" && row.rankingUrl
              ? [row.rankingUrl]
              : [],
          ),
        ),
      ],
      sparkline: [],
      stale: rankGroupReport.metric.freshness === "stale",
      tags: [...new Set(children.flatMap((row) => row.tags))].sort(),
      volume: volumes.length ? volumes.reduce((sum, row) => sum + row.volume, 0) : null,
    };
    const row = groupRow(aggregate, children);
    return {
      ...row,
      clicks: children.length === 1 ? first.clicks : null,
      ctr: children.length === 1 ? first.ctr : null,
      impressions: children.length === 1 ? first.impressions : null,
      bestPosition: null,
      completedComparableChecks: [],
      positionHistory: [],
      positionObservations: [],
      rankingUrlHistory: [],
      lastCheckErrorCode: children.length === 1 ? first.lastCheckErrorCode : null,
      rankGroupReport,
      rankQuality: null,
      scopeTerm: term,
    };
  });
  const value = (group: (typeof groups)[number]): string | number | null => {
    const a = group.marketGrid?.kind === "parent" ? group.marketGrid.aggregate : null;
    if (!a) return null;
    const field = query.sort.field;
    if (field === "position" || field === "sparkline") return a.position;
    if (field === "change") return a.change;
    if (field === "volume") return a.volume;
    if (field === "difficulty") return typeof a.difficulty === "number" ? a.difficulty : null;
    if (field === "lastChecked") return a.lastChecked;
    if (field === "clicks") return group.clicks;
    if (field === "impressions") return group.impressions;
    if (field === "ctr") return group.ctr;
    if (field === "frequency") return group.schedule.frequency;
    if (field === "location") return group.location.displayName;
    if (field === "targetRanking") return group.rankingUrl;
    if (field === "tags") return group.tags.join(" ");
    if (field === "topic") return group.topic;
    if (field === "intent") return group.intent;
    if (field === "device") return group.device;
    return a.keyword;
  };
  return groups.sort(
    (a, b) =>
      compareRankTrackerQualityValue(value(a), value(b), query.sort.direction) ||
      a.id.localeCompare(b.id, "en-US"),
  );
}
