import "server-only";
import type { RankReportContext } from "@/lib/rank-reports/access";
import { capturedBaselineWindow } from "@/lib/rank-reports/baseline-window";
import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { loadCapturedRankTrackerMetrics } from "./rank-tracker-captured-metrics";
import {
  type RankTrackerDefinitionLoader,
  RankTrackerReportConfigurationError,
  type RankTrackerReportMetadata,
  type RankTrackerReportOptions,
} from "./rank-tracker-report-model";

/** Shared metadata assembly; the caller supplies its real session/credential authority. */
export function createRankTrackerHostReportOptions(
  context: RankReportContext | undefined,
  loadDefinitions: RankTrackerDefinitionLoader,
  asOf = new Date(),
  comparisonDays = 7,
): RankTrackerReportOptions {
  return {
    asOf: new Date(asOf.getTime()),
    ...(context ? { context } : {}),
    limits: { ...RANK_REPORT_HOST_LIMITS },
    policyAt: (at) => hostOrganicReportPolicy(at, comparisonDays),
    loadMetadata: async (tx, project, targets, at) => {
      const policy = hostOrganicReportPolicy(at, comparisonDays);
      const before = policy.baseline.mode === "before" ? policy.baseline.before : null;
      const dates = before ? [at, before] : [at];
      const definitions = [];
      if (loadDefinitions.atDates)
        definitions.push(...(await loadDefinitions.atDates(tx, project, targets, dates)));
      else
        for (const date of dates)
          definitions.push(await loadDefinitions(tx, project, targets, date));
      if (definitions.length !== dates.length)
        throw new RankTrackerReportConfigurationError(
          "Definition loader returned a mismatched snapshot.",
        );
      const [current, baseline = new Map<string, RankTrackerReportMetadata>()] = definitions;
      const metadata = new Map<string, RankTrackerReportMetadata>(
        [...current].map(([id, value]) => [
          id,
          {
            ...value,
            volume: null,
            baselineWindow: capturedBaselineWindow(before, baseline.get(id)?.freshForMs),
          },
        ]),
      );
      const metrics = await loadCapturedRankTrackerMetrics(tx, project.id, targets, metadata, at);
      return new Map(
        [...metadata].map(
          ([id, value]) =>
            [
              id,
              {
                ...value,
                volume: metrics.get(id)?.volume ?? null,
                ...(metrics.has(id) ? { metrics: metrics.get(id) } : {}),
              },
            ] as const,
        ),
      );
    },
  };
}
