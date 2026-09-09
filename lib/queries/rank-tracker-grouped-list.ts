import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  aggregateMarketGridRows,
  groupRow,
  type MarketGridGroupRow,
  type MarketGridTarget,
} from "@/lib/keywords/market-grid-model";
import type {
  RankTrackerGroupedListResult,
  RankTrackerListQueryInput,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import { requireReadableProject } from "./_auth";
import { loadKeywordRowsByInternalIds } from "./keyword-row-loader";
import { exactRankTrackerGroupedRows } from "./rank-tracker-grouped-exact";
import {
  type RankTrackerGroupedRawSelection,
  rankTrackerGroupedRawSelectionSchema,
} from "./rank-tracker-grouped-schema";
import { GROUPED_SQL_SORT_FIELDS } from "./rank-tracker-grouped-sort";
import { buildRankTrackerGroupedSql } from "./rank-tracker-grouped-sql";
import { requiresExactRows } from "./rank-tracker-selection-core";

type Project = { domain: string | null; id: string };

function resolvedQuery(query: RankTrackerQueryState, raw: RankTrackerGroupedRawSelection) {
  const known = query.lens.locationId
    ? raw.locations.some((location) => location.id === query.lens.locationId)
    : true;
  return known ? query : { ...query, lens: { ...query.lens, locationId: null } };
}

async function groupedRaw(
  projectId: string,
  query: RankTrackerQueryState,
  candidatesOnly: boolean,
) {
  const rows = await prisma.$queryRaw<unknown[]>(
    buildRankTrackerGroupedSql(projectId, query, { candidatesOnly }),
  );
  return rankTrackerGroupedRawSelectionSchema.parse(rows[0]);
}

async function hydrateMembers(project: Project, raw: RankTrackerGroupedRawSelection) {
  const members = raw.groups.flatMap((group) => group.members);
  const rows = await loadKeywordRowsByInternalIds(
    project,
    members.map((member) => member.id),
  );
  const byPublicId = new Map(rows.map((row) => [row.id, row]));
  return members.flatMap((member) => {
    const row = byPublicId.get(member.publicId);
    return row ? [{ ...row, marketStatus: member.marketStatus } satisfies MarketGridTarget] : [];
  });
}

function sqlGroupedRows(raw: RankTrackerGroupedRawSelection, rows: readonly MarketGridTarget[]) {
  const byPublicId = new Map(rows.map((row) => [row.id, row]));
  const groups: MarketGridGroupRow[] = [];
  for (const selected of raw.groups) {
    const members = selected.members.flatMap((member) => {
      const row = byPublicId.get(member.publicId);
      return row ? [row] : [];
    });
    for (const aggregate of aggregateMarketGridRows(members)) {
      groups.push(groupRow(aggregate, aggregate.children));
    }
  }
  return groups;
}

export async function getRankTrackerGroupedList(
  input: RankTrackerListQueryInput,
): Promise<RankTrackerGroupedListResult> {
  const { project } = await requireReadableProject(input.projectRef);
  const exact =
    requiresExactRows(input.query) || !GROUPED_SQL_SORT_FIELDS.has(input.query.sort.field);
  const raw = await groupedRaw(project.id, input.query, exact);
  const query = resolvedQuery(input.query, raw);
  const rows = await hydrateMembers(project, raw);
  const result = exact
    ? exactRankTrackerGroupedRows(rows, query)
    : {
        groups: sqlGroupedRows(raw, rows),
        matchedGroupCount: raw.matchedGroupCount,
        matchedTargetCount: raw.matchedTargetCount,
      };
  const pageCount = Math.ceil(result.matchedGroupCount / query.pageSize);
  return {
    facets: raw.facets,
    groups: exact
      ? result.groups.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      : result.groups,
    locations: raw.locations,
    matchedGroupCount: result.matchedGroupCount,
    matchedTargetCount: result.matchedTargetCount,
    page: pageCount === 0 ? 1 : Math.min(input.query.page, pageCount),
    pageCount,
    pageSize: query.pageSize,
    resolvedLens: query.lens,
    totalCount: raw.totalCount,
  };
}
