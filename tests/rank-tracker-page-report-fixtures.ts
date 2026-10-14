import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { groupRankTrackerReportRows } from "@/lib/queries/rank-tracker-report-grouped";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import { reportCheck, reportPolicy, reportTarget } from "@/lib/rank-reports/report-test-fixture";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import { pageFlatList } from "./rank-tracker-page-fixtures";

/** Explicit synthetic unit port; production host policy and authorized metadata reads are not exercised here. */
export function pageReportOptions(actorId: string): RankTrackerReportOptions {
  return {
    asOf: reportPolicy().asOf,
    context: { actor: { id: actorId }, transport: "session" },
    limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
    loadMetadata: async () => new Map(),
    policyAt: (asOf) => ({ ...reportPolicy(), asOf }),
  };
}

/** Quality and full summary come from the current shared kernel, never handwritten scores or movement. */
export function pageKernelSelection(query: RankTrackerQueryState, visibleRows = 1) {
  const first = rankTrackerQualityFixture();
  const target = {
    ...reportTarget(),
    id: "kw_abcdefghijklmnopqrstuvwy",
    expectedScope: null,
    checks: [reportCheck(2, { id: "check_abcdefghijklmnopqrstuvwy" })],
  };
  const second = rankTrackerQualityFixture(target);
  if (!first.resolution || !second.resolution)
    throw new Error("Kernel fixture requires both resolutions");
  const rows = [first.row, { ...second.row, keyword: "Retained target" }];
  const resolutions = [first.resolution, second.resolution];
  const summary = summarizeRankReport(resolutions, reportPolicy());
  const groups = groupRankTrackerReportRows(rows, resolutions, reportPolicy(), {
    ...query,
    grouped: true,
  });
  const shared = {
    ...pageFlatList(query),
    evaluation: "shared_kernel" as const,
    matchedTargetCount: rows.length,
    totalCount: rows.length,
    report: summary,
    selectedKeywordIds: rows.map(({ id }) => id),
    selectionDigest: summary.selectionDigest,
  };
  return {
    rows,
    groups,
    summary,
    flat: { ...shared, rows: rows.slice(0, visibleRows) },
    grouped: { ...shared, groups: groups.slice(0, visibleRows), matchedGroupCount: groups.length },
  };
}
