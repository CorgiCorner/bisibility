import "server-only";

import type {
  RankTrackerGroupedListResult,
  RankTrackerListQueryInput,
} from "@/lib/keywords/rank-tracker-query-types";
import { keywordViewDevices } from "@/lib/keywords/view-devices";
import { getQueryActor } from "./_auth";
import { groupRankTrackerReportRows } from "./rank-tracker-report-grouped";
import {
  RankTrackerReportConfigurationError,
  type RankTrackerReportOptions,
} from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywords } from "./rank-tracker-selection-core";

export async function getRankTrackerGroupedList(
  input: RankTrackerListQueryInput,
  options: RankTrackerReportOptions,
): Promise<RankTrackerGroupedListResult> {
  if (!input.query.grouped)
    throw new Error("Rank tracker grouped query supports grouped mode only.");
  if (!options) throw new RankTrackerReportConfigurationError();
  const context = options.context ?? {
    actor: await getQueryActor(),
    transport: "session" as const,
  };
  const selected = await selectRankTrackerReportKeywords(context, input, options);
  const groups = groupRankTrackerReportRows(
    selected.rows,
    selected.resolutions,
    selected.policy,
    selected.query,
  );
  const pageCount = Math.ceil(groups.length / selected.query.pageSize);
  const page = pageCount === 0 ? 1 : Math.min(selected.query.page, pageCount);
  return {
    evaluation: selected.evaluation,
    viewDevices: keywordViewDevices(selected.rows),
    facets: selected.facets,
    groups: groups.slice((page - 1) * selected.query.pageSize, page * selected.query.pageSize),
    locations: selected.locations,
    matchedGroupCount: groups.length,
    matchedTargetCount: selected.selectedKeywordIds.length,
    page,
    pageCount,
    pageSize: selected.query.pageSize,
    report: selected.report,
    resolvedLens: selected.query.lens,
    selectedKeywordIds: selected.selectedKeywordIds,
    selectionDigest: selected.selectionDigest,
    totalCount: selected.totalCount,
  };
}
