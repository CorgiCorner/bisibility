import "server-only";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import { loadDashboardLocalContext } from "@/lib/dashboard-local/context";
import { readLocalReportInTransaction } from "@/lib/dashboard-local/read";
import { prisma } from "@/lib/db/prisma";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { localReportSummary } from "@/lib/local-reports/summary";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { requireReadableProject } from "./_auth";
import type { RankTrackerLocalPresentation } from "./rank-tracker-local-model";
import { filterRankTrackerLocalRows } from "./rank-tracker-local-projection";
import { rankTrackerLocalFilters } from "./rank-tracker-local-scope";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { selectRankTrackerReportKeywordsInTransaction } from "./rank-tracker-report-selection";

function localMode<T>(value: T, grouped: boolean) {
  return grouped
    ? { ...value, mode: "grouped-server" as const }
    : { ...value, mode: "flat-server" as const };
}

/** Explicit Local alone reads existing assignment/match evidence; never invokes a provider or schedule. */
export async function loadRankTrackerLocalList(
  projectRef: string,
  query: RankTrackerQueryState,
  options: RankTrackerReportOptions,
) {
  const readable = await requireReadableProject(projectRef),
    context = { actor: readable.actor };
  const selected = rankTrackerScope(query).subject;
  let local: RankTrackerLocalPresentation = {
    context: await loadDashboardLocalContext(
      projectRef,
      context,
      selected === null ? undefined : JSON.stringify(selected),
      null,
      options.asOf,
    ),
    summary: null,
    facts: [],
    unsupportedFilters: false,
  };
  const empty = async () =>
    localMode(
      {
        evaluation: "shared_kernel" as const,
        facets: { intents: [], positions: [], tags: [], topics: [] },
        locations: [],
        matchedTargetCount: 0,
        matchedGroupCount: 0,
        page: 1,
        pageCount: 0,
        pageSize: query.pageSize,
        resolvedLens: query.lens,
        rows: [],
        groups: [],
        totalCount: await prisma.keyword.count({
          where: { projectId: readable.project.id, archivedAt: null },
        }),
        query,
        local,
        report: undefined,
        selectionDigest: undefined,
      },
      query.grouped,
    );
  if (local.context.state !== "ready" || !local.context.selection) return empty();
  const selection = local.context.selection;
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const metadataQuery = {
          ...query,
          reportScope: { ...rankTrackerScope(query), view: "general" as const, subject: null },
          search: "",
          grouped: false,
          filters: {
            ...query.filters,
            position: [],
            change: "any" as const,
            wrongUrl: false,
            urlChanged: false,
            serp: [],
            lastCheck: "any" as const,
          },
        };
        const base = await selectRankTrackerReportKeywordsInTransaction(
          tx,
          { actor: readable.actor, transport: "session" },
          { projectRef, query: metadataQuery },
          options,
        );
        const report = await readLocalReportInTransaction(
          tx,
          projectRef,
          context,
          selection,
          rankTrackerLocalFilters(query),
          options,
        );
        const projection = filterRankTrackerLocalRows(
          base.rows,
          report,
          query,
          options.policyAt(options.asOf),
        );
        const values = query.grouped ? projection.groups : projection.rows;
        const pageCount = Math.ceil(values.length / query.pageSize),
          page = pageCount ? Math.min(query.page, pageCount) : 1;
        const visible = values.slice((page - 1) * query.pageSize, page * query.pageSize);
        const ids = new Set(
          visible.flatMap((row) =>
            "subRows" in row ? (row.subRows?.map((child) => child.id) ?? []) : [row.id],
          ),
        );
        local = {
          ...local,
          summary: localReportSummary(projection.filtered),
          unsupportedFilters: projection.unsupportedFilters,
          facts: projection.facts.filter((fact) => ids.has(fact.keywordId)),
        };
        return localMode(
          {
            ...base,
            report: undefined,
            facets: projection.facets,
            rows: projection.rows.slice((page - 1) * query.pageSize, page * query.pageSize),
            groups: projection.groups.slice((page - 1) * query.pageSize, page * query.pageSize),
            query,
            local,
            resolvedLens: query.lens,
            selectedKeywordIds: projection.rows.map((row) => row.id),
            selectionDigest: projection.filtered.selectionDigest,
            matchedTargetCount: projection.rows.length,
            matchedGroupCount: projection.groups.length,
            page,
            pageCount,
            pageSize: query.pageSize,
          },
          query.grouped,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (cause) {
    if (cause instanceof RankReportCapacityError)
      local = { ...local, context: { ...local.context, state: "capacity", selection: null } };
    else if (
      cause instanceof RankReportSnapshotConflictError ||
      cause instanceof BusinessLocationUnavailableError ||
      cause instanceof BusinessLocationConflictError
    )
      local = {
        ...local,
        context: { ...local.context, state: "unavailable", selection: null },
        summary: null,
        facts: [],
      };
    else throw cause;
    return empty();
  }
}
