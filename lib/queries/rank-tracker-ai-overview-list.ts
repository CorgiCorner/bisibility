import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { keywordViewDevices } from "@/lib/keywords/view-devices";
import { requireReadableProject } from "./_auth";
import { loadAiOverviewPageFacts } from "./rank-tracker-ai-overview-read";
import { groupRankTrackerReportRows } from "./rank-tracker-report-grouped";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywordsInTransaction } from "./rank-tracker-report-selection";

function pageKeywordIds(rows: readonly { id: string; subRows?: readonly { id: string }[] }[]) {
  return [
    ...new Set(
      rows.flatMap((row) => (row.subRows ? row.subRows.map((child) => child.id) : [row.id])),
    ),
  ];
}

function pageOf<T>(values: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.ceil(values.length / pageSize);
  const current = pageCount ? Math.min(page, pageCount) : 1;
  return {
    page: current,
    pageCount,
    visible: values.slice((current - 1) * pageSize, current * pageSize),
  };
}

/** Latest stored overview for the current page. No provider call and no off-page fragments. */
export async function loadRankTrackerAiOverviewList(
  projectRef: string,
  query: RankTrackerQueryState,
  options: RankTrackerReportOptions,
) {
  const readable = await requireReadableProject(projectRef);
  const metadataQuery = {
    ...query,
    reportScope: { ...rankTrackerScope(query), view: "general" as const, subject: null },
  };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const base = await selectRankTrackerReportKeywordsInTransaction(
      tx,
      { actor: readable.actor, transport: "session" },
      { projectRef, query: metadataQuery },
      options,
    );
    const groups = query.grouped
      ? groupRankTrackerReportRows(base.rows, base.resolutions, base.policy, query)
      : [];
    const visibleRows = query.grouped ? null : pageOf(base.rows, query.page, query.pageSize);
    const visibleGroups = query.grouped ? pageOf(groups, query.page, query.pageSize) : null;
    const visible = visibleGroups?.visible ?? visibleRows?.visible ?? [];
    const facts = await loadAiOverviewPageFacts(
      tx,
      base.project.id,
      base.project.domain,
      pageKeywordIds(visible),
      options.asOf,
    );
    const shared = {
      evaluation: base.evaluation,
      facets: base.facets,
      locations: base.locations,
      report: base.report,
      selectedKeywordIds: base.selectedKeywordIds,
      selectionDigest: base.selectionDigest,
      totalCount: base.totalCount,
      aiOverview: { facts },
      page: (visibleGroups ?? visibleRows)?.page ?? 1,
      pageCount: (visibleGroups ?? visibleRows)?.pageCount ?? 0,
      pageSize: query.pageSize,
      query,
      resolvedLens: query.lens,
      matchedTargetCount: base.selectedKeywordIds.length,
      matchedGroupCount: groups.length,
      viewDevices: keywordViewDevices(base.rows),
    };
    if (visibleGroups)
      return { ...shared, mode: "grouped-server" as const, groups: visibleGroups.visible };
    return { ...shared, mode: "flat-server" as const, rows: visibleRows?.visible ?? [] };
  }, REPORT_READ_TRANSACTION);
}
