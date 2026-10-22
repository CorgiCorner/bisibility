import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import type { MeasurementReport } from "@/lib/rank-measurements/types";
import { reportCalendarDayStart } from "@/lib/rank-reports/history-calendar";
import type { OverviewRange } from "./overview-filters";
import type { Keyword } from "./overview-trend";
import { summarizeVisibility, visibilitySnapshotFor } from "./visibility";

const rankedKeywordPreviewLimit = 5;

export type OverviewRankedKeyword = {
  device: string;
  keyword: string;
  market: string;
  position: number;
};
export type OverviewHistoryDay = {
  id: string;
  from: string;
  to: string;
  comparisonKey: string | null;
  averageRankedPosition: number | null;
  rankedKeywordCount: number;
  rankedKeywords: OverviewRankedKeyword[];
  report: MeasurementReport;
};
export type OverviewReportHistory = {
  asOf: string;
  timeZone: string | null;
  population: "frozen_selected_targets";
  weights: "frozen_at_report_watermark";
  reason: "time_zone_unavailable" | null;
  undatedChecks: number;
  days: OverviewHistoryDay[];
};

function localDate(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (name: string) => parts.find(({ type }) => type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Retrospective series of the exact selected target/weight snapshot, never today's settings rewritten into old SERPs. */
export function buildOverviewReportHistory(
  keywords: readonly Keyword[],
  volumes: ReadonlyMap<string, number | null>,
  options: { asOf: Date; range: OverviewRange; timeZone: string | null },
): OverviewReportHistory {
  const base: OverviewReportHistory = {
    asOf: options.asOf.toISOString(),
    timeZone: options.timeZone,
    population: "frozen_selected_targets",
    weights: "frozen_at_report_watermark",
    reason: null,
    days: [],
    undatedChecks: 0,
  };
  if (!options.timeZone) return { ...base, reason: "time_zone_unavailable" };
  const count = { "7d": 7, "28d": 28, "90d": 90 }[options.range];
  const today = Date.parse(`${localDate(options.asOf, options.timeZone)}T00:00:00Z`);
  const retained = keywords.map((keyword) => ({
    keyword,
    checks: keyword.rankChecks.map((check) => ({
      check,
      evidence: recordedMeasurement(check, keyword.publicId, keyword.projectId),
    })),
  }));
  base.undatedChecks = retained.reduce(
    (sum, { checks }) =>
      sum +
      checks.filter(
        ({ evidence }) => evidence.execution === "completed" && evidence.observedAt === null,
      ).length,
    0,
  );
  for (let offset = count - 1; offset >= 0; offset--) {
    const key = new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
    const from = reportCalendarDayStart(key, options.timeZone);
    const nextKey = new Date(today - (offset - 1) * 86_400_000).toISOString().slice(0, 10);
    const to =
      offset === 0
        ? options.asOf
        : new Date(reportCalendarDayStart(nextKey, options.timeZone).getTime() - 1);
    const snapshots = retained.map(({ keyword, checks }) =>
      visibilitySnapshotFor(
        {
          ...keyword,
          rankChecks: checks
            .filter(
              ({ evidence }) =>
                evidence.recordedAt <= to &&
                (evidence.execution === "completed"
                  ? evidence.observedAt !== null &&
                    evidence.observedAt >= from &&
                    evidence.observedAt <= to
                  : evidence.recordedAt >= from),
            )
            .map(({ check }) => check),
        },
        volumes.get(keyword.id) ?? null,
        {
          asOf: to,
          currentNotBefore: from,
          expectedScope: undefined,
          requireCurrentScope: false,
          // Historic freshness policy is not proven by the current head. Keep it explicitly unknown.
          freshForMs: null,
          baselineEnabled: false,
          requestedGeo: {},
        },
      ),
    );
    const report = summarizeVisibility(snapshots, {
      asOf: to,
      eligibleTotal: keywords.length,
      freshnessConfigured: false,
    }).report;
    const ranked = snapshots.flatMap(({ current }) =>
      current?.evidence === "positive" && current.position !== null ? [current.position] : [],
    );
    const rankedKeywords = snapshots
      .flatMap(({ current }, index) => {
        const source = retained[index]?.keyword;
        if (!source || current?.evidence !== "positive" || current.position === null) return [];
        return [
          {
            device: source.device,
            keyword: source.text,
            market: source.locationRef.displayName,
            position: current.position,
          },
        ];
      })
      .sort((left, right) => {
        const byPosition = left.position - right.position;
        if (byPosition !== 0) return byPosition;
        const byKeyword = left.keyword.localeCompare(right.keyword);
        if (byKeyword !== 0) return byKeyword;
        const byDevice = left.device.localeCompare(right.device);
        return byDevice === 0 ? left.market.localeCompare(right.market) : byDevice;
      });
    const keys = snapshots
      .filter(
        ({ current }) => current?.evidence === "positive" || current?.evidence === "known_absent",
      )
      .map(({ id, current }) => [id, current?.comparisonKey] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    base.days.push({
      id: key,
      from: from.toISOString(),
      to: to.toISOString(),
      report,
      averageRankedPosition: ranked.length
        ? ranked.reduce((sum, rank) => sum + rank, 0) / ranked.length
        : null,
      rankedKeywordCount: rankedKeywords.length,
      rankedKeywords: rankedKeywords.slice(0, rankedKeywordPreviewLimit),
      comparisonKey:
        keys.length && keys.every(([, value]) => value != null) ? JSON.stringify(keys) : null,
    });
  }
  return base;
}
