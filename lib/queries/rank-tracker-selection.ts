import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  assertKeywordExportMembershipLimit,
  keywordExportMembershipProbeLimit,
} from "@/lib/keywords/keyword-export-limit";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { z } from "zod";
import { requireReadableProject } from "./_auth";
import { loadKeywordRowsByInternalIds } from "./keyword-row-loader";
import type { KeywordRow } from "./keyword-row-types";
import { exactRankTrackerRows, filterExactRankTrackerRows } from "./rank-tracker-list-exact";
import { buildRankTrackerListSql } from "./rank-tracker-list-sql";

type AuthorizedProject = { domain: string | null; id: string };
const facetValue = z.object({ count: z.coerce.number().int().nonnegative(), label: z.string() });
const rawSelectionSchema = z.object({
  facets: z.object({
    intents: z.array(facetValue),
    positions: z.array(facetValue.extend({ id: z.enum(["top3", "top10", "11-50", "51-100"]) })),
    tags: z.array(facetValue),
    topics: z.array(facetValue),
  }),
  keywordIds: z.array(z.string()),
  locations: z.array(
    z.object({
      count: z.coerce.number().int().nonnegative(),
      displayName: z.string(),
      id: z.string(),
      kind: z.enum(["country", "region", "city"]),
    }),
  ),
  matchedTargetCount: z.coerce.number().int().nonnegative(),
  nextCandidateCursor: z
    .object({ createdAt: z.coerce.date(), id: z.string() })
    .nullable()
    .optional(),
  totalCount: z.coerce.number().int().nonnegative(),
});
const exactSortFields = new Set(["volume", "difficulty", "clicks", "impressions", "ctr"]);
function requiresExactRows(query: RankTrackerQueryState) {
  return Boolean(
    query.filters.change !== "any" ||
      query.filters.urlChanged ||
      query.filters.wrongUrl ||
      query.filters.serp.length ||
      query.search ||
      query.filters.volMin > 0 ||
      query.filters.volMax < 50 ||
      exactSortFields.has(query.sort.field) ||
      query.sort.field === "change" ||
      query.sort.field === "sparkline",
  );
}
async function rawSelection(
  projectId: string,
  query: RankTrackerQueryState,
  options: Parameters<typeof buildRankTrackerListSql>[2],
) {
  const rows = await prisma.$queryRaw<unknown[]>(
    buildRankTrackerListSql(projectId, query, options),
  );
  return rawSelectionSchema.parse(rows[0]);
}
function resolvedQuery(query: RankTrackerQueryState, raw: z.infer<typeof rawSelectionSchema>) {
  const known = query.lens.locationId
    ? raw.locations.some((location) => location.id === query.lens.locationId)
    : true;
  return known ? query : { ...query, lens: { ...query.lens, locationId: null } };
}

export async function selectRankTrackerKeywords(projectRef: string, query: RankTrackerQueryState) {
  if (query.grouped) throw new Error("Rank tracker list query supports flat mode only.");
  const { project } = await requireReadableProject(projectRef);
  const exact = requiresExactRows(query);
  const raw = await rawSelection(project.id, query, { candidatesOnly: exact });
  const effectiveQuery = resolvedQuery(query, raw);
  const exactRows = exact
    ? exactRankTrackerRows(
        await loadKeywordRowsByInternalIds(project, raw.keywordIds),
        effectiveQuery,
      )
    : null;
  return { exactRows, project, raw, resolvedQuery: effectiveQuery };
}

async function exactExportIds(project: AuthorizedProject, query: RankTrackerQueryState) {
  const chunkSize = 250;
  const matches: KeywordRow[] = [];
  const seenCandidateIds = new Set<string>();
  let candidateCursor: { createdAt: Date; id: string } | undefined;
  for (;;) {
    const raw = await rawSelection(project.id, query, {
      candidateCursor,
      candidateScan: true,
      candidatesOnly: true,
      selectionLimit: chunkSize,
    });
    const candidateIds = raw.keywordIds.filter((id) => {
      if (seenCandidateIds.has(id)) return false;
      seenCandidateIds.add(id);
      return true;
    });
    const rows = await loadKeywordRowsByInternalIds(project, candidateIds);
    for (const row of filterExactRankTrackerRows(rows, query)) {
      matches.push(row);
      assertKeywordExportMembershipLimit(matches.length);
    }
    if (raw.keywordIds.length < chunkSize || !raw.nextCandidateCursor) break;
    candidateCursor = raw.nextCandidateCursor;
  }
  return exactRankTrackerRows(matches, query).map((row) => row.id);
}

export async function resolveAuthorizedRankTrackerExportKeywordIds(
  project: AuthorizedProject,
  query: RankTrackerQueryState,
) {
  if (query.grouped) throw new Error("Rank tracker list query supports flat mode only.");
  if (requiresExactRows(query)) return exactExportIds(project, query);
  const raw = await rawSelection(project.id, query, {
    publicIds: true,
    selectionLimit: keywordExportMembershipProbeLimit(),
  });
  assertKeywordExportMembershipLimit(raw.keywordIds.length);
  return raw.keywordIds;
}

export async function resolveRankTrackerExportKeywordIds(
  projectRef: string,
  query: RankTrackerQueryState,
) {
  const { project } = await requireReadableProject(projectRef);
  return resolveAuthorizedRankTrackerExportKeywordIds(project, query);
}
