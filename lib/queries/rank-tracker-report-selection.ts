import { createKeywordMembershipProjector } from "@/lib/keywords/schedule-membership";
import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RankTrackerListQueryInput } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import {
  authorizeRankReportScope,
  type RankReportContext,
  snapshotRankReportContext,
} from "@/lib/rank-reports/access";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import { rankReportRequestSchema } from "@/lib/rank-reports/model";
import { snapshotRankReportPolicy } from "@/lib/rank-reports/policy";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { mapKeyword } from "./keyword-row";
import { loadRankTrackerMetadataBatches } from "./rank-tracker-metadata-batches";
import { loadRankTrackerReportCandidates } from "./rank-tracker-report-database";
import { rankTrackerReportFacets, rankTrackerReportLocations } from "./rank-tracker-report-facets";
import { rankTrackerQualityRowMatches } from "./rank-tracker-report-filter";
import {
  RankTrackerReportConfigurationError,
  type RankTrackerReportOptions,
} from "./rank-tracker-report-model";
import { validateRankTrackerReportPolicy } from "./rank-tracker-report-policy";
import { projectRankTrackerQuality } from "./rank-tracker-report-projection";
import { validateRankTrackerReportQuery } from "./rank-tracker-report-query";
import { resolveCurrentRankTrackerTargets } from "./rank-tracker-report-resolve";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";

function prepareRankTrackerReportSelection(
  context: RankReportContext,
  input: RankTrackerListQueryInput,
  options: RankTrackerReportOptions,
) {
  if (!options) throw new RankTrackerReportConfigurationError();
  const query = validateRankTrackerReportQuery(input.query);
  if (rankTrackerScope(query).view !== "general") throw new RankTrackerReportConfigurationError();
  const actor = snapshotRankReportContext(context);
  const asOf = new Date(options.asOf.getTime());
  const limits = {
    maxChecks: options.limits.maxChecks,
    maxItems: options.limits.maxItems,
    maxTargets: options.limits.maxTargets,
  };
  const pausedSchedules = options.pausedSchedules ?? "include_retained";
  const loadMetadata = options.loadMetadata;
  const policy = snapshotRankReportPolicy(options.policyAt(new Date(asOf.getTime())));
  validateRankTrackerReportPolicy(policy, asOf, limits, input.projectRef);
  const reportScope = rankTrackerScope(query);
  if (
    (reportScope.asOf !== null && reportScope.asOf !== asOf.toISOString()) ||
    (input.query.reportScope !== undefined &&
      (policy.baseline.mode !== "before" ||
        asOf.getTime() - policy.baseline.before.getTime() !==
          reportScope.comparisonDays * 86_400_000))
  )
    throw new RankTrackerReportConfigurationError();
  if (pausedSchedules !== "include_retained" && pausedSchedules !== "exclude")
    throw new RankTrackerReportConfigurationError();
  const request = rankReportRequestSchema.parse({
    pageLimit: 1,
    projectId: input.projectRef,
    selectedIds: [],
    stream: "observations",
    window: { basis: "recorded_at", from: new Date(0).toISOString(), to: asOf.toISOString() },
  });
  return { query, actor, asOf, limits, pausedSchedules, loadMetadata, policy, request };
}
async function readRankTrackerReportSelection(
  tx: Prisma.TransactionClient,
  plan: ReturnType<typeof prepareRankTrackerReportSelection>,
) {
  const { query, actor, asOf, limits, pausedSchedules, loadMetadata, policy, request } = plan;
  const authorized = await authorizeRankReportScope(tx, actor, request, asOf);
  const project = await tx.project.findUniqueOrThrow({
    select: { domain: true, id: true, publicId: true },
    where: { id: authorized.project.id },
  });
  const candidates = await loadRankTrackerReportCandidates(
    tx,
    project.id,
    limits,
    pausedSchedules,
    asOf,
  );
  const fullRequest = rankReportRequestSchema.parse({
    ...request,
    selectedIds: candidates.rows.map(({ publicId }) => publicId),
  });
  const scope = await authorizeRankReportScope(tx, actor, fullRequest, asOf);
  const metadataProject = { id: project.id, publicId: project.publicId };
  const metadataTargets = scope.keywords.map(({ id, publicId }) => ({ id, publicId }));
  const metadata = await loadRankTrackerMetadataBatches(
    loadMetadata,
    tx,
    metadataProject,
    metadataTargets,
    asOf,
  );
  const targets = await loadRetainedRankReportTargets(tx, scope, policy, limits, metadata, false);
  const resolutions = resolveCurrentRankTrackerTargets(targets, policy, project.id);
  const resolved = new Map(resolutions.map((target) => [target.id, target]));
  const projectSchedule = createKeywordMembershipProjector(asOf);
  const rows = candidates.rows.map((candidate) => {
    const value = metadata.get(candidate.publicId);
    const metrics = value?.metrics ?? {
      cpc: null,
      difficulty: null,
      serpFeatures: [],
      volume: value?.volume ?? null,
    };
    const row = mapKeyword(
      { ...candidate, rankChecks: [] },
      { defaults: candidates.defaults, domain: trackedProjectDomain(project.domain) ?? "" },
      metrics,
      value?.traffic,
      projectSchedule,
    );
    const resolution = resolved.get(candidate.publicId);
    if (!resolution) throw new Error("Authorized rank tracker target is missing its resolution.");
    return projectRankTrackerQuality(row, resolution, policy, project.id);
  });
  const locations = rankTrackerReportLocations(rows, candidates.registeredLocations);
  // An unavailable market stays empty; it never widens to every market.
  const lensRows = rows.filter(
    (row) =>
      (query.lens.device === "all" || row.device.toLowerCase() === query.lens.device) &&
      (!query.lens.locationId || row.location.canonicalKey === query.lens.locationId),
  );
  const matchedRows = sortRankTrackerQualityRows(
    lensRows.filter((row) => rankTrackerQualityRowMatches(row, query)),
    query.sort,
  );
  const selectedKeywordIds = matchedRows.map(({ id }) => id).sort();
  const selected = new Set(selectedKeywordIds);
  const report = summarizeRankReport(
    resolutions.filter(({ id }) => selected.has(id)),
    policy,
  );
  return {
    evaluation: "shared_kernel" as const,
    facets: rankTrackerReportFacets(lensRows),
    locations,
    membership: {
      archived: "excluded" as const,
      pausedMarkets: "excluded" as const,
      pausedSchedules,
      scopeBasis: "current_membership_retained_history_as_of" as const,
    },
    policy,
    project,
    query,
    report,
    resolutions: resolutions.filter(({ id }) => selected.has(id)),
    rows: matchedRows,
    selectedKeywordIds,
    selectionDigest: report.selectionDigest,
    totalCount: candidates.rows.length,
  };
}

/** Export and list share the same selector without starting a nested transaction. */
export async function selectRankTrackerReportKeywordsInTransaction(
  tx: Prisma.TransactionClient,
  context: RankReportContext,
  input: RankTrackerListQueryInput,
  options: RankTrackerReportOptions,
) {
  return readRankTrackerReportSelection(
    tx,
    prepareRankTrackerReportSelection(context, input, options),
  );
}
export async function selectRankTrackerReportKeywords(
  context: RankReportContext,
  input: RankTrackerListQueryInput,
  options: RankTrackerReportOptions,
) {
  const plan = prepareRankTrackerReportSelection(context, input, options);
  const db = options.db ?? prisma;
  return db.$transaction((tx) => readRankTrackerReportSelection(tx, plan), {
    ...REPORT_READ_TRANSACTION,
  });
}
