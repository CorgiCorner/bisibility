import "server-only";

import type {
  RankTrackerListQueryInput,
  RankTrackerListResult,
} from "@/lib/keywords/rank-tracker-query-types";
import { keywordViewDevices } from "@/lib/keywords/view-devices";
import { getQueryActor } from "./_auth";
import {
  RankTrackerReportConfigurationError,
  type RankTrackerReportOptions,
} from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywords } from "./rank-tracker-selection-core";

export async function getRankTrackerKeywordList(
  input: RankTrackerListQueryInput,
  options: RankTrackerReportOptions,
): Promise<RankTrackerListResult> {
  if (input.query.grouped) throw new Error("Rank tracker list query supports flat mode only.");
  if (!options) throw new RankTrackerReportConfigurationError();
  const context = options.context ?? {
    actor: await getQueryActor(),
    transport: "session" as const,
  };
  const selected = await selectRankTrackerReportKeywords(context, input, options);
  const pageCount = Math.ceil(selected.rows.length / selected.query.pageSize);
  const page = pageCount === 0 ? 1 : Math.min(selected.query.page, pageCount);
  return {
    evaluation: selected.evaluation,
    viewDevices: keywordViewDevices(selected.rows),
    facets: selected.facets,
    locations: selected.locations,
    matchedTargetCount: selected.selectedKeywordIds.length,
    page,
    pageCount,
    pageSize: selected.query.pageSize,
    report: selected.report,
    resolvedLens: selected.query.lens,
    rows: selected.rows.slice((page - 1) * selected.query.pageSize, page * selected.query.pageSize),
    selectedKeywordIds: selected.selectedKeywordIds,
    selectionDigest: selected.selectionDigest,
    totalCount: selected.totalCount,
  };
}
